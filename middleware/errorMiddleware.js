const { applyCorsHeaders } = require("./corsMiddleware");

const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
};

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  applyCorsHeaders(req, res);

  const statusCode =
    err.statusCode || err.status || (res.statusCode === 200 ? 500 : res.statusCode);

  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format"
    });
  }

  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: "Duplicate value already exists"
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request body is too large"
    });
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || "Server Error"
  });
};

module.exports = { notFound, errorHandler };
