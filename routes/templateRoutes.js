const express = require("express");
const {
  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate
} = require("../controllers/templateController");

const router = express.Router();

router.route("/").post(createTemplate).get(getTemplates);
router.route("/:id").get(getTemplateById).put(updateTemplate).delete(deleteTemplate);

module.exports = router;
