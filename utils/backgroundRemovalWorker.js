const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");

const BG_REMOVAL_PACKAGE_ENTRY = require.resolve(
  "@imgly/background-removal-node",
);
const BG_REMOVAL_ASSET_DIR = path.dirname(BG_REMOVAL_PACKAGE_ENTRY);

// Keep this worker on the remover package's sharp/libvips version. Loading it
// in a separate process avoids native sharp conflicts with the rest of the app.
const loadSharp = () => {
  try {
    return require(path.resolve(BG_REMOVAL_ASSET_DIR, "../node_modules/sharp"));
  } catch {
    return require("sharp");
  }
};

const sharp = loadSharp();

sharp.concurrency(1);
sharp.cache(false);

const loadRemoveBackground = async () => {
  const moduleData = await import("@imgly/background-removal-node");

  const removeBackground =
    moduleData.removeBackground ||
    moduleData.default?.removeBackground ||
    moduleData.default;

  if (typeof removeBackground !== "function") {
    throw new Error("removeBackground function was not found");
  }

  return removeBackground;
};

const resultToBuffer = async (result) => {
  if (Buffer.isBuffer(result)) return result;

  if (result instanceof Uint8Array) {
    return Buffer.from(result);
  }

  if (result && typeof result.arrayBuffer === "function") {
    return Buffer.from(await result.arrayBuffer());
  }

  throw new Error("Background remover returned unsupported output format");
};

const run = async () => {
  const requestPath = process.argv[2];

  if (!requestPath) {
    throw new Error("Background removal request path is required");
  }

  const request = JSON.parse(await fs.readFile(requestPath, "utf8"));
  const tempDir = path.dirname(request.outputPath);
  const normalizedInputPath = path.join(tempDir, "normalized-input.png");

  await sharp(request.inputPath, { failOn: "none" })
    .rotate()
    .resize({
      width: request.maxDimension,
      height: request.maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toFile(normalizedInputPath);

  const removeBackground = await loadRemoveBackground();
  const removedResult = await removeBackground(
    pathToFileURL(normalizedInputPath).href,
    {
      publicPath: request.publicPath,
      model: request.model,
      output: {
        format: "image/png",
        quality: 0.95,
      },
      debug: false,
    },
  );

  const removedBuffer = await resultToBuffer(removedResult);
  const finalPngBuffer = await sharp(removedBuffer, { failOn: "none" })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();

  await fs.writeFile(request.outputPath, finalPngBuffer);
};

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
