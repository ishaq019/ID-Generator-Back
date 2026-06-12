const crypto = require("crypto");

const STATIC_ADMIN_USERNAME = "admin";
const STATIC_ADMIN_PASSWORD = "Admin@123";

const AUTH_SECRET =
  process.env.AUTH_SECRET || "id-card-generator-static-auth-secret-change-later";

const TOKEN_EXPIRES_IN_HOURS = 24;

const toBase64Url = value => {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
};

const fromBase64Url = value => {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
};

const createSignature = payload => {
  return crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payload)
    .digest("base64url");
};

const createAuthToken = username => {
  const payload = {
    username,
    role: "admin",
    exp: Date.now() + TOKEN_EXPIRES_IN_HOURS * 60 * 60 * 1000
  };

  const encodedPayload = toBase64Url(payload);
  const signature = createSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
};

const verifyAuthToken = token => {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  const expectedSignature = createSignature(encodedPayload);

  if (signature !== expectedSignature) {
    return null;
  }

  const payload = fromBase64Url(encodedPayload);

  if (!payload?.exp || Date.now() > payload.exp) {
    return null;
  }

  return payload;
};

const validateStaticLogin = ({ username, password }) => {
  return username === STATIC_ADMIN_USERNAME && password === STATIC_ADMIN_PASSWORD;
};

module.exports = {
  STATIC_ADMIN_USERNAME,
  STATIC_ADMIN_PASSWORD,
  createAuthToken,
  verifyAuthToken,
  validateStaticLogin
};