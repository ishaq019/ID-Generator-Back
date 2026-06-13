const mongoose = require("mongoose");

const generatedCardSchema = new mongoose.Schema(
  {
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Template",
      required: true,
    },

    formData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    photo: { type: String, default: "" },
    logo: { type: String, default: "" },
    qrData: { type: String, default: "" },

    source: {
      type: String,
      enum: ["manual", "google-form"],
      default: "manual",
    },

    googleSubmissionId: {
      type: String,
      default: "",
      index: true,
    },
    uploadsPersisted: { type: Boolean, default: false },

    templateSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.GeneratedCard ||
  mongoose.model("GeneratedCard", generatedCardSchema);
