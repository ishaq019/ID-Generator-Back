const ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD";
const DEFAULT_ALLOWED_HEADERS =
  "Content-Type,x-webhook-secret,x-requested-with,Accept,Origin";
const EXPOSED_HEADERS = "Content-Length,Content-Type,Content-Disposition";
const PREFLIGHT_MAX_AGE = "86400";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5175",
  "https://syedishaq.me",
  "https://www.syedishaq.me"
];

const parseOrigins = value => {
  return String(value || "")
    .split(",")
    .map(origin => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
};

const getAllowedOrigins = () => {
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...parseOrigins(process.env.CLIENT_URL),
    ...parseOrigins(process.env.CLIENT_URLS),
    ...parseOrigins(process.env.FRONTEND_URL)
  ]);
};

const resolveAllowedOrigin = req => {
  const requestOrigin = String(req.headers.origin || "")
    .trim()
    .replace(/\/+$/, "");

  if (!requestOrigin) {
    return "*";
  }

  if (getAllowedOrigins().has(requestOrigin)) {
    return requestOrigin;
  }

  // Keep API debugging friendly for tools/new preview URLs while still making
  // the known browser origins explicit above.
  return "*";
};

const appendVaryHeader = (res, value) => {
  const existingValue = String(res.getHeader("Vary") || "");
  const values = existingValue
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  if (!values.some(item => item.toLowerCase() === value.toLowerCase())) {
    values.push(value);
  }

  res.setHeader("Vary", values.join(", "));
};

const applyCorsHeaders = (req, res) => {
  const requestedHeaders = req.headers["access-control-request-headers"];
  const allowedOrigin = resolveAllowedOrigin(req);

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader(
    "Access-Control-Allow-Headers",
    requestedHeaders || DEFAULT_ALLOWED_HEADERS
  );
  res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  res.setHeader("Access-Control-Max-Age", PREFLIGHT_MAX_AGE);
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (allowedOrigin !== "*") {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.removeHeader("Access-Control-Allow-Credentials");
  }

  appendVaryHeader(res, "Origin");
  appendVaryHeader(res, "Access-Control-Request-Headers");
};

const corsMiddleware = (req, res, next) => {
  applyCorsHeaders(req, res);

  if (!res.locals.corsWriteHeadWrapped) {
    const originalWriteHead = res.writeHead;
    res.locals.corsWriteHeadWrapped = true;

    res.writeHead = function writeHeadWithCors(...args) {
      applyCorsHeaders(req, res);
      return originalWriteHead.apply(this, args);
    };
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
};

module.exports = {
  applyCorsHeaders,
  corsMiddleware
};
