const express = require("express");
const {
  getSetupStatus,
  setupAdmin,
  login,
  getProfile
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/setup-status", getSetupStatus);
router.post("/setup", setupAdmin);
router.post("/login", login);
router.get("/me", protect, getProfile);

module.exports = router;
