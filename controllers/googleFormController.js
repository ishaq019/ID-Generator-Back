const Template = require("../models/Template");
const GeneratedCard = require("../models/GeneratedCard");
const {
  downloadDriveFileAsBuffer,
  getDriveFileMetadata,
  uploadBufferToDrive
} = require("../utils/googleDriveStorage");
const { removeBackgroundFromUpload } = require("../utils/backgroundRemoval");
const { getAppConfig } = require("../utils/appConfig");

const FIELD_ALIASES = {
  name: [
    "name",
    "employeeName",
    "fullName",
    "Name",
    "Employee Name",
    "Full Name",
  ],
  employeeId: [
    "employeeId",
    "employeeID",
    "employee_id",
    "empId",
    "empID",
    "idNumber",
    "Employee ID",
    "Emp ID",
    "ID Number",
  ],
  bloodGroup: ["bloodGroup", "blood_group", "Blood Group", "Bloodgroup"],
  phone: [
    "phone",
    "phoneNumber",
    "mobile",
    "mobileNumber",
    "contactNumber",
    "Phone",
    "Phone Number",
    "Mobile Number",
    "Contact Number",
  ],
  email: ["email", "emailAddress", "Email", "Email Address"],
  photoFileId: [
    "photoFileId",
    "photoDriveFileId",
    "driveFileId",
    "fileId",
    "Photo File ID",
    "Photo Drive File ID",
  ],
  submissionId: [
    "submissionId",
    "googleSubmissionId",
    "responseId",
    "rowNumber",
    "Timestamp",
    "timestamp",
  ],
};

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const normalizeLookupKey = (key) => {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
};

const normalizeScalar = (value) => {
  if (Array.isArray(value)) {
    return normalizeScalar(value[0]);
  }

  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

const getValueFromSource = (source, aliases) => {
  if (!source || typeof source !== "object") return "";

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) {
      return normalizeScalar(source[alias]);
    }
  }

  const normalizedKeyMap = new Map(
    Object.keys(source).map((key) => [normalizeLookupKey(key), key]),
  );

  for (const alias of aliases) {
    const actualKey = normalizedKeyMap.get(normalizeLookupKey(alias));

    if (actualKey) {
      return normalizeScalar(source[actualKey]);
    }
  }

  return "";
};

const getBodyValue = (body, key) => {
  const aliases = FIELD_ALIASES[key] || [key];
  const sources = [body, body?.formData, body?.namedValues];

  for (const source of sources) {
    const value = getValueFromSource(source, aliases);

    if (value) return value;
  }

  return "";
};

const normalizeGoogleFormPayload = (body) => {
  return {
    name: getBodyValue(body, "name"),
    employeeId: getBodyValue(body, "employeeId"),
    bloodGroup: getBodyValue(body, "bloodGroup"),
    phone: getBodyValue(body, "phone"),
    email: getBodyValue(body, "email").toLowerCase(),
    photoFileId: getBodyValue(body, "photoFileId"),
    submissionId: getBodyValue(body, "submissionId"),
  };
};

const getPhotoExtension = (mimeType) => {
  const extensions = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  return extensions[String(mimeType || "").toLowerCase()] || "png";
};

const buildGoogleFormPhotoFile = async (payload, appConfig) => {
  const photoFileId = String(payload.photoFileId || "").trim();

  if (!/^[a-zA-Z0-9_-]+$/.test(photoFileId)) {
    const error = new Error("Google Form photoFileId is invalid");
    error.statusCode = 400;
    throw error;
  }

  const metadata = await getDriveFileMetadata(photoFileId);
  const photoMimeType = metadata.mimeType || "application/octet-stream";
  const photoSize = Number(metadata.size || 0);

  if (!String(photoMimeType).toLowerCase().startsWith("image/")) {
    const error = new Error("Google Form photo must be an image");
    error.statusCode = 400;
    throw error;
  }

  if (photoSize > appConfig.googleFormPhotoMaxBytes) {
    const error = new Error("Google Form photo file is too large");
    error.statusCode = 413;
    throw error;
  }

  const { buffer } = await downloadDriveFileAsBuffer(photoFileId, metadata);

  if (!buffer.length) {
    const error = new Error("Google Form photo file is empty");
    error.statusCode = 400;
    throw error;
  }

  if (buffer.length > appConfig.googleFormPhotoMaxBytes) {
    const error = new Error("Google Form photo file is too large");
    error.statusCode = 413;
    throw error;
  }

  const safeEmployeeId = String(payload.employeeId || "employee")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const extension = getPhotoExtension(photoMimeType);

  return {
    fieldname: "photo",
    originalname: `${safeEmployeeId || "employee"}-photo.${extension}`,
    mimetype: photoMimeType,
    size: Number(metadata.size || buffer.length),
    buffer,
  };
};

