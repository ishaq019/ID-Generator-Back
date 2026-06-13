const { createAuthToken } = require("../utils/authTokenService");
const {
  createInitialAdminCredentials,
  getAdminSetupStatus,
  validateAdminLogin
} = require("../utils/staticAuthService");

const getSetupStatus = async (req, res, next) => {
  try {
    const setupStatus = await getAdminSetupStatus();

    return res.json({
      success: true,
      ...setupStatus
    });
  } catch (error) {
    next(error);
  }
};

const setupAdmin = async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    const account = await createInitialAdminCredentials({
      username,
      password
    });
    const token = createAuthToken(account.username);

    return res.status(201).json({
      success: true,
      message: "Admin account created successfully",
      token,
      user: {
        username: account.username,
        role: account.role
      }
    });
  } catch (error) {
    next(error);
  }
};

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

    if (loginResult.setupRequired) {
      return res.status(409).json({
        success: false,
        setupRequired: true,
        message: "Admin account is not configured yet"
      });
    }

    if (!loginResult.isValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password"
      });
    }

    const token = createAuthToken(loginResult.username);

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
  getSetupStatus,
  setupAdmin,
  login,
  getProfile
};
