const crypto = require("crypto");
const { getRuntimeAppConfig } = require("./appConfig");

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
let developmentAuthSecret = null;

const isProductionRuntime = () =>
  process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

const getAuthSecret = async () => {
  const { authSecret } = await getRuntimeAppConfig();

  if (authSecret) {
    return authSecret;
  }

  if (isProductionRuntime()) {
    throw new Error("AUTH_SECRET is required in MongoDB settings or env");
  }

  if (!developmentAuthSecret) {
    developmentAuthSecret = crypto.randomBytes(32).toString("hex");
    console.warn(
      "AUTH_SECRET is missing. Using a temporary development auth secret for this process."
    );
  }

  return developmentAuthSecret;
};

const assertAuthSecretConfigured = () => getAuthSecret();

const encodePayload = payload =>
  Buffer.from(JSON.stringify(payload)).toString("base64url");

const decodePayload = payload =>
  JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

const sign = async value => {
  return crypto
    .createHmac("sha256", await getAuthSecret())
    .update(value)
    .digest("base64url");
};

const safeEqual = (signature, expectedSignature) => {
  const actual = Buffer.from(String(signature || ""), "base64url");
  const expected = Buffer.from(String(expectedSignature || ""), "base64url");

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
};

const createAuthToken = async username => {
  const encodedPayload = encodePayload({
    username,
    role: "admin",
    exp: Date.now() + TOKEN_TTL_MS
  });

  return `${encodedPayload}.${await sign(encodedPayload)}`;
};

const verifyAuthToken = async token => {
  try {
    const [encodedPayload, signature, extra] = String(token || "").split(".");

    if (!encodedPayload || !signature || extra) {
      return null;
    }

    const expectedSignature = await sign(encodedPayload);

    if (!safeEqual(signature, expectedSignature)) {
      return null;
    }

    const payload = decodePayload(encodedPayload);
    const expiresAt = Number(payload.exp || payload.expiresAt);

    if (!payload?.username || !expiresAt || Date.now() > expiresAt) {
      return null;
    }

    return {
      username: payload.username,
      role: payload.role || "admin"
    };
  } catch {
    return null;
  }
};

module.exports = {
  assertAuthSecretConfigured,
  createAuthToken,
  verifyAuthToken
};
