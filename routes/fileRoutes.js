const express = require("express");
const { downloadDriveFileAsBuffer } = require("../utils/googleDriveStorage");

const router = express.Router();

router.get("/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file ID",
      });
    }

    const { buffer, metadata } = await downloadDriveFileAsBuffer(fileId);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader(
      "Content-Type",
      metadata.mimeType || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Length", buffer.length);

    res.send(buffer);
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message || "Image not found",
    });
  }
});

module.exports = router;
