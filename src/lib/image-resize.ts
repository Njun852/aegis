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
