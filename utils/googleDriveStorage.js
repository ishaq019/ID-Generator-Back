const { Readable } = require("stream");
const path = require("path");
const getGoogleDrive = require("../config/googleDrive");
const { getRuntimeAppConfig } = require("./appConfig");

const sanitizeFileName = fileName => {
  const parsedName = path.basename(String(fileName || "upload"));
  const cleanedName = parsedName
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleanedName || "upload.png";
};

const escapeDriveQueryValue = value => {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
};

const getDriveFolderId = async options => {
  if (options?.folderId) {
    return options.folderId;
  }

  const appConfig = await getRuntimeAppConfig();

  return appConfig.googleDriveFolderId;
};

const normalizeUploadFileName = (file, options = {}) => {
  if (options.fileName) {
    return sanitizeFileName(options.fileName);
  }

  if (file.driveFileName) {
    return sanitizeFileName(file.driveFileName);
  }

  if (file.originalname) {
    return sanitizeFileName(file.originalname);
  }

  return `upload-${Date.now()}.png`;
};

const findDriveFileByName = async (fileName, folderId) => {
  const drive = await getGoogleDrive();

  const escapedFileName = escapeDriveQueryValue(fileName);
  const escapedFolderId = escapeDriveQueryValue(folderId);

  const response = await drive.files.list({
    q: `name = '${escapedFileName}' and '${escapedFolderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,webViewLink,webContentLink,modifiedTime)",
    spaces: "drive",
    pageSize: 10, 
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  const files = response.data.files || [];

  if (files.length === 0) {
    return null;
  }

  return files.sort((a, b) => {
    return new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0);
  })[0];
};

const createDriveFile = async ({ drive, folderId, fileName, file }) => {
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: file.mimetype,
      parents: [folderId]
    },
    media: {
      mimeType: file.mimetype,
      body: Readable.from(file.buffer)
    },
    fields: "id,name,mimeType,size,webViewLink,webContentLink",
    supportsAllDrives: true
  });

  return {
    ...response.data,
    wasReplaced: false
  };
};

const replaceDriveFile = async ({ drive, fileId, fileName, file }) => {
  const response = await drive.files.update({
    fileId,
    requestBody: {
      name: fileName,
      mimeType: file.mimetype
    },
    media: {
      mimeType: file.mimetype,
      body: Readable.from(file.buffer)
    },
    fields: "id,name,mimeType,size,webViewLink,webContentLink",
    supportsAllDrives: true
  });

  return {
    ...response.data,
    wasReplaced: true
  };
};

const uploadBufferToDrive = async (file, options = {}) => {
  if (!file) {
    throw new Error("No file provided");
  }

  if (!file.buffer?.length) {
    throw new Error("Uploaded file is empty");
  }

  const folderId = await getDriveFolderId(options);

  if (!folderId) {
    throw new Error(
      "Google Drive folder ID is missing. Add GOOGLE_DRIVE_FOLDER_ID in MongoDB settings or env."
    );
  }

  const fileName = normalizeUploadFileName(file, options);
  const drive = await getGoogleDrive();

  let existingFile = null;

  if (options.replaceExisting !== false) {
    existingFile = await findDriveFileByName(fileName, folderId);
  }

  const uploadedFile = existingFile
    ? await replaceDriveFile({
        drive,
        fileId: existingFile.id,
        fileName,
        file
      })
    : await createDriveFile({
        drive,
        folderId,
        fileName,
        file
      });

  const fileId = uploadedFile.id;
  const imageUrl = `/api/files/${fileId}`;

  return {
    fileId,
    fileName: uploadedFile.name,
    mimeType: uploadedFile.mimeType,
    size: Number(uploadedFile.size || file.size || file.buffer.length),
    webViewLink: uploadedFile.webViewLink,
    webContentLink: uploadedFile.webContentLink,
    imageUrl,
    wasReplaced: uploadedFile.wasReplaced
  };
};

const streamToBuffer = async stream => {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

const getGoogleApiStatus = error => {
  return Number(error?.code || error?.response?.status || error?.status) || 0;
};

const getGoogleApiErrorText = error => {
  const responseData = error?.response?.data || {};
  const errors = Array.isArray(error?.errors)
    ? error.errors.map(entry => entry.message).join(" ")
    : "";

  return [
    error?.message,
    responseData.error,
    responseData.error_description,
    errors
  ]
    .filter(Boolean)
    .join(" ");
};

const isInvalidOAuthGrantError = error => {
  return /invalid_grant/i.test(getGoogleApiErrorText(error));
};

const createDriveDownloadError = (fileId, error) => {
  const status = getGoogleApiStatus(error);
  const message =
    getGoogleApiErrorText(error) || "Unknown Google Drive error";
  const invalidGrantMessage =
    "Google Drive OAuth refresh token is invalid, expired, revoked, or " +
    "does not match the configured Google OAuth client. Regenerate " +
    "GOOGLE_DRIVE_REFRESH_TOKEN with the same GOOGLE_DRIVE_CLIENT_ID and " +
    "GOOGLE_DRIVE_CLIENT_SECRET, update MongoDB settings or env, then " +
    "redeploy/restart the backend.";
  const accessMessage =
    `Google Drive file ${fileId} cannot be accessed by the backend ` +
    "credentials. Share the uploaded Form file or response upload folder " +
    "with the backend Google Drive account/service account.";
  const notFoundMessage =
    `Google Drive file ${fileId} was not found or is not visible to the ` +
    "backend Google Drive credentials.";
  let userMessage = `Google Drive file ${fileId} could not be downloaded: ${message}`;
  let statusCode = 502;

  if (isInvalidOAuthGrantError(error)) {
    userMessage = invalidGrantMessage;
  } else if (status === 400) {
    statusCode = 400;
  } else if (status === 403) {
    userMessage = accessMessage;
    statusCode = 403;
  } else if (status === 404) {
    userMessage = notFoundMessage;
    statusCode = 404;
  }

  const wrappedError = new Error(userMessage);

  wrappedError.statusCode = statusCode;
  wrappedError.driveStatusCode = status;
  wrappedError.cause = error;

  return wrappedError;
};

const getDriveFileMetadata = async fileId => {
  const drive = await getGoogleDrive();

  const metadataResponse = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,size",
    supportsAllDrives: true
  });

  return metadataResponse.data;
};

const downloadDriveFileAsBuffer = async (fileId, existingMetadata = null) => {
  const safeFileId = String(fileId || "").trim();

  if (!/^[a-zA-Z0-9_-]+$/.test(safeFileId)) {
    const error = new Error("Invalid Google Drive file ID");
    error.statusCode = 400;
    throw error;
  }

  try {
    const drive = await getGoogleDrive();
    const metadata =
      existingMetadata || (await getDriveFileMetadata(safeFileId));

    const mediaResponse = await drive.files.get(
      {
        fileId: safeFileId,
        alt: "media",
        supportsAllDrives: true
      },
      {
        responseType: "stream"
      }
    );

    const buffer = await streamToBuffer(mediaResponse.data);

    return {
      buffer,
      metadata: {
        id: safeFileId,
        name: metadata?.name || "",
        mimeType: metadata?.mimeType || "",
        size: metadata?.size || "",
        ...metadata
      }
    };
  } catch (error) {
    throw createDriveDownloadError(safeFileId, error);
  }
};

module.exports = {
  uploadBufferToDrive,
  downloadDriveFileAsBuffer,
  getDriveFileMetadata,
  findDriveFileByName,
  sanitizeFileName
};
