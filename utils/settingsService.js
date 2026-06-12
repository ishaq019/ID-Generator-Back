const Setting = require("../models/Setting");

const SETTINGS_KEY = "app-settings";

const DEFAULT_SETTINGS = {
  key: SETTINGS_KEY,
  googleFormUrl: "",
  googleFormAppsScriptUrl: "",
  googleFormWebhookSecret: "",
  googleDriveFolderId: "",
  digivalTemplateSlug: "digival-employee-id-card",
  companyWebsite: "www.digi-val.com",
  companyAddress:
    "5th Floor Right Wing, Chennai Citi Centre,\nDr Radhakrishnan Salai, Mylapore,\nChennai - 600004, Tamil Nadu, India",
  backgroundRemovalEnabled: true,
  googleFormRemoveBg: true,
  bgRemovalModel: "small",
  bgRemovalMaxDimension: 1024
};

const ALLOWED_UPDATE_FIELDS = [
  "googleFormUrl",
  "googleFormAppsScriptUrl",
  "googleFormWebhookSecret",
  "googleDriveFolderId",
  "digivalTemplateSlug",
  "companyWebsite",
  "companyAddress",
  "backgroundRemovalEnabled",
  "googleFormRemoveBg",
  "bgRemovalModel",
  "bgRemovalMaxDimension"
];

const normalizeSettingsUpdate = data => {
  const normalizedData = { ...data };

  if (Object.prototype.hasOwnProperty.call(normalizedData, "bgRemovalModel")) {
    const model = String(normalizedData.bgRemovalModel || "small").toLowerCase();
    normalizedData.bgRemovalModel = ["small", "medium"].includes(model)
      ? model
      : "small";
  }

  if (Object.prototype.hasOwnProperty.call(normalizedData, "bgRemovalMaxDimension")) {
    const dimension = Number(normalizedData.bgRemovalMaxDimension || 1024);
    normalizedData.bgRemovalMaxDimension = Number.isFinite(dimension)
      ? Math.min(Math.max(Math.round(dimension), 256), 2048)
      : 1024;
  }

  return normalizedData;
};

const getAppSettings = async () => {
  return Setting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $setOnInsert: DEFAULT_SETTINGS },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );
};

const updateAppSettings = async data => {
  const normalizedData = normalizeSettingsUpdate(data || {});
  const updateData = {};

  ALLOWED_UPDATE_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(normalizedData, field)) {
      updateData[field] = normalizedData[field];
    }
  });

  return Setting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: updateData,
      $setOnInsert: {
        key: SETTINGS_KEY
      }
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );
};

module.exports = {
  getAppSettings,
  updateAppSettings
};
