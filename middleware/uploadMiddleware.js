const multer = require("multer");
const { getRuntimeAppConfig } = require("../utils/appConfig");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

  if (!allowedTypes.includes(file.mimetype)) {
    const error = new Error("Only PNG, JPG, JPEG, and WEBP images are allowed");
    error.statusCode = 400;
    return cb(error, false);
  }

  cb(null, true);
};

const createUploadMiddleware = fieldName => {
  return async (req, res, next) => {
    try {
      const appConfig = await getRuntimeAppConfig();
      const upload = multer({
        storage,
        fileFilter,
        limits: {
          fileSize: appConfig.uploadFileSizeLimitBytes
        }
      });

      upload.single(fieldName)(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

module.exports = createUploadMiddleware;
