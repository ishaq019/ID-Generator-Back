const express = require("express");
const {
  createDigivalCardFromGoogleForm
} = require("../controllers/googleFormController");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    route: "/api/google-form/digival-card"
  });
});

router.post("/digival-card", createDigivalCardFromGoogleForm);

module.exports = router;
