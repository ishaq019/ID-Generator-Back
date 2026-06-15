const crypto = require("crypto");
const { getRuntimeAppConfig } = require("./appConfig");

const TOKEN_EXPIRES_IN_HOURS = 24;
let developmentAuthSecret = null;

const isProductionRuntime = () => {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
};

const getAuthSecret = async () => {
  const appConfig = await getRuntimeAppConfig();

  if (appConfig.authSecret) {
    return appConfig.authSecret;
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

const assertAuthSecretConfigured = async () => {
  await getAuthSecret();
};

const toBase64Url = value => {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
};

const fromBase64Url = value => {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
};

const createSignature = async payload => {
  return crypto
    .createHmac("sha256", await getAuthSecret())
    .update(payload)
    .digest("base64url");
};

const hasValidSignature = (signature, expectedSignature) => {
  const actual = Buffer.from(String(signature || ""), "base64url");
  const expected = Buffer.from(String(expectedSignature || ""), "base64url");

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
};

const createAuthToken = async username => {
  const payload = {
    username,
    role: "admin",
    exp: Date.now() + TOKEN_EXPIRES_IN_HOURS * 60 * 60 * 1000
  };

  const encodedPayload = toBase64Url(payload);
  const signature = await createSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
};

const verifyAuthToken = async token => {
  try {
    if (!token || !token.includes(".")) {
      return null;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [encodedPayload, signature] = parts;

    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = await createSignature(encodedPayload);

    if (!hasValidSignature(signature, expectedSignature)) {
      return null;
    }

    const payload = fromBase64Url(encodedPayload);

    if (!payload?.username || !payload?.exp || Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

module.exports = {
  assertAuthSecretConfigured,
  createAuthToken,
  verifyAuthToken
};
