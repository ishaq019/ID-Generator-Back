const Template = require("../models/Template");

const normalizeFields = fields => {
  if (!Array.isArray(fields)) return [];

  return fields.map(field => ({
    ...field,
    label: String(field.label || "").trim(),
    key: String(field.key || "").trim()
  }));
};

const validateFields = fields => {
  const normalizedFields = normalizeFields(fields);

  for (const field of normalizedFields) {
    if (!field.label) return "Every field must have a label";
    if (!field.key) return "Every field must have a key";
  }

  const keys = normalizedFields.map(field => field.key.toLowerCase());
  const hasDuplicate = new Set(keys).size !== keys.length;

  if (hasDuplicate) return "Field keys must be unique";

  return null;
};

exports.createTemplate = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      fields: normalizeFields(req.body.fields)
    };

    if (!payload.templateName || !payload.templateName.trim()) {
      res.status(400);
      throw new Error("Template name is required");
    }

    const fieldError = validateFields(payload.fields);
    if (fieldError) {
      res.status(400);
      throw new Error(fieldError);
    }

    payload.isDefault = false;
    delete payload.slug;

    const template = await Template.create(payload);
    res.status(201).json(template);
  } catch (error) {
    next(error);
  }
};

exports.getTemplates = async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.category && req.query.category !== "All") {
      filter.category = req.query.category;
    }

    const templates = await Template.find(filter).sort({ isDefault: -1, createdAt: -1 });
    res.json(templates);
  } catch (error) {
    next(error);
  }
};

exports.getTemplateById = async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id);

    if (!template) {
      res.status(404);
      throw new Error("Template not found");
    }

    res.json(template);
  } catch (error) {
    next(error);
  }
};

exports.updateTemplate = async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id);

    if (!template) {
      res.status(404);
      throw new Error("Template not found");
    }

    if (template.isDefault) {
      res.status(400);
      throw new Error("Default templates cannot be edited directly. Create a custom template instead.");
    }

    const payload = {
      ...req.body,
      fields: normalizeFields(req.body.fields)
    };

    const fieldError = validateFields(payload.fields);
    if (fieldError) {
      res.status(400);
      throw new Error(fieldError);
    }

    delete payload.slug;
    delete payload.isDefault;

    const updatedTemplate = await Template.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    });

    res.json(updatedTemplate);
  } catch (error) {
    next(error);
  }
};

exports.deleteTemplate = async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id);

    if (!template) {
      res.status(404);
      throw new Error("Template not found");
    }

    if (template.isDefault) {
      res.status(400);
      throw new Error("Default templates cannot be deleted");
    }

    await template.deleteOne();
    res.json({ message: "Template deleted successfully" });
  } catch (error) {
    next(error);
  }
};
