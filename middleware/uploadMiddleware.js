const multer = require("multer");
const { getAppConfig } = require("../utils/appConfig");

const storage = multer.memoryStorage();
const appConfig = getAppConfig();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

  if (!allowedTypes.includes(file.mimetype)) {
    const error = new Error("Only PNG, JPG, JPEG, and WEBP images are allowed");
    error.statusCode = 400;
    return cb(error, false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: appConfig.uploadFileSizeLimitBytes
  }
});

module.exports = upload;
