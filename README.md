# ID Generator Backend

Express/MongoDB backend for template management, generated card records, image uploads, and Google Form driven DigiVal ID card generation.

## Google API Setup

For step-by-step Google Drive API setup, including `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, Drive folder ID, Heroku config vars, MongoDB settings, and troubleshooting, read [GOOGLE_API_SETUP.md](GOOGLE_API_SETUP.md).

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell:

```powershell
npm install
copy .env.example .env
npm run dev
```

## Heroku GUI Deployment

This backend folder is deployable as a standalone Heroku Node app. It includes:

```txt
Procfile
app.json
package.json
package-lock.json
server.js
```

One-click deploy from the backend repo:

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/ishaq019/ID-Generator-Back)

Manual Heroku Dashboard deploy:

1. Push this backend repo to GitHub.
2. Open `https://dashboard.heroku.com`, then choose `New` -> `Create new app`.
3. Open `Settings` -> `Config Vars` and add the values below. Do not add `PORT`; Heroku sets it automatically.
4. Required config vars:

```txt
MONGO_URI=your MongoDB Atlas connection string
AUTH_SECRET=a long random secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=a strong admin password
WEBHOOK_SECRET=a long random secret for Apps Script
NODE_ENV=production
```

5. Add Google Drive config vars if uploads or Google Form generation will be used:

```txt
GOOGLE_DRIVE_FOLDER_ID=your Drive folder ID
GOOGLE_DRIVE_CLIENT_ID=your OAuth client ID
GOOGLE_DRIVE_CLIENT_SECRET=your OAuth client secret
GOOGLE_DRIVE_REDIRECT_URI=https://developers.google.com/oauthplayground
GOOGLE_DRIVE_REFRESH_TOKEN=your OAuth refresh token
```

6. Optional Heroku-friendly background-removal defaults:

```txt
BACKGROUND_REMOVAL_ENABLED=true
UPLOAD_BG_REMOVAL_MODE=solid
GOOGLE_FORM_REMOVE_BG=true
GOOGLE_FORM_BG_REMOVAL_MODE=solid
BG_REMOVAL_FALLBACK_ENABLED=true
BG_REMOVAL_MODEL=small
BG_REMOVAL_MAX_DIMENSION=768
BG_REMOVAL_TIMEOUT_MS=22000
REQUEST_BODY_LIMIT=50mb
UPLOAD_FILE_SIZE_LIMIT=5mb
GOOGLE_FORM_PHOTO_MAX_SIZE=10mb
```

7. Open the `Deploy` tab, choose `GitHub`, connect `ID-Generator-Back`, select the branch, then click `Deploy Branch`.
8. Open `Resources` and make sure the `web` dyno is enabled.
9. Test the deployed API:

```txt
https://your-heroku-app-name.herokuapp.com/health
```

Expected response:

```json
{ "status": "ok" }
```

After deployment, update the frontend deployment with:

```txt
VITE_API_BASE_URL=https://your-heroku-app-name.herokuapp.com/api
```

For Google Apps Script, set script property:

```txt
BACKEND_URL=https://your-heroku-app-name.herokuapp.com/api/google-form/digival-card
WEBHOOK_SECRET=the same value as Heroku WEBHOOK_SECRET
```

If MongoDB Atlas blocks the connection, open Atlas `Network Access` and allow access for the Heroku app. For a simple first deploy, many projects use `0.0.0.0/0`; tighten this later if your hosting/network plan allows it.

### Heroku 503 or Browser CORS Error

If the browser says `No 'Access-Control-Allow-Origin' header` and the Network tab also shows `503 Service Unavailable`, check the Heroku app first. A Heroku `Application Error` page means the request did not reach Express, so it is usually a crashed dyno or missing production config, not a frontend CORS setting.

After deployment, test:

```txt
https://your-heroku-app-name.herokuapp.com/health
https://your-heroku-app-name.herokuapp.com/ready
```

