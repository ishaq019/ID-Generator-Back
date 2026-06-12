const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "app-settings"
    },

    googleFormUrl: {
      type: String,
      default: ""
    },

    googleFormAppsScriptUrl: {
      type: String,
      default: ""
    },

    googleFormWebhookSecret: {
      type: String,
      default: ""
    },

    googleDriveFolderId: {
      type: String,
      default: ""
    },

    digivalTemplateSlug: {
      type: String,
      default: "digival-employee-id-card"
    },

    companyWebsite: {
      type: String,
      default: "www.digi-val.com"
    },

    companyAddress: {
      type: String,
      default:
        "5th Floor Right Wing, Chennai Citi Centre,\nDr Radhakrishnan Salai, Mylapore,\nChennai - 600004, Tamil Nadu, India"
    },

    backgroundRemovalEnabled: {
      type: Boolean,
      default: true
    },

    googleFormRemoveBg: {
      type: Boolean,
      default: true
    },

    bgRemovalModel: {
      type: String,
      enum: ["small", "medium"],
      default: "small"
    },

    bgRemovalMaxDimension: {
      type: Number,
      default: 1024
    }
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Setting || mongoose.model("Setting", settingSchema);
