const express = require("express");
const upload = require("../middleware/uploadMiddleware");
const { uploadBufferToDrive } = require("../utils/googleDriveStorage");
const { removeBackgroundFromUpload } = require("../utils/backgroundRemoval");
const { getAppSettings } = require("../utils/settingsService");

const router = express.Router();

const shouldRemoveBackground = (value) => {
  return [true, "true", "1", "yes", "on"].includes(value);
};

const createUploadHandler = (fieldName) => [
  upload.single(fieldName),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: `Image file is required in "${fieldName}" field`,
        });
      }

      const settings = await getAppSettings();
      const requestedRemoveBg = shouldRemoveBackground(
        req.body?.removeBackground,
      );
      const removeBg =
        requestedRemoveBg && settings.backgroundRemovalEnabled !== false;

      let fileToUpload = req.file;

      if (removeBg) {
        try {
          fileToUpload = await removeBackgroundFromUpload(req.file, {
            fileName: req.body?.fileName || req.file.originalname,
            model: settings.bgRemovalModel,
            maxDimension: settings.bgRemovalMaxDimension,
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
