# Google API Setup for Drive Uploads and Google Form Photos

This guide explains how to configure the Google API values used by the backend:

```txt
GOOGLE_DRIVE_FOLDER_ID
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_REDIRECT_URI
GOOGLE_DRIVE_REFRESH_TOKEN
```

The recommended setup for this project is OAuth with a refresh token. The backend uses that refresh token to get short-lived Google access tokens whenever it needs to upload, replace, or download Drive files.

Official references:

- OAuth 2.0 refresh tokens: https://developers.google.com/identity/protocols/oauth2
- Google Drive API scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- OAuth client setup: https://support.google.com/cloud/answer/15549257
- OAuth Playground: https://developers.google.com/oauthplayground

## What Each Variable Means

```txt
GOOGLE_DRIVE_FOLDER_ID
```

The destination Google Drive folder where generated/uploaded files are saved.

```txt
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
```

The OAuth client credentials from Google Cloud. Create these as a `Web application` client.

```txt
GOOGLE_DRIVE_REDIRECT_URI
```

Use this value when generating a token through OAuth Playground:

```txt
https://developers.google.com/oauthplayground
```

```txt
GOOGLE_DRIVE_REFRESH_TOKEN
```

The long-lived token generated for the Google account that should read and write Drive files.

## Recommended Account Setup

Use one Google account as the backend Drive account.

That account must be able to:

1. Write files into `GOOGLE_DRIVE_FOLDER_ID`.
2. Read Google Form uploaded photos if Google Form automation is used.

For the simplest setup, create the output folder in the same Google account used to generate the refresh token.

## Step 1: Create or Select a Google Cloud Project

1. Open Google Cloud Console:

```txt
https://console.cloud.google.com
```

2. Select an existing project or create a new project.
3. Use a clear project name, for example:

```txt
ID Generator Drive API
```

## Step 2: Enable Google Drive API

1. In Google Cloud Console, open `APIs & Services`.
2. Open `Library`.
3. Search for:

```txt
Google Drive API
```

4. Open it and click `Enable`.

## Step 3: Configure OAuth Consent

1. Go to `APIs & Services` -> `OAuth consent screen`.
2. Choose the app user type:

```txt
Internal
```

Use this if you are inside a Google Workspace organization and only organization users need access.

```txt
External
```

Use this for a personal Gmail account or public Google accounts.

3. Fill in app name, user support email, and developer contact email.
4. Add yourself as a test user if the app is in Testing mode.
5. Add the Drive scope:

```txt
https://www.googleapis.com/auth/drive
```

This project uses Drive to create files, replace files, list files in the output folder, and download Google Form uploaded files. Google recommends choosing the narrowest scope possible, but this app's Google Form flow often needs full Drive access to read uploaded source photos and write output files.

For a private/internal deployment, Testing mode is usually enough. If refresh tokens expire often, move the OAuth app to Production or regenerate the refresh token.

## Step 4: Create OAuth Client ID and Secret

1. Go to `APIs & Services` -> `Credentials`.
2. Click `Create Credentials`.
3. Choose `OAuth client ID`.
4. Select application type:

```txt
Web application
```

5. Name it:

```txt
ID Generator Backend
```

6. In `Authorized redirect URIs`, add:

```txt
https://developers.google.com/oauthplayground
```

7. Click `Create`.
8. Copy these values immediately:

```txt
Client ID
Client secret
```

Google may only show/download a full client secret at creation time for newer OAuth clients. Store it safely.

## Step 5: Create the Drive Output Folder

1. Open Google Drive with the same Google account that will own the uploaded files.
2. Create a folder, for example:

```txt
ID Generator Uploads
```

3. Open the folder.
4. Copy the folder ID from the URL.

Example URL:

```txt
https://drive.google.com/drive/folders/1AbCDefGhIJkLmNoPQrStuVwxyz123456
```

Folder ID:

```txt
1AbCDefGhIJkLmNoPQrStuVwxyz123456
```

This becomes:

```txt
GOOGLE_DRIVE_FOLDER_ID=1AbCDefGhIJkLmNoPQrStuVwxyz123456
```

## Step 6: Generate the Refresh Token

Use OAuth Playground with your own OAuth client credentials. Do not use the default OAuth Playground credentials for this app, because Playground can revoke those refresh tokens after 24 hours.

1. Open:

```txt
https://developers.google.com/oauthplayground
```

2. Click the gear icon in the top-right.
3. Enable:

```txt
Use your own OAuth credentials
```

4. Paste:

```txt
OAuth Client ID     = GOOGLE_DRIVE_CLIENT_ID
OAuth Client secret = GOOGLE_DRIVE_CLIENT_SECRET
```

5. If visible, use these options:

```txt
Access type: offline
Prompt: consent
```

6. Close the settings panel.
7. In Step 1, enter this scope manually if it is not listed:

```txt
https://www.googleapis.com/auth/drive
```

8. Click `Authorize APIs`.
9. Sign in with the Google account that owns or can edit the Drive output folder.
10. Approve the permission request.
11. In Step 2, click:

```txt
Exchange authorization code for tokens
```

12. Copy:

```txt
Refresh token
```

Do not copy the access token into the backend config. Access tokens expire quickly. The backend needs the refresh token.

## Step 7: Configure the Backend

### Local `.env`

Add these values to `backend/.env`:

```txt
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_DRIVE_REDIRECT_URI=https://developers.google.com/oauthplayground
GOOGLE_DRIVE_REFRESH_TOKEN=1//your-refresh-token
```

