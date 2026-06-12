const GeneratedCard = require("../models/GeneratedCard");
const Template = require("../models/Template");
const { uploadBufferToDrive } = require("../utils/googleDriveStorage");

const isDataImage = value => {
  return typeof value === "string" && /^data:image\//i.test(value);
};

const dataImageToUploadFile = (value, name = "image") => {
  const match = String(value).match(/^data:(image\/[\w.+-]+);base64,(.+)$/is);

  if (!match) {
    const error = new Error("Invalid inline image data");
    error.statusCode = 400;
    throw error;
  }

  const mimeType = match[1];
  const cleanBase64 = match[2].replace(/\s/g, "");
  const buffer = Buffer.from(cleanBase64, "base64");

  if (!buffer.length) {
    const error = new Error("Inline image data is empty");
    error.statusCode = 400;
    throw error;
  }

  const extension =
    {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif"
    }[mimeType.toLowerCase()] || "png";

  return {
    fieldname: name,
    originalname: `${name}.${extension}`,
    mimetype: mimeType,
    size: buffer.length,
    buffer
  };
};

const persistInlineImagesToDrive = async (value, name = "image") => {
  if (isDataImage(value)) {
    const uploadedFile = await uploadBufferToDrive(dataImageToUploadFile(value, name));
    return uploadedFile.imageUrl;
  }

  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item, index) => persistInlineImagesToDrive(item, `${name}-${index}`))
    );
  }

  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, entryValue]) => [
        key,
        await persistInlineImagesToDrive(entryValue, key)
      ])
    );

    return Object.fromEntries(entries);
  }

  return value;
};

const prepareGeneratedCardPayload = async payload => {
  const preparedPayload = { ...payload };

  if (Object.prototype.hasOwnProperty.call(preparedPayload, "formData")) {
    preparedPayload.formData = await persistInlineImagesToDrive(
      preparedPayload.formData,
      "formData"
    );
  }

  if (Object.prototype.hasOwnProperty.call(preparedPayload, "photo")) {
    preparedPayload.photo = await persistInlineImagesToDrive(preparedPayload.photo, "photo");
  }

  if (Object.prototype.hasOwnProperty.call(preparedPayload, "logo")) {
    preparedPayload.logo = await persistInlineImagesToDrive(preparedPayload.logo, "logo");
  }

  preparedPayload.uploadsPersisted = true;

  return preparedPayload;
};

exports.createGeneratedCard = async (req, res, next) => {
  try {
    const { templateId, formData = {}, photo = "", logo = "", qrData = "" } = req.body;

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
    const updatedCard = await GeneratedCard.findByIdAndUpdate(req.params.id, preparedPayload, {
      new: true,
      runValidators: true
    });

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
