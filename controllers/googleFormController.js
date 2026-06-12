const Template = require("../models/Template");
const GeneratedCard = require("../models/GeneratedCard");
const { sendIdCardSubmissionEmail } = require("../utils/emailService");
const { uploadBufferToDrive } = require("../utils/googleDriveStorage");
const { removeBackgroundFromUpload } = require("../utils/backgroundRemoval");
const { getAppSettings } = require("../utils/settingsService");

const DIGIVAL_ADDRESS =
  "5th Floor Right Wing, Chennai Citi Centre,\nDr Radhakrishnan Salai, Mylapore,\nChennai - 600004, Tamil Nadu, India";

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
    "photoDataUrl",
    "photoDataURL",
    "imageBase64",
    "Photo Base64",
    "Photo Data URL",
  ],
  photoMimeType: ["photoMimeType", "mimeType", "Photo MIME Type"],
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
    photoMimeType: getBodyValue(body, "photoMimeType") || "image/png",
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

const buildGoogleFormPhotoFile = (payload) => {
  let photoMimeType = payload.photoMimeType || "image/png";
  let photoBase64 = String(payload.photoBase64 || "").trim();

  const dataUrlMatch = photoBase64.match(
    /^data:(image\/[\w.+-]+);base64,(.+)$/is,
  );

  if (dataUrlMatch) {
    photoMimeType = dataUrlMatch[1];
    photoBase64 = dataUrlMatch[2];
  }

  if (!String(photoMimeType).toLowerCase().startsWith("image/")) {
    const error = new Error("Google Form photo must be an image");
    error.statusCode = 400;
    throw error;
  }

  const cleanBase64 = photoBase64.replace(/\s/g, "");
  const buffer = Buffer.from(cleanBase64, "base64");

  if (!buffer.length) {
    const error = new Error("Google Form photo could not be decoded");
    error.statusCode = 400;
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
    size: buffer.length,
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
    ["photoBase64", payload.photoBase64],
  ]
    .filter(([, value]) => !value)
    .map(([field]) => field);
};

const sendConfirmationForExistingCard = async (card) => {
  await sendIdCardSubmissionEmail({
    to: card.recipientEmail,
    employeeName: card.formData?.name || "Employee",
  });

  card.emailStatus = "sent";
  card.emailSentAt = new Date();
  card.emailError = "";
  await card.save();

  return card;
};

exports.createDigivalCardFromGoogleForm = async (req, res, next) => {
  try {
    const settings = await getAppSettings();

    const expectedWebhookSecret =
      settings.googleFormWebhookSecret || process.env.WEBHOOK_SECRET;

    if (!expectedWebhookSecret) {
      return res.status(500).json({
        message:
          "Google Form webhook secret is not configured. Add it in Settings or WEBHOOK_SECRET env.",
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
      if (["pending", "failed"].includes(existingCard.emailStatus)) {
        try {
          const emailedCard =
            await sendConfirmationForExistingCard(existingCard);

          return res.status(200).json({
            message:
              "This Google Form submission was already saved; confirmation email was resent successfully",
            card: emailedCard,
          });
        } catch (emailError) {
          existingCard.emailStatus = "failed";
          existingCard.emailError = emailError.message;
          await existingCard.save();

          return res.status(502).json({
            message:
              "This Google Form submission was already saved, but confirmation email retry failed",
            error: emailError.message,
            card: existingCard,
          });
        }
      }

      return res.status(200).json({
        message: "This Google Form submission was already processed",
        card: existingCard,
      });
    }

    const templateSlug =
      settings.digivalTemplateSlug ||
      process.env.DIGIVAL_TEMPLATE_SLUG ||
      "digival-employee-id-card";
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
      const originalPhotoFile = buildGoogleFormPhotoFile(payload);

      const safeEmployeeId = String(payload.employeeId || "employee")
        .replace(/[^\w.-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const stablePhotoName = `${safeEmployeeId || "employee"}-photo.png`;
      const shouldRemoveBg =
        settings.backgroundRemovalEnabled !== false &&
        settings.googleFormRemoveBg !== false &&
        process.env.GOOGLE_FORM_REMOVE_BG !== "false";

      const photoFile = shouldRemoveBg
        ? await removeBackgroundFromUpload(originalPhotoFile, {
            fileName: stablePhotoName,
            model: settings.bgRemovalModel,
            maxDimension: settings.bgRemovalMaxDimension,
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
        message: "Google Form photo could not be saved to Google Drive",
        error: uploadError.message,
      });
    }

    const formData = {
      name: payload.name,
      employeeId: payload.employeeId,
      bloodGroup: payload.bloodGroup,
      phone: payload.phone,
      email: payload.email,
      address: settings.companyAddress || DIGIVAL_ADDRESS,
      website: settings.companyWebsite || "www.digi-val.com",
      photo: uploadedPhoto.imageUrl,
      photoDriveFileId: uploadedPhoto.fileId,
    };

    const card = await GeneratedCard.create({
      templateId: template._id,
      formData,
      photo: uploadedPhoto.imageUrl,
      qrData: "STATIC_DIGIVAL_QR",
      recipientEmail: payload.email,
      emailStatus: "pending",
      source: "google-form",
      googleSubmissionId: payload.submissionId || "",
      uploadsPersisted: true,
      templateSnapshot: template.toObject(),
    });

    try {
      await sendIdCardSubmissionEmail({
        to: payload.email,
        employeeName: payload.name,
      });

      card.emailStatus = "sent";
      card.emailSentAt = new Date();
      card.emailError = "";
      await card.save();
    } catch (emailError) {
      card.emailStatus = "failed";
      card.emailError = emailError.message;
      await card.save();

      return res.status(502).json({
        message:
          "Google Form data was saved and ID card is available on website, but confirmation email sending failed",
        error: emailError.message,
        card,
      });
    }

    res.status(201).json({
      message:
        "Google Form data saved successfully. ID card is available on website and confirmation email sent.",
      card,
    });
  } catch (error) {
    next(error);
  }
};
