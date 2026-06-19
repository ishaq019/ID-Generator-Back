const mongoose = require("mongoose");
const AppSetting = require("../models/AppSetting");

const APP_SETTINGS_KEY = "app-settings";
const DIGIVAL_ADDRESS =
  "5th Floor Right Wing, Chennai Citi Centre,\nDr Radhakrishnan Salai, Mylapore,\nChennai - 600004, Tamil Nadu, India";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5175"
];
const SETTING_ALIASES = {
  AUTH_SECRET: ["authSecret", "auth_secret"],
  ADMIN_USERNAME: ["adminUsername", "admin_username"],
  ADMIN_PASSWORD: ["adminPassword", "admin_password"],
  CLIENT_URL: ["clientUrl", "client_url"],
  CLIENT_URLS: ["clientUrls", "client_urls"],
  FRONTEND_URL: ["frontendUrl", "frontend_url"],
  WEBHOOK_SECRET: ["webhookSecret", "webhook_secret"],
  WEBHOOK_URL: ["webhookUrl", "webhook_url", "weebhook_url"],
  WEEBHOOK_URL: ["weebhookUrl", "weebhook_url", "webhook_url"],
  GOOGLE_DRIVE_FOLDER_ID: ["googleDriveFolderId", "google_drive_folder_id"],
  GOOGLE_DRIVE_CLIENT_ID: ["googleDriveClientId", "google_drive_client_id"],
  GOOGLE_DRIVE_CLIENT_SECRET: [
    "googleDriveClientSecret",
    "google_drive_client_secret"
  ],
  GOOGLE_DRIVE_REDIRECT_URI: [
    "googleDriveRedirectUri",
    "google_drive_redirect_uri",
    "GOOGLE_DRIVE_REDIRECT_UR",
    "googleDriveRedirectUr",
    "google_drive_redirect_ur",
    "GOOGLE_DRIVE_REDIRECT_URL",
    "googleDriveRedirectUrl",
    "google_drive_redirect_url"
  ],
  GOOGLE_DRIVE_REFRESH_TOKEN: [
    "googleDriveRefreshToken",
    "google_drive_refresh_token"
  ],
  REQUEST_BODY_LIMIT: ["requestBodyLimit", "request_body_limit"],
  UPLOAD_FILE_SIZE_LIMIT: ["uploadFileSizeLimit", "upload_file_size_limit"],
  GOOGLE_FORM_PHOTO_MAX_SIZE: [
    "googleFormPhotoMaxSize",
    "google_form_photo_max_size"
  ],
  DIGIVAL_TEMPLATE_SLUG: ["digivalTemplateSlug", "digival_template_slug"],
  COMPANY_WEBSITE: ["companyWebsite", "company_website"],
  COMPANY_ADDRESS: ["companyAddress", "company_address"],
  BACKGROUND_REMOVAL_ENABLED: [
    "backgroundRemovalEnabled",
    "background_removal_enabled"
  ],
  GOOGLE_FORM_REMOVE_BG: ["googleFormRemoveBg", "google_form_remove_bg"],
  GOOGLE_FORM_BG_REMOVAL_MODE: [
    "googleFormBgRemovalMode",
    "google_form_bg_removal_mode"
  ],
  BG_REMOVAL_FALLBACK_ENABLED: [
    "bgRemovalFallbackEnabled",
    "bg_removal_fallback_enabled"
  ],
  BG_REMOVAL_MODEL: ["bgRemovalModel", "bg_removal_model"],
  BG_REMOVAL_MAX_DIMENSION: [
    "bgRemovalMaxDimension",
    "bg_removal_max_dimension"
  ],
  BG_REMOVAL_TIMEOUT_MS: ["bgRemovalTimeoutMs", "bg_removal_timeout_ms"],
  GOOGLE_CLIENT_EMAIL: ["googleClientEmail", "google_client_email"],
  GOOGLE_PRIVATE_KEY: ["googlePrivateKey", "google_private_key"],
  GOOGLE_SERVICE_ACCOUNT_JSON: [
    "googleServiceAccountJson",
    "google_service_account_json"
  ]
};

