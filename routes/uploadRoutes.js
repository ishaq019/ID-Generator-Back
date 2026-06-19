const express = require("express");
const multer = require("multer");
const createUploadMiddleware = require("../middleware/uploadMiddleware");
const { uploadBufferToDrive } = require("../utils/googleDriveStorage");
const { getRuntimeAppConfig } = require("../utils/appConfig");

const router = express.Router();

const shouldRemoveBackground = (value) => {
  return [true, "true", "1", "yes", "on"].includes(value);
};

const getBackgroundRemoval = () => {
  return require("../utils/backgroundRemoval");
};

const buildOriginalUploadFile = (file, fileName) => {
  return {
    ...file,
    driveFileName: fileName,
    originalname: fileName,
    backgroundRemovalMode: "none",
  };
};

const processUploadedImage = async (file, appConfig, options = {}) => {
  const mode = appConfig.uploadBgRemovalMode || "solid";

  if (mode === "none") {
    return buildOriginalUploadFile(file, options.fileName || file.originalname);
  }

  try {
    const {
      removeBackgroundFromUpload,
      removeSolidBackgroundFromUpload,
    } = getBackgroundRemoval();
    const backgroundOptions = {
      fileName: options.fileName || file.originalname,
      model: appConfig.bgRemovalModel,
      maxDimension: appConfig.bgRemovalMaxDimension,
      timeoutMs: appConfig.bgRemovalTimeoutMs,
      fallbackEnabled: appConfig.bgRemovalFallbackEnabled,
    };

    if (mode === "ml") {
      return await removeBackgroundFromUpload(file, backgroundOptions);
    }

    return await removeSolidBackgroundFromUpload(file, backgroundOptions);
  } catch (error) {
    console.warn(
      "Upload background removal failed; uploading original image.",
      {
        mode,
        error: error.message,
      },
    );

    return buildOriginalUploadFile(file, options.fileName || file.originalname);
  }
};

const handleUploadMiddleware = fieldName => {
  const uploadSingle = createUploadMiddleware(fieldName);

  return (req, res, next) => {
    uploadSingle(req, res, error => {
      if (!error) {
        return next();
      }

      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "Image file is too large"
        });
      }

      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message || "Invalid image upload"
      });
    });
  };
};

const createUploadHandler = (fieldName) => [
  handleUploadMiddleware(fieldName),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: `Image file is required in "${fieldName}" field`,
        });
      }

      const appConfig = await getRuntimeAppConfig();
      const requestedRemoveBg = shouldRemoveBackground(
        req.body?.removeBackground,
      );
      const removeBg =
        requestedRemoveBg && appConfig.backgroundRemovalEnabled !== false;

      let fileToUpload = req.file;

      if (removeBg) {
        fileToUpload = await processUploadedImage(req.file, appConfig, {
          fileName: req.body?.fileName || req.file.originalname,
        });
      }

      const uploadedFile = await uploadBufferToDrive(fileToUpload, {
        fileName: fileToUpload.driveFileName || fileToUpload.originalname,
        replaceExisting: true,
      });

      const versionedUrl = `${uploadedFile.imageUrl}?v=${Date.now()}`;

      return res.status(201).json({
        success: true,
        message: removeBg
          ? "Background removed and image uploaded successfully"
          : "Image uploaded successfully",
        backgroundRemoved: removeBg,
        backgroundRemovalMode: removeBg
          ? fileToUpload.backgroundRemovalMode || "ml"
          : "none",
        imageUrl: versionedUrl,
        fileId: uploadedFile.fileId,
        file: {
          ...uploadedFile,
          imageUrl: versionedUrl,
        },
      });
    } catch (error) {
      console.error("UPLOAD ERROR:", error);

      error.statusCode = error.statusCode || 500;
      return next(error);
    }
  },
];

router.post("/photo", ...createUploadHandler("photo"));
router.post("/image", ...createUploadHandler("image"));

module.exports = router;
