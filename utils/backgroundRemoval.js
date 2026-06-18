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
const DEFAULT_WORKER_TIMEOUT_MS = 22000;
const FALLBACK_COLOR_TOLERANCE = 92;
const FALLBACK_EDGE_BAND_RATIO = 0.14;

let sharpInstance = null;

const getSharp = () => {
  if (sharpInstance) return sharpInstance;

  try {
    sharpInstance = require(
      path.resolve(BG_REMOVAL_ASSET_DIR, "../node_modules/sharp"),
    );
  } catch {
    sharpInstance = require("sharp");
  }

  sharpInstance.concurrency(1);
  sharpInstance.cache(false);

  return sharpInstance;
};

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

const getSafeTimeoutMs = (value) => {
  const timeoutMs = Number(value || process.env.BG_REMOVAL_TIMEOUT_MS);

  if (!Number.isFinite(timeoutMs)) {
    return DEFAULT_WORKER_TIMEOUT_MS;
  }

  return Math.min(Math.max(Math.round(timeoutMs), 5000), 28000);
};

const shouldUseFallback = (value) => {
  return !["false", "0", "no", "off"].includes(
    String(value ?? process.env.BG_REMOVAL_FALLBACK_ENABLED ?? "true")
      .trim()
      .toLowerCase(),
  );
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

const runBackgroundRemovalWorker = (requestPath, timeoutMs) => {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [BG_REMOVAL_WORKER_PATH, requestPath],
      {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || "1",
          ORT_NUM_THREADS: process.env.ORT_NUM_THREADS || "1",
          UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || "2",
        },
        windowsHide: true,
      },
    );

    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (timedOut) {
        reject(
          new Error(
            `Background removal worker timed out after ${timeoutMs}ms`,
          ),
        );
        return;
      }

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

const colorDistance = (pixel, color) => {
  const dr = pixel.r - color.r;
  const dg = pixel.g - color.g;
  const db = pixel.b - color.b;

  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const getPixel = (buffer, index) => {
  const offset = index * 4;

  return {
    r: buffer[offset],
    g: buffer[offset + 1],
    b: buffer[offset + 2],
    a: buffer[offset + 3],
  };
};

const isUsableBackgroundSample = ({ r, g, b, a }) => {
  if (a < 128) return false;

  const luma = 0.299 * r + 0.587 * g + 0.114 * b;

  return luma > 35;
};

const quantizeColor = ({ r, g, b }) => {
  return `${Math.round(r / 16)},${Math.round(g / 16)},${Math.round(b / 16)}`;
};

const getSeedBands = (width, height) => {
  return {
    x: Math.max(2, Math.round(width * FALLBACK_EDGE_BAND_RATIO)),
    y: Math.max(2, Math.round(height * FALLBACK_EDGE_BAND_RATIO)),
  };
};

const isSeedRegion = (x, y, width, height, bands) => {
  return (
    x < bands.x ||
    x >= width - bands.x ||
    y < bands.y ||
    y >= height - bands.y
  );
};

const detectBackgroundColor = (buffer, width, height) => {
  const bands = getSeedBands(width, height);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));
  const colorBuckets = new Map();
  const fallbackBuckets = new Map();

  const addSample = (buckets, pixel) => {
    const key = quantizeColor(pixel);
    const bucket = buckets.get(key) || {
      count: 0,
      r: 0,
      g: 0,
      b: 0,
    };

    bucket.count += 1;
    bucket.r += pixel.r;
    bucket.g += pixel.g;
    bucket.b += pixel.b;
    buckets.set(key, bucket);
  };

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (!isSeedRegion(x, y, width, height, bands)) continue;

      const pixel = getPixel(buffer, y * width + x);
      addSample(fallbackBuckets, pixel);

      if (isUsableBackgroundSample(pixel)) {
        addSample(colorBuckets, pixel);
      }
    }
  }

  const buckets = colorBuckets.size ? colorBuckets : fallbackBuckets;
  const bestBucket = [...buckets.values()].sort(
    (a, b) => b.count - a.count,
  )[0];

  if (!bestBucket) {
    throw new Error("Could not detect a solid photo background color");
  }

  return {
    r: Math.round(bestBucket.r / bestBucket.count),
    g: Math.round(bestBucket.g / bestBucket.count),
    b: Math.round(bestBucket.b / bestBucket.count),
  };
};

const buildConnectedBackgroundMask = (buffer, width, height, bgColor) => {
  const totalPixels = width * height;
  const bands = getSeedBands(width, height);
  const tolerance = Number(process.env.BG_REMOVAL_FALLBACK_TOLERANCE) ||
    FALLBACK_COLOR_TOLERANCE;
  const matched = new Uint8Array(totalPixels);
  const mask = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  for (let index = 0; index < totalPixels; index += 1) {
    const pixel = getPixel(buffer, index);

    if (pixel.a > 0 && colorDistance(pixel, bgColor) <= tolerance) {
      matched[index] = 1;
    }
  }

  const enqueue = (index) => {
    if (!matched[index] || mask[index]) return;

    mask[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isSeedRegion(x, y, width, height, bands)) {
        enqueue(y * width + x);
      }
    }
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;

    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }

  return {
    mask,
    removedPixels: tail,
  };
};

const applyBackgroundMask = (buffer, mask) => {
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) {
      buffer[index * 4 + 3] = 0;
    }
  }

  return buffer;
};

const removeSolidBackgroundFromUpload = async (file, options = {}) => {
  const sharp = getSharp();
  const maxDimension = getSafeDimension(
    options.maxDimension || process.env.BG_REMOVAL_MAX_DIMENSION,
  );
  const finalFileName = buildPngFileName(
    options.fileName || file.driveFileName || file.originalname,
  );
  const { data, info } = await sharp(file.buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bgColor = detectBackgroundColor(data, info.width, info.height);
  const { mask, removedPixels } = buildConnectedBackgroundMask(
    data,
    info.width,
    info.height,
    bgColor,
  );
  const removedRatio = removedPixels / (info.width * info.height);

  if (removedRatio < 0.02) {
    throw new Error("Fallback background remover could not find enough background pixels");
  }

  const pngBuffer = await sharp(applyBackgroundMask(data, mask), {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();

  return {
    ...file,
    originalname: finalFileName,
    driveFileName: finalFileName,
    mimetype: "image/png",
    size: pngBuffer.length,
    buffer: pngBuffer,
    backgroundRemovalMode: "solid-color-fallback",
  };
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
  const timeoutMs = getSafeTimeoutMs(options.timeoutMs);
  const fallbackEnabled = shouldUseFallback(options.fallbackEnabled);

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

    await runBackgroundRemovalWorker(requestPath, timeoutMs);

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
      backgroundRemovalMode: "ml",
    };
  } catch (error) {
    if (!fallbackEnabled) {
      throw error;
    }

    console.warn(
      "ML background removal failed, trying solid-color fallback:",
      error.message,
    );

    return removeSolidBackgroundFromUpload(file, options);
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
  removeSolidBackgroundFromUpload,
};
