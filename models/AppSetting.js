const mongoose = require("mongoose");

const appSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    collection: "settings",
    strict: false,
    timestamps: true,
  },
);

module.exports =
  mongoose.models.AppSetting || mongoose.model("AppSetting", appSettingSchema);
