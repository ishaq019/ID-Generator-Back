const { google } = require("googleapis");
const { getRuntimeAppConfig } = require("../utils/appConfig");

let driveClient = null;
let driveClientKey = "";

const getDriveClientKey = appConfig => {
  return [
    appConfig.googleDriveClientId,
    appConfig.googleDriveClientSecret,
    appConfig.googleDriveRedirectUri,
    appConfig.googleDriveRefreshToken,
    appConfig.googleClientEmail,
    appConfig.googlePrivateKey,
    appConfig.googleServiceAccountJson
  ].join("|");
};

const hasOAuthCredentials = appConfig => {
  return Boolean(
    appConfig.googleDriveClientId &&
      appConfig.googleDriveClientSecret &&
      appConfig.googleDriveRefreshToken
  );
};

const getOAuthClient = appConfig => {
  if (
    !appConfig.googleDriveClientId ||
    !appConfig.googleDriveClientSecret ||
    !appConfig.googleDriveRefreshToken
  ) {
    throw new Error(
      "Google Drive OAuth credentials are missing. Set them in MongoDB settings or env."
    );
  }

  const auth = new google.auth.OAuth2(
    appConfig.googleDriveClientId,
    appConfig.googleDriveClientSecret,
    appConfig.googleDriveRedirectUri
  );

  auth.setCredentials({
    refresh_token: appConfig.googleDriveRefreshToken
  });

  return auth;
};

const getServiceAccountCredentials = appConfig => {
  if (appConfig.googleServiceAccountJson) {
    try {
      const credentials = JSON.parse(appConfig.googleServiceAccountJson);

      return {
        clientEmail: credentials.client_email,
        privateKey: credentials.private_key
      };
    } catch (error) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  }

  return {
    clientEmail: appConfig.googleClientEmail,
    privateKey: appConfig.googlePrivateKey?.replace(/\\n/g, "\n")
  };
};

const getJwtClient = appConfig => {
  const { clientEmail, privateKey } = getServiceAccountCredentials(appConfig);

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Google Drive credentials are missing. Set OAuth credentials or service account credentials in MongoDB settings or env."
    );
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"]
  });
};

const getGoogleDrive = async () => {
  const appConfig = await getRuntimeAppConfig();
  const nextClientKey = getDriveClientKey(appConfig);

  if (driveClient && driveClientKey === nextClientKey) {
    return driveClient;
  }

  const auth = hasOAuthCredentials(appConfig)
    ? getOAuthClient(appConfig)
    : getJwtClient(appConfig);

  driveClient = google.drive({
    version: "v3",
    auth
  });
  driveClientKey = nextClientKey;

  return driveClient;
};

module.exports = getGoogleDrive;
