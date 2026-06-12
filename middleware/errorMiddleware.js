const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);

  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  if (err.code === 11000) {
    return res.status(400).json({ message: "Duplicate value already exists" });
  }

  res.status(statusCode).json({
    message: err.message || "Server Error"
  });
};

module.exports = { notFound, errorHandler };
