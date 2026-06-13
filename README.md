# ID Generator Backend

Express/MongoDB backend for template management, generated card records, image uploads, and Google Form driven DigiVal ID card generation.

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

## Required Environment Variables

```txt
MONGO_URI=your MongoDB connection string
AUTH_SECRET=a long random secret used to sign admin auth tokens
WEBHOOK_SECRET=a long random secret shared with Apps Script
CLIENT_URL=http://localhost:5175
CLIENT_URLS=http://localhost:5173,http://localhost:5175
REQUEST_BODY_LIMIT=25mb
UPLOAD_FILE_SIZE_LIMIT=5mb
GOOGLE_DRIVE_FOLDER_ID=your Drive folder ID
GOOGLE_DRIVE_CLIENT_ID=your OAuth client ID
GOOGLE_DRIVE_CLIENT_SECRET=your OAuth client secret
GOOGLE_DRIVE_REDIRECT_URI=https://developers.google.com/oauthplayground
GOOGLE_DRIVE_REFRESH_TOKEN=your OAuth refresh token
```

For Google Drive uploads, generate the refresh token from the same Google account that owns or can edit the target Drive folder. Enable the Google Drive API in the Google Cloud project that owns the OAuth client. Service-account credentials are still supported as a fallback through `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY`.

Optional app behavior can be configured with `DIGIVAL_TEMPLATE_SLUG`, `COMPANY_WEBSITE`, `COMPANY_ADDRESS`, `BACKGROUND_REMOVAL_ENABLED`, `GOOGLE_FORM_REMOVE_BG`, `BG_REMOVAL_MODEL`, `BG_REMOVAL_MAX_DIMENSION`, and `GOOGLE_FORM_PHOTO_MAX_SIZE`.

## Admin Setup

Admin credentials are stored in the MongoDB `static_auth` collection as a salted password hash. Auth tokens are signed with `AUTH_SECRET`; set it in production.

On a fresh database, open the frontend login page or call:

```txt
GET /api/auth/setup-status
POST /api/auth/setup
```

`POST /api/auth/setup` accepts:

```json
{
  "username": "admin",
  "password": "change-this-password"
}
```

The setup endpoint only works before an admin password hash exists. After setup, use `POST /api/auth/login`.

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
POST https://id-generator-backend-jet.vercel.app/api/google-form/digival-card
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
  "photoFileId": "google drive file id from the form upload response",
  "submissionId": "unique google sheet row id"
}
```

The backend Google Drive credentials must have read access to the uploaded form file ID. The Apps Script sends only the Drive file ID; it does not convert image bytes to base64.

The Apps Script copy is in:

```txt
backend/integrations/google-form-apps-script.gs
```

## Health Checks

```txt
GET /
GET /health
GET /api/google-form/health
```

## Vercel Note

Vercel does not provide persistent local upload storage. Uploaded images are stored in Google Drive and card records keep Drive-backed `/api/files/:fileId` URLs in MongoDB.
