const { createAuthToken } = require("../utils/authTokenService");
const {
  STATIC_AUTH_KEY,
  validateAdminLogin
} = require("../utils/staticAuthService");

const login = async (req, res, next) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Username and password are required"
    });
  }

  try {
    const loginResult = await validateAdminLogin({ username, password });

    if (!loginResult.isConfigured) {
      return res.status(503).json({
        success: false,
        message:
          `Admin account is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD, or add the "${STATIC_AUTH_KEY}" document in MongoDB static_auth collection.`
      });
    }

    if (!loginResult.isValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password"
      });
    }

    const token = await createAuthToken(loginResult.username);

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        username: loginResult.username,
        role: "admin"
      }
    });
  } catch (error) {
    next(error);
  }
};

const getProfile = (req, res) => {
  return res.json({
    success: true,
    user: {
      username: req.user.username,
      role: req.user.role
    }
  });
};

module.exports = {
  login,
  getProfile
};
