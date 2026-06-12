const {
  createAuthToken,
  validateStaticLogin
} = require("../config/staticAuth");

const login = (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Username and password are required"
    });
  }

  const isValid = validateStaticLogin({ username, password });

  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: "Invalid username or password"
    });
  }

  const token = createAuthToken(username);

  return res.json({
    success: true,
    message: "Login successful",
    token,
    user: {
      username,
      role: "admin"
    }
  });
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