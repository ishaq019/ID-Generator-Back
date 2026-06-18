const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const connectDB = require("./config/db");
const seedDefaultTemplates = require("./utils/defaultTemplates");
const { getAppConfig } = require("./utils/appConfig");
const { assertAuthSecretConfigured } = require("./utils/authTokenService");

const authRoutes = require("./routes/authRoutes");
const templateRoutes = require("./routes/templateRoutes");
const cardRoutes = require("./routes/cardRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const fileRoutes = require("./routes/fileRoutes");
const googleFormRoutes = require("./routes/googleFormRoutes");

const { protect } = require("./middleware/authMiddleware");
const { corsMiddleware } = require("./middleware/corsMiddleware");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();
const appConfig = getAppConfig();

let serverReadyPromise = null;

const prepareServer = async () => {
  if (!serverReadyPromise) {
    serverReadyPromise = (async () => {
      await connectDB();
      await assertAuthSecretConfigured();
      await seedDefaultTemplates();
    })().catch(error => {
      serverReadyPromise = null;
      throw error;
    });
  }

  return serverReadyPromise;
};

const ensureServerReady = async (req, res, next) => {
  try {
    await prepareServer();
    next();
  } catch (error) {
    res.status(503);
    next(error);
  }
};

app.use(corsMiddleware);
app.use(express.json({ limit: appConfig.requestBodyLimit }));
app.use(
  express.urlencoded({
    extended: true,
    limit: appConfig.requestBodyLimit
  })
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.json({ message: "ID Card Generator API is running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/ready", async (req, res, next) => {
  try {
    await prepareServer();
    res.json({ status: "ready" });
  } catch (error) {
    res.status(503);
    next(error);
  }
});

app.get("/health/ready", async (req, res, next) => {
  try {
    await prepareServer();
    res.json({ status: "ready" });
  } catch (error) {
    res.status(503);
    next(error);
  }
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) {
    return next();
  }

  return ensureServerReady(req, res, next);
});

/*
  Public:
  - auth/login must be public.
  - files must be public because <img src=""> cannot send Authorization header.
  - google-form route stays public from login, but protected using x-webhook-secret.
*/
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/google-form", googleFormRoutes);

/*
  Protected admin routes.
*/
app.use("/api/uploads", protect, uploadRoutes);
app.use("/api/upload", protect, uploadRoutes);
app.use("/api/templates", protect, templateRoutes);
app.use("/api/cards", protect, cardRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    prepareServer().catch(error => {
      console.error("Server readiness failed:", error.message);
      console.error(
        "The HTTP server is still running. Fix the environment/database configuration and restart the dyno."
      );
    });
  });
}

module.exports = app;
