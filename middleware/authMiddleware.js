const { verifyAuthToken } = require("../utils/authTokenService");

const getBearerToken = req => {
  const parts = String(req.headers.authorization || "").trim().split(/\s+/);
  return parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : "";
};

const rejectUnauthorized = (res, message) => {
  return res.status(401).json({
    success: false,
    message
  });
};

const protect = async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return rejectUnauthorized(res, "Authentication token is missing");
    }

    const decoded = await verifyAuthToken(token);

    if (!decoded) {
      return rejectUnauthorized(res, "Invalid or expired authentication token");
    }

    req.user = {
      username: decoded.username,
      role: decoded.role
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  protect
};
