const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const BG_REMOVAL_PACKAGE_ENTRY = require.resolve(
  "@imgly/background-removal-node",
);
const BG_REMOVAL_ASSET_DIR = path.dirname(BG_REMOVAL_PACKAGE_ENTRY);
const BG_REMOVAL_WORKER_PATH = path.join(
  __dirname,
  "backgroundRemovalWorker.js",
);

const SUPPORTED_MODELS = new Set(["small", "medium"]);
const DEFAULT_MAX_DIMENSION = 1024;

const toDirectoryFileUrl = (directoryPath) => {
  const href = pathToFileURL(directoryPath).href;
  return href.endsWith("/") ? href : `${href}/`;
};

const BG_REMOVAL_PUBLIC_PATH = toDirectoryFileUrl(BG_REMOVAL_ASSET_DIR);

const normalizePublicPath = (value) => {
  const publicPath = String(value || BG_REMOVAL_PUBLIC_PATH).trim();
  return publicPath.endsWith("/") ? publicPath : `${publicPath}/`;
};

const getSafeModel = (value) => {
  const model = String(value || "small")
    .trim()
    .toLowerCase();
  return SUPPORTED_MODELS.has(model) ? model : "small";
};

const getSafeDimension = (value) => {
  const dimension = Number(value || DEFAULT_MAX_DIMENSION);

  if (!Number.isFinite(dimension)) {
    return DEFAULT_MAX_DIMENSION;
  }

  return Math.min(Math.max(Math.round(dimension), 256), 2048);
};

const buildPngFileName = (originalName) => {
  const baseName =
    path
      .basename(
        String(originalName || "photo"),
        path.extname(String(originalName || "photo")),
      )
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "photo";

  return `${baseName}.png`;
};

const runBackgroundRemovalWorker = (requestPath) => {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [BG_REMOVAL_WORKER_PATH, requestPath],
      {
        cwd: path.resolve(__dirname, ".."),
        env: process.env,
        windowsHide: true,
      },
    );

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("error", reject);

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          stderr ||
            stdout ||
            `Background removal worker exited with status ${code}`,
        ),
      );
    });
  });
};

const removeBackgroundFromUpload = async (file, options = {}) => {
  if (!file?.buffer?.length) {
    throw new Error("Image buffer is missing for background removal");
  }

  const finalFileName = buildPngFileName(
    options.fileName || file.driveFileName || file.originalname,
  );

  const model = getSafeModel(
    options.model || process.env.BG_REMOVAL_MODEL || "small",
  );
  const maxDimension = getSafeDimension(
    options.maxDimension || process.env.BG_REMOVAL_MAX_DIMENSION,
  );
  const publicPath = normalizePublicPath(
    options.publicPath || process.env.BG_REMOVAL_PUBLIC_PATH,
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "id-bg-"));
  const tempInputPath = path.join(tempDir, "input");
  const tempOutputPath = path.join(tempDir, "output.png");
  const requestPath = path.join(tempDir, "request.json");

  try {
    fs.writeFileSync(tempInputPath, file.buffer);
    fs.writeFileSync(
      requestPath,
      JSON.stringify({
        inputPath: tempInputPath,
        outputPath: tempOutputPath,
        model,
        maxDimension,
        publicPath,
      }),
    );

    await runBackgroundRemovalWorker(requestPath);

    if (!fs.existsSync(tempOutputPath)) {
      throw new Error(
        "Background removal worker did not return an output image",
      );
    }

    const finalPngBuffer = fs.readFileSync(tempOutputPath);

    return {
      ...file,
      originalname: finalFileName,
      driveFileName: finalFileName,
      mimetype: "image/png",
      size: finalPngBuffer.length,
      buffer: finalPngBuffer,
    };
  } finally {
    try {
      if (fs.existsSync(tempInputPath)) {
        fs.unlinkSync(tempInputPath);
      }

      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.warn("BG REMOVER TEMP CLEANUP FAILED:", cleanupError.message);
    }
  }
};

module.exports = {
  removeBackgroundFromUpload,
};
