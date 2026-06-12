const { Readable } = require("stream");
const path = require("path");
const getGoogleDrive = require("../config/googleDrive");
const { getAppSettings } = require("./settingsService");

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

  const settings = await getAppSettings();

  return settings.googleDriveFolderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
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
  const drive = getGoogleDrive();

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
      "Google Drive folder ID is missing. Add it in Settings or GOOGLE_DRIVE_FOLDER_ID env."
    );
  }

  const fileName = normalizeUploadFileName(file, options);
  const drive = getGoogleDrive();

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

const downloadDriveFileAsBuffer = async fileId => {
  const drive = getGoogleDrive();

  const metadataResponse = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,size",
    supportsAllDrives: true
  });

  const mediaResponse = await drive.files.get(
    {
      fileId,
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
    metadata: metadataResponse.data
  };
};

module.exports = {
  uploadBufferToDrive,
  downloadDriveFileAsBuffer,
  findDriveFileByName,
  sanitizeFileName
};