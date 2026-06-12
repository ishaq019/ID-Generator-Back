const { google } = require("googleapis");

let driveClient = null;

const hasOAuthCredentials = () => {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
      process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  );
};

const getOAuthClient = () => {
  const {
    GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET,
    GOOGLE_DRIVE_REDIRECT_URI,
    GOOGLE_DRIVE_REFRESH_TOKEN
  } = process.env;

  if (
    !GOOGLE_DRIVE_CLIENT_ID ||
    !GOOGLE_DRIVE_CLIENT_SECRET ||
    !GOOGLE_DRIVE_REFRESH_TOKEN
  ) {
    throw new Error(
      "Google Drive OAuth credentials are missing. Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN."
    );
  }

  const auth = new google.auth.OAuth2(
    GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET,
    GOOGLE_DRIVE_REDIRECT_URI || "https://developers.google.com/oauthplayground"
  );

  auth.setCredentials({
    refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN
  });

  return auth;
};

const getServiceAccountCredentials = () => {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

      return {
        clientEmail: credentials.client_email,
        privateKey: credentials.private_key
      };
    } catch (error) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  }

  return {
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  };
};

const getJwtClient = () => {
  const { clientEmail, privateKey } = getServiceAccountCredentials();

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Google Drive credentials are missing. Set OAuth credentials or GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY."
    );
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"]
  });
};

const getGoogleDrive = () => {
  if (driveClient) {
    return driveClient;
  }

  const auth = hasOAuthCredentials() ? getOAuthClient() : getJwtClient();

  driveClient = google.drive({
    version: "v3",
    auth
  });

  return driveClient;
};

module.exports = getGoogleDrive;