`/health` only confirms the Express server is running. `/ready` checks MongoDB, `AUTH_SECRET`, and default template seeding. If `/ready` returns `503`, open Heroku `More` -> `View logs` and check these config vars first: `MONGO_URI`, `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `WEBHOOK_SECRET`.

### Heroku Background Removal

For Heroku, keep background removal enabled but bounded:

```txt
BACKGROUND_REMOVAL_ENABLED=true
UPLOAD_BG_REMOVAL_MODE=solid
GOOGLE_FORM_REMOVE_BG=true
GOOGLE_FORM_BG_REMOVAL_MODE=solid
BG_REMOVAL_FALLBACK_ENABLED=true
BG_REMOVAL_MODEL=small
BG_REMOVAL_MAX_DIMENSION=768
BG_REMOVAL_TIMEOUT_MS=22000
```

For admin uploads, `UPLOAD_BG_REMOVAL_MODE=solid` uses the fast remover that is safer on small Heroku dynos. For Google Form submissions, `GOOGLE_FORM_BG_REMOVAL_MODE=solid` does the same. Set either mode to `ml` only on a larger dyno after testing. If `BACKGROUND_REMOVAL_ENABLED` or `GOOGLE_FORM_REMOVE_BG` is set to `false`, or either mode is set to `none`, the backend will upload the original image without removing the background. Heroku Config Vars override MongoDB for these background-removal kill switches.

## Environment Fallbacks

```txt
MONGO_URI=your MongoDB connection string
AUTH_SECRET=a long random secret used to sign admin auth tokens
ADMIN_USERNAME=admin
ADMIN_PASSWORD=a strong admin password
WEBHOOK_SECRET=a long random secret shared with Apps Script
CLIENT_URL=http://localhost:5175
CLIENT_URLS=http://localhost:5173,http://localhost:5175
REQUEST_BODY_LIMIT=50mb
UPLOAD_FILE_SIZE_LIMIT=5mb
GOOGLE_DRIVE_FOLDER_ID=your Drive folder ID
GOOGLE_DRIVE_CLIENT_ID=your OAuth client ID
GOOGLE_DRIVE_CLIENT_SECRET=your OAuth client secret
GOOGLE_DRIVE_REDIRECT_URI=https://developers.google.com/oauthplayground
GOOGLE_DRIVE_REFRESH_TOKEN=your OAuth refresh token
```

The backend reads app config from MongoDB first. These `.env` values are fallback values when the MongoDB `settings` document is missing, disconnected, or does not contain a field.

For Google Drive uploads, generate the refresh token from the same Google account that owns or can edit the target Drive folder. Enable the Google Drive API in the Google Cloud project that owns the OAuth client. Service-account credentials are still supported as a fallback through `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY`.

If Google Drive calls fail with `invalid_grant`, the backend OAuth refresh token is no longer valid. Regenerate `GOOGLE_DRIVE_REFRESH_TOKEN` with the same `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, and redirect URI, then update the MongoDB `settings` document or `.env` and redeploy/restart the backend. For Google Cloud OAuth consent screens in Testing mode, refresh tokens can expire; move the app to Production or regenerate the token when needed.

You can verify what the backend resolves from MongoDB without printing secrets:

```bash
npm run check:drive-config
```

This prints detected Mongo keys, masked credential fingerprints, and whether Google accepts the configured refresh token.

Optional app behavior can be configured with `DIGIVAL_TEMPLATE_SLUG`, `COMPANY_WEBSITE`, `COMPANY_ADDRESS`, `BACKGROUND_REMOVAL_ENABLED`, `UPLOAD_BG_REMOVAL_MODE`, `GOOGLE_FORM_REMOVE_BG`, `GOOGLE_FORM_BG_REMOVAL_MODE`, `BG_REMOVAL_FALLBACK_ENABLED`, `BG_REMOVAL_MODEL`, `BG_REMOVAL_MAX_DIMENSION`, `BG_REMOVAL_TIMEOUT_MS`, and `GOOGLE_FORM_PHOTO_MAX_SIZE`.

## MongoDB Config

