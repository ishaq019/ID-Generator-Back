# ID Generator Backend

Express/MongoDB backend for template management, generated card records, image upload conversion, and Google Form driven DigiVal ID card generation.

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
WEBHOOK_SECRET=a long random secret shared with Apps Script
EMAIL_USER=your Gmail address
EMAIL_PASS=your Gmail app password
CLIENT_URL=http://localhost:5175
CLIENT_URLS=http://localhost:5173,http://localhost:5175
GOOGLE_DRIVE_FOLDER_ID=your Drive folder ID
GOOGLE_DRIVE_CLIENT_ID=your OAuth client ID
GOOGLE_DRIVE_CLIENT_SECRET=your OAuth client secret
GOOGLE_DRIVE_REDIRECT_URI=https://developers.google.com/oauthplayground
GOOGLE_DRIVE_REFRESH_TOKEN=your OAuth refresh token
```

Use a Gmail app password for `EMAIL_PASS`; a normal Gmail account password will not work with Nodemailer.

For Google Drive uploads, generate the refresh token from the same Google account that owns or can edit the target Drive folder. Enable the Google Drive API in the Google Cloud project that owns the OAuth client. Service-account credentials are still supported as a fallback through `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY`.

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
  "photoBase64": "base64 image data or data:image/png;base64,...",
  "photoMimeType": "image/png",
  "submissionId": "unique google sheet row id"
}
```

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

Vercel does not provide persistent local upload storage. This backend writes files for the active request so email attachments work, and stores data URLs in MongoDB for Google Form generated card records. Use S3, Cloudinary, or Vercel Blob if permanent public image URLs are required.
"# ID-Generator-Back" 
