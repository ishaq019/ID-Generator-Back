const GeneratedCard = require("../models/GeneratedCard");
const Template = require("../models/Template");

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isDataImage = value => {
  return typeof value === "string" && /^data:image\//i.test(value);
};

const rejectInlineImages = (value, path = "image") => {
  if (isDataImage(value)) {
    throw createHttpError(
      400,
      `Inline image data is no longer supported for "${path}". Upload images through /api/uploads/photo first and save the returned imageUrl.`
    );
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectInlineImages(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entryValue]) => {
      rejectInlineImages(entryValue, `${path}.${key}`);
    });
  }
};

const prepareGeneratedCardPayload = (payload = {}) => {
  const preparedPayload = { ...payload };

  ["formData", "photo", "logo"].forEach(fieldName => {
    if (Object.prototype.hasOwnProperty.call(preparedPayload, fieldName)) {
      rejectInlineImages(preparedPayload[fieldName], fieldName);
    }
  });

  preparedPayload.uploadsPersisted = true;

  return preparedPayload;
};

const getTemplateOrThrow = async templateId => {
  const template = await Template.findById(templateId);

  if (!template) {
    throw createHttpError(404, "Template not found");
  }

  return template;
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
      throw createHttpError(400, "Template ID is required");
    }

    const template = await getTemplateOrThrow(templateId);

    const preparedPayload = prepareGeneratedCardPayload({
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
      throw createHttpError(404, "Generated card not found");
    }

    res.json(card);
  } catch (error) {
    next(error);
  }
};

exports.updateGeneratedCard = async (req, res, next) => {
  try {
    const preparedPayload = prepareGeneratedCardPayload(req.body);

    if (preparedPayload.templateId) {
      const template = await getTemplateOrThrow(preparedPayload.templateId);
      preparedPayload.templateSnapshot = template.toObject();
    }

    const updatedCard = await GeneratedCard.findByIdAndUpdate(
      req.params.id,
      preparedPayload,
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedCard) {
      throw createHttpError(404, "Generated card not found");
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
      throw createHttpError(404, "Generated card not found");
    }

    await card.deleteOne();
    res.json({ message: "Generated card deleted successfully" });
  } catch (error) {
    next(error);
  }
};
