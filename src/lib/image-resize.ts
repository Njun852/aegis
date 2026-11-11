/**
 * Shrinks an image in the browser before it is uploaded. A phone photo is
 * several megabytes and 4000px across; nothing downstream needs that, and for
 * the AI the pixel count is what is billed.
 *
 * Browser-only: it needs a canvas.
 */
export async function shrinkImage(
  file: File,
  options: { maxEdge: number; type: "image/jpeg" | "image/png"; quality?: number },
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, options.maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot resize images.");
  if (options.type === "image/jpeg") {
    // JPEG has no transparency; a transparent logo would otherwise turn black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  return { dataUrl: canvas.toDataURL(options.type, options.quality ?? 0.85), width, height };
}

/**
 * A photo or scan of a signature, made ready to print: the paper turned
 * transparent so only the ink is left, trimmed to the ink, and shrunk. A photo
 * of a signature on white paper then sits cleanly on the PDF's white box.
 *
 * Pixels lighter than the paper threshold become transparent; darker ones keep
 * their colour, with their opacity following how dark they are, so pen edges
 * stay smooth. Throws when no ink is found.
 */
export async function signatureImage(file: File, maxWidth = 600): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot read images.");
  // White under any transparency in the upload, so it reads as paper.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;

  // The paper's brightness, from the lightest tenth of the image, so a photo
  // taken in poor light still finds its paper.
  const levels = new Uint32Array(256);
  for (let index = 0; index < data.length; index += 4) {
    levels[Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2])] += 1;
  }
  let seen = 0;
  let paper = 255;
  for (let level = 255; level >= 0; level -= 1) {
    seen += levels[level];
    if (seen >= (width * height) / 10) {
      paper = level;
      break;
    }
  }
  const inkBelow = paper * 0.78;

  let top = height;
  let left = width;
  let bottom = -1;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const light = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
      if (light >= inkBelow) {
        data[index + 3] = 0;
        continue;
      }
      // Darker ink is more opaque; the lightest ink fades out at the threshold.
      data[index + 3] = Math.round(255 * Math.min(1, (inkBelow - light) / (inkBelow * 0.5)));
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) throw new Error("No signature was found in that image. Use a photo of dark ink on white paper.");
  context.putImageData(pixels, 0, 0);

  const pad = 4;
  const cropLeft = Math.max(0, left - pad);
  const cropTop = Math.max(0, top - pad);
  const cropWidth = Math.min(width, right + pad + 1) - cropLeft;
  const cropHeight = Math.min(height, bottom + pad + 1) - cropTop;
  const out = Math.min(1, maxWidth / cropWidth);

  const trimmed = document.createElement("canvas");
  trimmed.width = Math.max(1, Math.round(cropWidth * out));
  trimmed.height = Math.max(1, Math.round(cropHeight * out));
  const trimmedContext = trimmed.getContext("2d");
  if (!trimmedContext) throw new Error("This browser cannot read images.");
  trimmedContext.drawImage(canvas, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, trimmed.width, trimmed.height);
  return trimmed.toDataURL("image/png");
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // Honours the EXIF rotation, so a portrait phone photo stays upright.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to the element, which some formats need.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new Error("That image could not be read. Try a JPEG or PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
