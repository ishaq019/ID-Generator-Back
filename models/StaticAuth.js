const mongoose = require("mongoose");

const staticAuthSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "admin-signin"
    },

    username: {
      type: String,
      required: true,
      trim: true
    },

    passwordHash: {
      type: String,
      required: true,
      select: false
    },

    setupAt: {
      type: Date,
      default: Date.now
    },

    passwordUpdatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: "static_auth",
    timestamps: true
  }
);

module.exports =
  mongoose.models.StaticAuth || mongoose.model("StaticAuth", staticAuthSchema);