Then restart the backend:

```bash
npm run dev
```

### Heroku Config Vars

In Heroku Dashboard:

1. Open the app.
2. Go to `Settings`.
3. Click `Reveal Config Vars`.
4. Add:

```txt
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_DRIVE_REDIRECT_URI=https://developers.google.com/oauthplayground
GOOGLE_DRIVE_REFRESH_TOKEN=1//your-refresh-token
```

5. Restart or redeploy the app.

Do not set `PORT`; Heroku provides it automatically.

### MongoDB `settings` Document

The backend reads MongoDB app settings first and environment variables second. If the MongoDB `settings` document contains old Google values, those old values override Heroku config vars.

Use only one source while debugging:

- Recommended for first deploy: Heroku config vars.
- If using MongoDB settings: keep the values there updated and do not expect `.env` or Heroku vars to override them.

MongoDB document example:

```json
{
  "key": "app-settings",
  "GOOGLE_DRIVE_FOLDER_ID": "your-folder-id",
  "GOOGLE_DRIVE_CLIENT_ID": "your-client-id.apps.googleusercontent.com",
  "GOOGLE_DRIVE_CLIENT_SECRET": "GOCSPX-your-client-secret",
  "GOOGLE_DRIVE_REDIRECT_URI": "https://developers.google.com/oauthplayground",
  "GOOGLE_DRIVE_REFRESH_TOKEN": "1//your-refresh-token"
}
```

## Step 8: Verify the Configuration

From the backend folder:

```bash
npm run check:drive-config
```

This script:

1. Reads MongoDB settings and env fallback values.
2. Prints masked fingerprints, not raw secrets.
3. Tests whether Google accepts the refresh token.

Expected successful OAuth section:

```txt
OAuth refresh test: { ok: true }
```

If testing Heroku config locally, copy the same values into `backend/.env` temporarily and run the command locally. Do not commit `.env`.

## Google Form Apps Script Settings

If you use the Google Form flow, configure Apps Script project properties:

```txt
BACKEND_URL=https://your-heroku-app-name.herokuapp.com/api/google-form/digival-card
WEBHOOK_SECRET=same-value-as-backend-WEBHOOK_SECRET
BACKEND_DRIVE_READER_EMAILS=backend-drive-account@example.com
```

`BACKEND_DRIVE_READER_EMAILS` should be the Google account email that generated the refresh token, or the service account email if using service account credentials.

This matters because Google Form uploads are often owned by the Form owner's Drive account. Apps Script can grant the backend account read access before sending the webhook.

## Optional: Service Account Instead of OAuth Refresh Token

OAuth refresh token setup is recommended for this project because it works naturally with a normal Google Drive account.

If you prefer a service account:

1. Create a Google Cloud service account.
2. Create a JSON key.
3. Share the Drive output folder with the service account email.
4. For Google Form uploads, set `BACKEND_DRIVE_READER_EMAILS` to the service account email.
5. Configure either:

```txt
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}
```

Or:

```txt
GOOGLE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Do not configure both OAuth and service account credentials at the same time while debugging. The backend uses OAuth if `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, and `GOOGLE_DRIVE_REFRESH_TOKEN` are present.

## Troubleshooting

### `invalid_grant`

The refresh token is invalid, expired, revoked, or does not match the current client ID and client secret.

Fix:

1. Open OAuth Playground.
2. Enable `Use your own OAuth credentials`.
3. Use the same client ID and client secret configured in the backend.
4. Generate a new refresh token.
5. Update Heroku config vars or MongoDB settings.
6. Restart/redeploy the backend.

### `redirect_uri_mismatch`

The OAuth client does not allow the redirect URI used by OAuth Playground.

Fix:

Add this exact redirect URI to the OAuth client:

```txt
https://developers.google.com/oauthplayground
```

Then generate the token again.

### No Refresh Token Appears

Common causes:

1. OAuth Playground is not using your own OAuth client credentials.
2. Access type is not offline.
3. The Google account already approved this OAuth client.

Fix:

Use `Prompt: consent` if available, or revoke the app from the Google Account security page and authorize again.

### `insufficient authentication scopes`

The refresh token was generated with the wrong scope.

Fix:

Generate a new refresh token with:

```txt
https://www.googleapis.com/auth/drive
```

### `Google Drive folder ID is missing`

`GOOGLE_DRIVE_FOLDER_ID` is missing from both MongoDB settings and env/config vars.

Fix:

Add it in the same source as the rest of the Google variables.

### `File not found` or `403`

The backend Google account cannot access the folder or source photo.

Fix:

1. Confirm the output folder ID is correct.
2. Share the output folder with the backend Google account.
3. For Google Form uploads, configure `BACKEND_DRIVE_READER_EMAILS`.
4. Submit a new test form response so Apps Script grants access to the new uploaded file.

### Heroku Uses Old Values

If `/ready` is OK but uploads still fail with old Google credential errors, check the MongoDB `settings` document. MongoDB values override Heroku config vars in this backend.

Fix:

Update or remove the Google keys in the MongoDB document with:

```json
{ "key": "app-settings" }
```

Then restart/redeploy Heroku.

## Safe Handling Checklist

1. Never commit `.env`.
2. Never paste client secrets or refresh tokens into frontend code.
3. Use Heroku config vars or MongoDB settings for production secrets.
4. If a secret was exposed, rotate the OAuth client secret and generate a new refresh token.
5. Keep the refresh token tied to the same client ID and client secret used by the backend.