let cachedSettings = null;
let cachedSettingsAt = 0;
const SETTINGS_CACHE_MS = 30 * 1000;

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

const parseMaxDimension = (value, fallback = 1024) => {
  const dimension = Number(value || fallback);

  if (!Number.isFinite(dimension)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(dimension), 256), 2048);
};

const parseTimeoutMs = (value, fallback = 22000) => {
  const timeoutMs = Number(value || fallback);

  if (!Number.isFinite(timeoutMs)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(timeoutMs), 5000), 28000);
};

const parseGoogleFormBgRemovalMode = (value, fallback) => {
  const mode = String(value || "")
    .trim()
    .toLowerCase();

  if (!mode) return fallback;

  if (["ml", "solid", "none"].includes(mode)) {
    return mode;
  }

  if (["false", "0", "no", "off"].includes(mode)) {
    return "none";
  }

  return fallback;
};

const hasConfiguredValue = (source, key) => {
  return (
    Object.prototype.hasOwnProperty.call(source || {}, key) &&
    source[key] !== undefined &&
    source[key] !== null &&
    source[key] !== ""
  );
};

const flattenSettingsSource = (settings = {}) => {
  const nestedSettingKeys = ["settings", "config", "values", "data", "value"];
  const flattenedSettings = {};

  for (const nestedKey of nestedSettingKeys) {
    const nestedValue = settings?.[nestedKey];

    if (
      nestedValue &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue)
    ) {
      Object.assign(flattenedSettings, nestedValue);
    }
  }

  Object.assign(flattenedSettings, settings);

  return flattenedSettings;
};

const readSetting = (settings, key) => {
  const keys = [key, ...(SETTING_ALIASES[key] || [])];
  const normalizedSettings = flattenSettingsSource(settings);

  for (const candidateKey of keys) {
    if (hasConfiguredValue(normalizedSettings, candidateKey)) {
      return normalizedSettings[candidateKey];
    }
  }

  for (const candidateKey of keys) {
    if (hasConfiguredValue(process.env, candidateKey)) {
      return process.env[candidateKey];
    }
  }

  return "";
};

const readSettingList = (settings, key) => {
  return parseList(readSetting(settings, key));
};

const readEnvOverrideSetting = (settings, key) => {
  if (hasConfiguredValue(process.env, key)) {
    return process.env[key];
  }

  return readSetting(settings, key);
};

const isHostedRuntime = () => {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.DYNO) ||
    Boolean(process.env.HEROKU)
  );
};