const getMissingFields = (payload) => {
  return [
    ["name", payload.name],
    ["employeeId", payload.employeeId],
    ["bloodGroup", payload.bloodGroup],
    ["phone", payload.phone],
    ["email", payload.email],
    ["photoFileId", payload.photoFileId],
  ]
    .filter(([, value]) => !value)
    .map(([field]) => field);
};

exports.createDigivalCardFromGoogleForm = async (req, res, next) => {
  try {
    const appConfig = getAppConfig();

    const expectedWebhookSecret = appConfig.googleFormWebhookSecret;

    if (!expectedWebhookSecret) {
      return res.status(500).json({
        message:
          "Google Form webhook secret is not configured. Add WEBHOOK_SECRET in env.",
      });
    }

    const secret = String(req.headers["x-webhook-secret"] || "");

    if (secret !== expectedWebhookSecret) {
      return res.status(401).json({ message: "Invalid webhook secret" });
    }

    const payload = normalizeGoogleFormPayload(req.body);
    const missingFields = getMissingFields(payload);

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Missing required Google Form fields",
        missingFields,
      });
    }

    if (!isValidEmail(payload.email)) {
      return res.status(400).json({
        message: "Invalid email address",
      });
    }

    const existingCard = payload.submissionId
      ? await GeneratedCard.findOne({
          googleSubmissionId: payload.submissionId,
        })
      : null;

    if (existingCard) {
      return res.status(200).json({
        message: "This Google Form submission was already processed",
        card: existingCard,
      });
    }

    const templateSlug = appConfig.digivalTemplateSlug;
    const template =
      (await Template.findOne({ slug: templateSlug })) ||
      (await Template.findOne({ layoutKey: "digival" }));

    if (!template) {
      return res.status(404).json({
        message: "DigiVal template not found",
      });
    }

    let uploadedPhoto;

    try {
      const originalPhotoFile = await buildGoogleFormPhotoFile(
        payload,
        appConfig
      );

      const safeEmployeeId = String(payload.employeeId || "employee")
        .replace(/[^\w.-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const stablePhotoName = `${safeEmployeeId || "employee"}-photo.png`;
      const shouldRemoveBg =
        appConfig.backgroundRemovalEnabled !== false &&
        appConfig.googleFormRemoveBg !== false;

      const photoFile = shouldRemoveBg
        ? await removeBackgroundFromUpload(originalPhotoFile, {
            fileName: stablePhotoName,
            model: appConfig.bgRemovalModel,
            maxDimension: appConfig.bgRemovalMaxDimension,
          })
        : {
            ...originalPhotoFile,
            driveFileName: stablePhotoName,
            originalname: stablePhotoName,
          };

      uploadedPhoto = await uploadBufferToDrive(photoFile, {
        fileName: stablePhotoName,
        replaceExisting: true,
      });
    } catch (uploadError) {
      return res.status(uploadError.statusCode || 502).json({
        message: "Google Form photo could not be read or saved to Google Drive",
        error: uploadError.message,
      });
    }

    const formData = {
      name: payload.name,
      employeeId: payload.employeeId,
      bloodGroup: payload.bloodGroup,
      phone: payload.phone,
      email: payload.email,
      address: appConfig.companyAddress,
      website: appConfig.companyWebsite,
      photo: uploadedPhoto.imageUrl,
      photoDriveFileId: uploadedPhoto.fileId,
    };

    const card = await GeneratedCard.create({
      templateId: template._id,
      formData,
      photo: uploadedPhoto.imageUrl,
      qrData: "STATIC_DIGIVAL_QR",
      source: "google-form",
      googleSubmissionId: payload.submissionId || "",
      uploadsPersisted: true,
      templateSnapshot: template.toObject(),
    });

    res.status(201).json({
      message:
        "Google Form data saved successfully. ID card is available on website.",
      card,
    });
  } catch (error) {
    next(error);
  }
};
