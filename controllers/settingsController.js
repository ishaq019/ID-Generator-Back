const {
  getAppSettings,
  updateAppSettings
} = require("../utils/settingsService");

const getSettings = async (req, res, next) => {
  try {
    const settings = await getAppSettings();

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const settings = await updateAppSettings(req.body || {});

    res.json({
      success: true,
      message: "Settings updated successfully",
      settings
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings
};