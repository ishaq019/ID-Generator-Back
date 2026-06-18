const ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD";
const DEFAULT_ALLOWED_HEADERS =
  "Content-Type,Authorization,x-webhook-secret,x-requested-with,Accept,Origin";
const EXPOSED_HEADERS = "Content-Length,Content-Type,Content-Disposition";
const PREFLIGHT_MAX_AGE = "86400";

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

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader(
    "Access-Control-Allow-Headers",
    requestedHeaders || DEFAULT_ALLOWED_HEADERS
  );
  res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  res.setHeader("Access-Control-Max-Age", PREFLIGHT_MAX_AGE);
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  appendVaryHeader(res, "Origin");
  appendVaryHeader(res, "Access-Control-Request-Headers");
};

const corsMiddleware = (req, res, next) => {
  applyCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
};

module.exports = {
  applyCorsHeaders,
  corsMiddleware
};
