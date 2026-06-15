const crypto = require("crypto");
const StaticAuth = require("../models/StaticAuth");

const STATIC_AUTH_KEY = "admin-signin";

const timingSafeStringEqual = (actualValue, expectedValue) => {
  const actual = Buffer.from(String(actualValue || ""));
  const expected = Buffer.from(String(expectedValue || ""));

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
};

const getAdminAccount = () => {
  return StaticAuth.findOne({ key: STATIC_AUTH_KEY }).select("+password");
};

const validateAdminLogin = async ({ username, password }) => {
  const account = await getAdminAccount();

  if (!account) {
    return {
      isConfigured: false,
      isValid: false
    };
  }

  const usernameMatches = timingSafeStringEqual(username, account.username);
  const passwordMatches = timingSafeStringEqual(password, account.password);

  return {
    isConfigured: true,
    isValid: usernameMatches && passwordMatches,
    username: account.username
  };
};

module.exports = {
  validateAdminLogin
};
