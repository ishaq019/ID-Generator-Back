const GeneratedCard = require("../models/GeneratedCard");
const Template = require("../models/Template");

const isDataImage = value => {
  return typeof value === "string" && /^data:image\//i.test(value);
};

const rejectInlineImages = (value, name = "image") => {
  if (isDataImage(value)) {
    const error = new Error(
      `Inline image data is no longer supported for "${name}". Upload images through /api/uploads/photo first and save the returned imageUrl.`
    );
    error.statusCode = 400;
    throw error;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectInlineImages(item, `${name}-${index}`));
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entryValue]) => {
      rejectInlineImages(entryValue, key);
    });
  }
};

const prepareGeneratedCardPayload = payload => {
  const preparedPayload = { ...payload };

  if (Object.prototype.hasOwnProperty.call(preparedPayload, "formData")) {
    rejectInlineImages(preparedPayload.formData, "formData");
  }

  if (Object.prototype.hasOwnProperty.call(preparedPayload, "photo")) {
    rejectInlineImages(preparedPayload.photo, "photo");
  }

  if (Object.prototype.hasOwnProperty.call(preparedPayload, "logo")) {
    rejectInlineImages(preparedPayload.logo, "logo");
  }

  preparedPayload.uploadsPersisted = true;

  return preparedPayload;
};

exports.createGeneratedCard = async (req, res, next) => {
  try {
    const {
      templateId,
      formData = {},
      photo = "",
      logo = "",
      qrData = ""
    } = req.body;

    if (!templateId) {
      res.status(400);
      throw new Error("Template ID is required");
    }

    const template = await Template.findById(templateId);

    if (!template) {
      res.status(404);
      throw new Error("Template not found");
    }

    const preparedPayload = await prepareGeneratedCardPayload({
      templateId,
      formData,
      photo,
      logo,
      qrData,
      templateSnapshot: template.toObject()
    });

    const card = await GeneratedCard.create(preparedPayload);

    res.status(201).json(card);
  } catch (error) {
    next(error);
  }
};

exports.getGeneratedCards = async (req, res, next) => {
  try {
    const cards = await GeneratedCard.find()
      .populate("templateId", "templateName category orientation layoutKey slug")
      .sort({ createdAt: -1 });

    res.json(cards);
  } catch (error) {
    next(error);
  }
};

exports.getGeneratedCardById = async (req, res, next) => {
  try {
    const card = await GeneratedCard.findById(req.params.id).populate("templateId");

    if (!card) {
      res.status(404);
      throw new Error("Generated card not found");
    }

    res.json(card);
  } catch (error) {
    next(error);
  }
};

exports.updateGeneratedCard = async (req, res, next) => {
  try {
    const preparedPayload = await prepareGeneratedCardPayload(req.body);
    const updatedCard = await GeneratedCard.findByIdAndUpdate(
      req.params.id,
      preparedPayload,
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedCard) {
      res.status(404);
      throw new Error("Generated card not found");
    }

    res.json(updatedCard);
  } catch (error) {
    next(error);
  }
};

exports.deleteGeneratedCard = async (req, res, next) => {
  try {
    const card = await GeneratedCard.findById(req.params.id);

    if (!card) {
      res.status(404);
      throw new Error("Generated card not found");
    }

    await card.deleteOne();
    res.json({ message: "Generated card deleted successfully" });
  } catch (error) {
    next(error);
  }
};
