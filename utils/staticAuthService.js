const crypto = require("crypto");
const { promisify } = require("util");
const StaticAuth = require("../models/StaticAuth");

const STATIC_AUTH_KEY = "admin-signin";
const PASSWORD_KEY_LENGTH = 64;
const scryptAsync = promisify(crypto.scrypt);

const hashPassword = async password => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(
    String(password),
    salt,
    PASSWORD_KEY_LENGTH
  );

  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
};

const verifyPassword = async (password, storedHash) => {
  const [algorithm, salt, key] = String(storedHash || "").split(":");

  if (algorithm !== "scrypt" || !salt || !key) {
    return false;
  }

  const expectedKey = Buffer.from(key, "hex");
  const actualKey = await scryptAsync(
    String(password),
    salt,
    expectedKey.length
  );

  if (actualKey.length !== expectedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualKey, expectedKey);
};

const getAdminAccount = () => {
  return StaticAuth.findOne({ key: STATIC_AUTH_KEY }).select("+passwordHash");
};

const getAdminSetupStatus = async () => {
  const account = await StaticAuth.exists({ key: STATIC_AUTH_KEY });

  return {
    adminConfigured: Boolean(account),
    setupRequired: !account
  };
};

const createInitialAdminCredentials = async ({ username, password }) => {
  const normalizedUsername = String(username || "").trim();
  const normalizedPassword = String(password || "");

  if (!normalizedUsername || !normalizedPassword) {
    const error = new Error("Username and password are required");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedPassword.length < 8) {
    const error = new Error("Password must be at least 8 characters long");
    error.statusCode = 400;
    throw error;
  }

  const existingAccount = await StaticAuth.exists({ key: STATIC_AUTH_KEY });

  if (existingAccount) {
    const error = new Error("Admin account is already configured");
    error.statusCode = 409;
    throw error;
  }

  let account;

  try {
    account = await StaticAuth.create({
      key: STATIC_AUTH_KEY,
      username: normalizedUsername,
      passwordHash: await hashPassword(normalizedPassword),
      setupAt: new Date(),
      passwordUpdatedAt: new Date()
    });
  } catch (error) {
    if (error.code === 11000) {
      const conflictError = new Error("Admin account is already configured");
      conflictError.statusCode = 409;
      throw conflictError;
    }

    throw error;
  }

  return {
    username: account.username,
    role: "admin"
  };
};

const validateAdminLogin = async ({ username, password }) => {
  const account = await getAdminAccount();

  if (!account) {
    return {
      isValid: false,
      setupRequired: true
    };
  }

  const normalizedUsername = String(username || "").trim();
  const usernameMatches = normalizedUsername === account.username;
  const passwordMatches = await verifyPassword(password, account.passwordHash);

  return {
    isValid: usernameMatches && passwordMatches,
    setupRequired: false,
    username: account.username
  };
};

module.exports = {
  createInitialAdminCredentials,
  getAdminSetupStatus,
  validateAdminLogin
};
