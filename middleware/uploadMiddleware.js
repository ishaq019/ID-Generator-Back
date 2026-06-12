const multer = require("multer");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Only PNG, JPG, JPEG, and WEBP images are allowed"), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

module.exports = upload;