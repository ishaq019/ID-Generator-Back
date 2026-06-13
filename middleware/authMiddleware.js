const { verifyAuthToken } = require("../utils/authTokenService");

const protect = (req, res, next) => {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is missing"
    });
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyAuthToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token"
    });
  }

  req.user = {
    username: decoded.username,
    role: decoded.role
  };

  next();
};

module.exports = {
  protect
};
