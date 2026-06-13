const DIGIVAL_ADDRESS =
  "5th Floor Right Wing, Chennai Citi Centre,\nDr Radhakrishnan Salai, Mylapore,\nChennai - 600004, Tamil Nadu, India";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5175"
];

const parseList = value => {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
};

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return !["false", "0", "no", "off"].includes(String(value).toLowerCase());
};

const parseBytes = (value, fallback) => {
  const text = String(value || "").trim().toLowerCase();

  if (!text) return fallback;

  const match = text.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return fallback;

  const amount = Number(match[1]);
  const unit = match[2] || "b";
  const multipliers = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };

  return Math.round(amount * multipliers[unit]);
};

const parseMaxDimension = value => {
  const dimension = Number(value || 1024);

  if (!Number.isFinite(dimension)) {
    return 1024;
  }

  return Math.min(Math.max(Math.round(dimension), 256), 2048);
};

const getAppConfig = () => {
  const bgRemovalModel = String(
    process.env.BG_REMOVAL_MODEL || "small"
  ).toLowerCase();
  const corsOrigins = [
    ...DEFAULT_ALLOWED_ORIGINS,
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    ...parseList(process.env.CLIENT_URLS)
  ].filter(Boolean);

  return {
    allowedOrigins: [...new Set(corsOrigins)],
    requestBodyLimit: process.env.REQUEST_BODY_LIMIT || "25mb",
    uploadFileSizeLimitBytes: parseBytes(process.env.UPLOAD_FILE_SIZE_LIMIT, 5 * 1024 * 1024),
    googleFormPhotoMaxBytes: parseBytes(
      process.env.GOOGLE_FORM_PHOTO_MAX_SIZE,
      10 * 1024 * 1024
    ),
    googleFormWebhookSecret: process.env.WEBHOOK_SECRET || "",
    googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || "",
    digivalTemplateSlug:
      process.env.DIGIVAL_TEMPLATE_SLUG || "digival-employee-id-card",
    companyWebsite: process.env.COMPANY_WEBSITE || "www.digi-val.com",
    companyAddress: process.env.COMPANY_ADDRESS
      ? process.env.COMPANY_ADDRESS.replace(/\\n/g, "\n")
      : DIGIVAL_ADDRESS,
    backgroundRemovalEnabled: parseBoolean(
      process.env.BACKGROUND_REMOVAL_ENABLED,
      true
    ),
    googleFormRemoveBg: parseBoolean(process.env.GOOGLE_FORM_REMOVE_BG, true),
    bgRemovalModel: ["small", "medium"].includes(bgRemovalModel)
      ? bgRemovalModel
      : "small",
    bgRemovalMaxDimension: parseMaxDimension(process.env.BG_REMOVAL_MAX_DIMENSION)
  };
};

module.exports = {
  DIGIVAL_ADDRESS,
  getAppConfig
};
