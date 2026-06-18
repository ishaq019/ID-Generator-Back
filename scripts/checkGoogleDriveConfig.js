const crypto = require("crypto");
const mongoose = require("mongoose");
const { google } = require("googleapis");
const AppSetting = require("../models/AppSetting");
const {
  APP_SETTINGS_KEY,
  getRuntimeAppConfig,
} = require("../utils/appConfig");

require("dotenv").config();

const fingerprint = value => {
  if (!value) return "";

  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, 12);
};

const summarizeSecret = value => {
  const text = String(value || "");

  return {
    present: Boolean(text),
    length: text.length,
    fingerprint: fingerprint(text),
  };
};

const findConfiguredKey = (doc, keys) => {
  const containers = [
    doc,
    doc?.settings,
    doc?.config,
    doc?.values,
    doc?.data,
    doc?.value,
  ].filter(container => container && typeof container === "object");

  for (const container of containers) {
    for (const key of keys) {
      if (
        Object.prototype.hasOwnProperty.call(container, key) &&
        container[key]
      ) {
        return key;
      }
    }
  }

  return "";
};

const inspectMongoSettings = async () => {
  const doc = await AppSetting.findOne({ key: APP_SETTINGS_KEY }).lean();

  if (!doc) {
    return {
      found: false,
    };
  }

  return {
    found: true,
    rootKeys: Object.keys(doc).sort(),
    detectedKeys: {
      folderId: findConfiguredKey(doc, [
        "GOOGLE_DRIVE_FOLDER_ID",
        "googleDriveFolderId",
        "google_drive_folder_id",
      ]),
      clientId: findConfiguredKey(doc, [
        "GOOGLE_DRIVE_CLIENT_ID",
        "googleDriveClientId",
        "google_drive_client_id",
      ]),
      clientSecret: findConfiguredKey(doc, [
        "GOOGLE_DRIVE_CLIENT_SECRET",
        "googleDriveClientSecret",
        "google_drive_client_secret",
      ]),
      redirectUri: findConfiguredKey(doc, [
        "GOOGLE_DRIVE_REDIRECT_URI",
        "GOOGLE_DRIVE_REDIRECT_UR",
        "GOOGLE_DRIVE_REDIRECT_URL",
        "googleDriveRedirectUri",
        "googleDriveRedirectUr",
        "googleDriveRedirectUrl",
        "google_drive_redirect_uri",
        "google_drive_redirect_ur",
        "google_drive_redirect_url",
      ]),
      refreshToken: findConfiguredKey(doc, [
        "GOOGLE_DRIVE_REFRESH_TOKEN",
        "googleDriveRefreshToken",
        "google_drive_refresh_token",
      ]),
    },
  };
};

const testOAuthRefresh = async config => {
  const auth = new google.auth.OAuth2(
    config.googleDriveClientId,
    config.googleDriveClientSecret,
    config.googleDriveRedirectUri,
  );

  auth.setCredentials({
    refresh_token: config.googleDriveRefreshToken,
  });

  try {
    const tokenResponse = await auth.getAccessToken();

    return {
      ok: Boolean(tokenResponse?.token),
    };
  } catch (error) {
    return {
      ok: false,
      status: error.response?.status || error.code || null,
      error: error.response?.data?.error || error.message,
      errorDescription: error.response?.data?.error_description || "",
    };
  }
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing");
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const [mongoSettings, config] = await Promise.all([
      inspectMongoSettings(),
      getRuntimeAppConfig(),
    ]);

    console.log("Mongo settings:", mongoSettings);
    console.log("Resolved Drive config:", {
      folderId: summarizeSecret(config.googleDriveFolderId),
      clientId: summarizeSecret(config.googleDriveClientId),
      clientSecret: summarizeSecret(config.googleDriveClientSecret),
      redirectUri: summarizeSecret(config.googleDriveRedirectUri),
      refreshToken: summarizeSecret(config.googleDriveRefreshToken),
    });

    if (
      config.googleDriveClientId &&
      config.googleDriveClientSecret &&
      config.googleDriveRefreshToken
    ) {
      console.log("OAuth refresh test:", await testOAuthRefresh(config));
    } else {
      console.log("OAuth refresh test: skipped because OAuth fields are missing.");
    }
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(async error => {
  console.error("Google Drive config check failed:", error.message);

  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }

  process.exit(1);
});