Easy admin setup: set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` or in the MongoDB `settings` document.

Optional fallback: create one admin document in the `static_auth` collection. The app does not expose an admin setup page or setup endpoint.

```json
{
  "key": "admin-signin",
  "username": "admin",
  "password": "Admin@123"
}
```

Create one app settings document in the `settings` collection. Each field is read as `MongoDB value || env value`.

```json
{
  "key": "app-settings",
  "AUTH_SECRET": "a long random secret used to sign admin auth tokens",
  "ADMIN_USERNAME": "admin",
  "ADMIN_PASSWORD": "a strong admin password",
  "CLIENT_URL": "http://localhost:5175",
  "WEBHOOK_SECRET": "a long random secret shared with Apps Script",
  "GOOGLE_DRIVE_FOLDER_ID": "your Drive folder ID",
  "GOOGLE_DRIVE_CLIENT_ID": "your OAuth client ID",
  "GOOGLE_DRIVE_CLIENT_SECRET": "your OAuth client secret",
  "GOOGLE_DRIVE_REDIRECT_URI": "https://developers.google.com/oauthplayground",
  "GOOGLE_DRIVE_REFRESH_TOKEN": "your OAuth refresh token"
}
```

The backend also supports optional `CLIENT_URLS`, `WEBHOOK_URL`, `UPLOAD_FILE_SIZE_LIMIT`, `GOOGLE_FORM_PHOTO_MAX_SIZE`, and background-removal fields in the same `app-settings` document.

After setting admin credentials, use `POST /api/auth/login`.

## Image Upload Endpoint

```txt
POST /api/uploads/photo
```

Form-data field:

```txt
photo=<image file>
```

The response includes `imageUrl`, `fileId`, and `file` metadata. `imageUrl` points to `GET /api/files/:fileId`, which streams the image back from Google Drive.

## Google Form Endpoint

```txt
POST https://your-heroku-app-name.herokuapp.com/api/google-form/digival-card
```

Required header:

```txt
x-webhook-secret: same value as WEBHOOK_SECRET
```

Required JSON fields:

```json
{
  "name": "Employee Name",
  "employeeId": "EMP001",
  "bloodGroup": "O+",
  "phone": "9876543210",
  "email": "employee@example.com",
  "photoFileId": "google drive file id from the Form upload cell",
  "photoBase64": "optional base64 fallback image bytes",
  "photoMimeType": "image/png",
  "submissionId": "unique google sheet row id"
}
```

The Apps Script runs from the linked Google Sheet, reads the submitted row, extracts the uploaded image's Drive file ID, and sends `photoFileId` to the backend. It also sends `photoBase64` plus `photoMimeType` by default as a fallback. The backend first tries to download the Drive file, then uses the base64 image if the Google Drive download returns an access/not-found error. After reading the photo, the backend removes the background when enabled and uploads the processed image to the output folder configured by `GOOGLE_DRIVE_FOLDER_ID`.

The backend Google Drive credentials must be able to write to the output folder. They should also be able to read the Form-uploaded source file when you want the primary Drive-file path to work. Use OAuth credentials for an account with both permissions, or set the Apps Script `BACKEND_DRIVE_READER_EMAILS` property to the backend service account/OAuth account email so the script grants read access to each uploaded source file before sending the webhook. Do not set `BACKEND_DRIVE_READER_EMAILS` to the employee/respondent email.

The Apps Script copy is in:

```txt
backend/integrations/google-form-apps-script.gs
```

The Apps Script manifest with required permissions is in:

```txt
backend/integrations/appsscript.json
```

After pasting both files into Apps Script, run `authorizeGoogleFormAutomation` once from the editor and approve permissions. This grants the spreadsheet, Drive, script properties, and URL fetch scopes needed by the installable trigger.

## Health Checks

```txt
GET /
GET /health
GET /api/google-form/health
```

## Hosted Storage Note

Heroku and other hosted Node platforms do not provide reliable persistent local upload storage for app files. Uploaded images are stored in Google Drive and card records keep Drive-backed `/api/files/:fileId` URLs in MongoDB.
