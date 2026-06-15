const express = require("express");
const multer = require("multer");
const createUploadMiddleware = require("../middleware/uploadMiddleware");
const { uploadBufferToDrive } = require("../utils/googleDriveStorage");
const { removeBackgroundFromUpload } = require("../utils/backgroundRemoval");
const { getRuntimeAppConfig } = require("../utils/appConfig");

const router = express.Router();

const shouldRemoveBackground = (value) => {
  return [true, "true", "1", "yes", "on"].includes(value);
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
  async (req, res) => {
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
        try {
          fileToUpload = await removeBackgroundFromUpload(req.file, {
            fileName: req.body?.fileName || req.file.originalname,
            model: appConfig.bgRemovalModel,
            maxDimension: appConfig.bgRemovalMaxDimension,
          });
        } catch (bgError) {
          console.error("BACKGROUND REMOVAL FAILED:", bgError);

          return res.status(500).json({
            success: false,
            message: bgError.message || "Background removal failed",
          });
        }
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
        imageUrl: versionedUrl,
        fileId: uploadedFile.fileId,
        file: {
          ...uploadedFile,
          imageUrl: versionedUrl,
        },
      });
    } catch (error) {
      console.error("UPLOAD ERROR:", error);

      return res.status(500).json({
        success: false,
        message: error.message || "Image upload failed",
      });
    }
  },
];

router.post("/photo", ...createUploadHandler("photo"));
router.post("/image", ...createUploadHandler("image"));

module.exports = router;
