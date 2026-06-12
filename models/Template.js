const mongoose = require("mongoose");

const fieldSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["text", "number", "date", "email", "phone", "textarea", "image", "qr"],
      default: "text"
    },
    side: { type: String, enum: ["front", "back"], default: "front" },
    required: { type: Boolean, default: false },
    defaultValue: { type: String, default: "" },
    show: { type: Boolean, default: true },

    x: { type: Number, default: 20 },
    y: { type: Number, default: 20 },
    width: { type: Number, default: 180 },
    height: { type: Number, default: 28 },

    fontSize: { type: Number, default: 14 },
    fontWeight: { type: String, default: "500" },
    fontColor: { type: String, default: "#111827" },
    align: { type: String, enum: ["left", "center", "right"], default: "left" },

    bold: { type: Boolean, default: false },
    italic: { type: Boolean, default: false },
    underline: { type: Boolean, default: false },

    imageShape: {
      type: String,
      enum: ["square", "rounded", "circle"],
      default: "rounded"
    }
  },
  { _id: true }
);

const designSchema = new mongoose.Schema(
  {
    backgroundType: { type: String, enum: ["solid", "gradient"], default: "solid" },
    backgroundColor: { type: String, default: "#ffffff" },
    gradient: { type: String, default: "linear-gradient(135deg, #ffffff, #eef2ff)" },
    borderRadius: { type: Number, default: 18 },
    shadow: { type: Boolean, default: true },
    borderColor: { type: String, default: "#e5e7eb" }
  },
  { _id: false }
);

const templateSchema = new mongoose.Schema(
  {
    templateName: { type: String, required: true, trim: true },
   slug: { type: String, unique: true, sparse: true },

layoutKey: {
  type: String,
  enum: ["generic", "digival"],
  default: "generic"
},

category: {
      type: String,
      enum: ["Office", "University", "Custom"],
      default: "Custom"
    },
    orientation: {
      type: String,
      enum: ["vertical", "horizontal"],
      default: "vertical"
    },
    cardSize: {
      width: { type: Number, default: 260 },
      height: { type: Number, default: 420 },
      unit: { type: String, default: "px" }
    },
    frontDesign: { type: designSchema, default: () => ({}) },
    backDesign: { type: designSchema, default: () => ({}) },
    fields: [fieldSchema],
    styles: {
      fontFamily: { type: String, default: "Inter, Arial, sans-serif" },
      primaryColor: { type: String, default: "#2563eb" },
      secondaryColor: { type: String, default: "#111827" }
    },
    isDefault: { type: Boolean, default: false }
  },
  { timestamps: true }
);

templateSchema.index({ templateName: "text", category: "text" });

module.exports =
  mongoose.models.Template ||
  mongoose.model("Template", templateSchema);
