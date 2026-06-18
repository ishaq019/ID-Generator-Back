const Template = require("../models/Template");
const GeneratedCard = require("../models/GeneratedCard");
const {
  uploadBufferToDrive,
  downloadDriveFileAsBuffer,
  sanitizeFileName,
} = require("../utils/googleDriveStorage");
const { removeBackgroundFromUpload } = require("../utils/backgroundRemoval");
const { getRuntimeAppConfig } = require("../utils/appConfig");

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
  photoBase64: [
    "photoBase64",
    "photo_base64",
    "imageBase64",
    "image_base64",
    "Photo Base64",
    "Image Base64",
  ],
  photoFileId: [
    "photoFileId",
    "photo_file_id",
    "imageFileId",
    "image_file_id",
    "driveFileId",
    "googleDriveFileId",
    "photoDriveFileId",
    "fileId",
    "photoFileUrl",
    "photo_file_url",
    "photoUrl",
    "photo_url",
    "driveFileUrl",
    "googleDriveFileUrl",
    "Photo File ID",
    "Image File ID",
    "Google Drive File ID",
    "Photo File URL",
    "Photo URL",
    "Google Drive File URL",
  ],
  photoMimeType: [
    "photoMimeType",
    "photo_mime_type",
    "mimeType",
    "mime_type",
    "Photo Mime Type",
    "Image Mime Type",
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
    photoBase64: getBodyValue(body, "photoBase64"),
    photoFileId: getBodyValue(body, "photoFileId"),
    photoMimeType: getBodyValue(body, "photoMimeType"),
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

const stripBase64Prefix = value => {
  return String(value || "")
    .replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "")
    .replace(/\s/g, "");
};

const getSafeEmployeeId = employeeId => {
  return (
    String(employeeId || "employee")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "employee"
  );
};

const extractDriveFileId = value => {
  const text = String(value || "").trim();

  if (!text) return "";

  const patterns = [
    /[?&]id=([a-zA-Z0-9_-]{20,})/,
    /\/d\/([a-zA-Z0-9_-]{20,})/,
    /open\?id=([a-zA-Z0-9_-]{20,})/,
    /file\/d\/([a-zA-Z0-9_-]{20,})/,
    /^([a-zA-Z0-9_-]{20,})$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match[1] || match[0];
    }
  }

  return "";
};

const assertGoogleFormPhotoSize = (size, appConfig) => {
  if (size > appConfig.googleFormPhotoMaxBytes) {
    const error = new Error("Google Form photo file is too large");
    error.statusCode = 413;
    throw error;
  }
};

const buildGoogleFormPhotoFileFromBase64 = (payload, appConfig) => {
  const photoMimeType = String(payload.photoMimeType || "image/png")
    .trim()
    .toLowerCase();

  if (!photoMimeType.startsWith("image/")) {
    const error = new Error("Google Form photo must be an image");
    error.statusCode = 400;
    throw error;
  }

  const photoBase64 = stripBase64Prefix(payload.photoBase64);

  if (!photoBase64 || !/^[a-zA-Z0-9+/=]+$/.test(photoBase64)) {
    const error = new Error("Google Form photoBase64 is invalid");
    error.statusCode = 400;
    throw error;
  }

  const estimatedBytes = Math.floor((photoBase64.length * 3) / 4);

  assertGoogleFormPhotoSize(estimatedBytes, appConfig);

  const buffer = Buffer.from(photoBase64, "base64");

  if (!buffer.length) {
    const error = new Error("Google Form photo file is empty");
    error.statusCode = 400;
    throw error;
  }

  assertGoogleFormPhotoSize(buffer.length, appConfig);

  const safeEmployeeId = getSafeEmployeeId(payload.employeeId);
  const extension = getPhotoExtension(photoMimeType);

  return {
    fieldname: "photo",
    originalname: `${safeEmployeeId || "employee"}-photo.${extension}`,
    mimetype: photoMimeType,
    size: buffer.length,
    buffer,
  };
};

const buildGoogleFormPhotoFileFromDrive = async (payload, appConfig) => {
  const photoFileId = extractDriveFileId(payload.photoFileId);

  if (!photoFileId) {
    const error = new Error("Google Form photoFileId is invalid");
    error.statusCode = 400;
    throw error;
  }

  const { buffer, metadata } = await downloadDriveFileAsBuffer(photoFileId);
  const photoMimeType = String(metadata?.mimeType || "")
    .trim()
    .toLowerCase();

  if (!photoMimeType.startsWith("image/")) {
    const error = new Error(
      "Google Drive file for Google Form photo must be an image",
    );
    error.statusCode = 400;
    throw error;
  }

  if (!buffer.length) {
    const error = new Error("Google Drive file for Google Form photo is empty");
    error.statusCode = 400;
    throw error;
  }

  assertGoogleFormPhotoSize(buffer.length, appConfig);

  const safeEmployeeId = getSafeEmployeeId(payload.employeeId);
  const extension = getPhotoExtension(photoMimeType);
  const originalname = sanitizeFileName(
    metadata?.name || `${safeEmployeeId}-photo.${extension}`,
  );

  return {
    fieldname: "photo",
    originalname,
    mimetype: photoMimeType,
    size: buffer.length,
    buffer,
  };
};

const buildGoogleFormPhotoFile = async (payload, appConfig) => {
  // Primary Google Sheet flow: Apps Script sends the Drive file ID only.
  if (payload.photoFileId) {
    return buildGoogleFormPhotoFileFromDrive(payload, appConfig);
  }

  // Legacy webhook fallback: older scripts sent the image bytes directly.
  if (payload.photoBase64) {
    return buildGoogleFormPhotoFileFromBase64(payload, appConfig);
  }

  const error = new Error(
    "Google Form payload must include photoFileId or photoBase64",
  );
  error.statusCode = 400;
  throw error;
};

const getMissingFields = (payload) => {
  const missingFields = [
    ["name", payload.name],
    ["employeeId", payload.employeeId],
    ["bloodGroup", payload.bloodGroup],
    ["phone", payload.phone],
    ["email", payload.email],
  ]
    .filter(([, value]) => !value)
    .map(([field]) => field);

  if (!payload.photoBase64 && !payload.photoFileId) {
    missingFields.push("photoBase64 or photoFileId");
  }

  return missingFields;
};

exports.createDigivalCardFromGoogleForm = async (req, res, next) => {
  try {
    const appConfig = await getRuntimeAppConfig();

    const expectedWebhookSecret = appConfig.googleFormWebhookSecret;

    if (!expectedWebhookSecret) {
      return res.status(500).json({
        message:
          "Google Form webhook secret is not configured. Add WEBHOOK_SECRET in MongoDB settings or env.",
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

      const safeEmployeeId = getSafeEmployeeId(payload.employeeId);
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
      const isDriveDownloadError = Boolean(uploadError.driveStatusCode);

      return res.status(uploadError.statusCode || 502).json({
        message: isDriveDownloadError
          ? "Google Form photoFileId could not be downloaded from Google Drive"
          : "Google Form photo could not be read or saved to Google Drive",
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