const buildAppConfig = (settings = {}) => {
  const bgRemovalModel = String(
    readSetting(settings, "BG_REMOVAL_MODEL") || "small"
  ).toLowerCase();
  const hostedRuntime = isHostedRuntime();
  const backgroundRemovalDefault = true;
  const bgRemovalMaxDimensionDefault = hostedRuntime ? 768 : 1024;
  const googleFormBgRemovalModeDefault = hostedRuntime ? "solid" : "ml";
  const corsOrigins = [
    ...DEFAULT_ALLOWED_ORIGINS,
    readSetting(settings, "CLIENT_URL"),
    readSetting(settings, "FRONTEND_URL"),
    ...readSettingList(settings, "CLIENT_URLS")
  ].filter(Boolean);

  return {
    allowedOrigins: [...new Set(corsOrigins)],
    requestBodyLimit: readSetting(settings, "REQUEST_BODY_LIMIT") || "50mb",
    uploadFileSizeLimitBytes: parseBytes(
      readSetting(settings, "UPLOAD_FILE_SIZE_LIMIT"),
      5 * 1024 * 1024
    ),
    googleFormPhotoMaxBytes: parseBytes(
      readSetting(settings, "GOOGLE_FORM_PHOTO_MAX_SIZE"),
      10 * 1024 * 1024
    ),
    googleFormWebhookSecret: readSetting(settings, "WEBHOOK_SECRET"),
    authSecret: readSetting(settings, "AUTH_SECRET"),
    adminUsername: readSetting(settings, "ADMIN_USERNAME"),
    adminPassword: readSetting(settings, "ADMIN_PASSWORD"),
    webhookUrl:
      readSetting(settings, "WEBHOOK_URL") ||
      readSetting(settings, "WEEBHOOK_URL"),
    googleDriveFolderId: readSetting(settings, "GOOGLE_DRIVE_FOLDER_ID"),
    googleDriveClientId: readSetting(settings, "GOOGLE_DRIVE_CLIENT_ID"),
    googleDriveClientSecret: readSetting(
      settings,
      "GOOGLE_DRIVE_CLIENT_SECRET"
    ),
    googleDriveRedirectUri:
      readSetting(settings, "GOOGLE_DRIVE_REDIRECT_URI") ||
      "https://developers.google.com/oauthplayground",
    googleDriveRefreshToken: readSetting(
      settings,
      "GOOGLE_DRIVE_REFRESH_TOKEN"
    ),
    googleClientEmail: readSetting(settings, "GOOGLE_CLIENT_EMAIL"),
    googlePrivateKey: readSetting(settings, "GOOGLE_PRIVATE_KEY"),
    googleServiceAccountJson: readSetting(
      settings,
      "GOOGLE_SERVICE_ACCOUNT_JSON"
    ),
    digivalTemplateSlug:
      readSetting(settings, "DIGIVAL_TEMPLATE_SLUG") ||
      "digival-employee-id-card",
    companyWebsite:
      readSetting(settings, "COMPANY_WEBSITE") || "www.digi-val.com",
    companyAddress: readSetting(settings, "COMPANY_ADDRESS")
      ? readSetting(settings, "COMPANY_ADDRESS").replace(/\\n/g, "\n")
      : DIGIVAL_ADDRESS,
    backgroundRemovalEnabled: parseBoolean(
      readEnvOverrideSetting(settings, "BACKGROUND_REMOVAL_ENABLED"),
      backgroundRemovalDefault
    ),
    googleFormRemoveBg: parseBoolean(
      readEnvOverrideSetting(settings, "GOOGLE_FORM_REMOVE_BG"),
      backgroundRemovalDefault
    ),
    googleFormBgRemovalMode: parseGoogleFormBgRemovalMode(
      readEnvOverrideSetting(settings, "GOOGLE_FORM_BG_REMOVAL_MODE"),
      googleFormBgRemovalModeDefault
    ),
    bgRemovalFallbackEnabled: parseBoolean(
      readEnvOverrideSetting(settings, "BG_REMOVAL_FALLBACK_ENABLED"),
      true
    ),
    bgRemovalModel: ["small", "medium"].includes(bgRemovalModel)
      ? bgRemovalModel
      : "small",
    bgRemovalMaxDimension: parseMaxDimension(
      readSetting(settings, "BG_REMOVAL_MAX_DIMENSION"),
      bgRemovalMaxDimensionDefault
    ),
    bgRemovalTimeoutMs: parseTimeoutMs(
      readSetting(settings, "BG_REMOVAL_TIMEOUT_MS")
    )
  };
};

const getMongoAppSettings = async () => {
  if (mongoose.connection.readyState !== 1) {
    return {};
  }

  if (cachedSettings && Date.now() - cachedSettingsAt < SETTINGS_CACHE_MS) {
    return cachedSettings;
  }

  try {
    const settings = await AppSetting.findOne({ key: APP_SETTINGS_KEY }).lean();
    cachedSettings = settings || {};
    cachedSettingsAt = Date.now();
    return cachedSettings;
  } catch (error) {
    console.warn("Could not read Mongo app settings, using env fallback.");
    return {};
  }
};

const getAppConfig = () => {
  return buildAppConfig();
};

const getRuntimeAppConfig = async () => {
  return buildAppConfig(await getMongoAppSettings());
};

module.exports = {
  APP_SETTINGS_KEY,
  DIGIVAL_ADDRESS,
  getAppConfig,
  getRuntimeAppConfig
};
