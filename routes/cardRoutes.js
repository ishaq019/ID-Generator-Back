const express = require("express");
const {
  createGeneratedCard,
  getGeneratedCards,
  getGeneratedCardById,
  updateGeneratedCard,
  deleteGeneratedCard
} = require("../controllers/cardController");

const router = express.Router();

router.route("/").post(createGeneratedCard).get(getGeneratedCards);
router.route("/:id").get(getGeneratedCardById).put(updateGeneratedCard).delete(deleteGeneratedCard);

module.exports = router;
