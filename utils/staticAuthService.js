const crypto = require("crypto");
const StaticAuth = require("../models/StaticAuth");
const { getRuntimeAppConfig } = require("./appConfig");

const STATIC_AUTH_KEY = "admin-signin";

const safeEqual = (actualValue, expectedValue) => {
  const actual = Buffer.from(String(actualValue || ""));
  const expected = Buffer.from(String(expectedValue || ""));

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
};

const getAdminFromSettings = async () => {
  const { adminUsername, adminPassword } = await getRuntimeAppConfig();

  if (!adminUsername || !adminPassword) {
    return null;
  }

  return {
    username: adminUsername,
    password: adminPassword
  };
};

const getAdminFromStaticAuth = () => {
  return StaticAuth.findOne({ key: STATIC_AUTH_KEY }).select("+password").lean();
};

const getAdminAccount = async () => {
  return (await getAdminFromSettings()) || (await getAdminFromStaticAuth());
};

const validateAdminLogin = async ({ username, password }) => {
  const account = await getAdminAccount();

  if (!account) {
    return {
      isConfigured: false,
      isValid: false
    };
  }

  const usernameMatches = safeEqual(username, account.username);
  const passwordMatches = safeEqual(password, account.password);

  return {
    isConfigured: true,
    isValid: usernameMatches && passwordMatches,
    username: account.username
  };
};

module.exports = {
  STATIC_AUTH_KEY,
  validateAdminLogin
};
