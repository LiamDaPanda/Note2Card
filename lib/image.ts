/**
 * Client-side image preparation.
 *
 * Downscaling before upload is free accuracy-wise — the model downsamples large
 * images anyway — but it cuts the image token count several-fold and makes the
 * upload itself far faster on a phone connection. Re-encoding through a canvas
 * also drops EXIF, so location data in a photo never leaves the device.
 */

/** Long-edge cap. Comfortably enough for handwriting; well under the model's own limit. */
export const MAX_EDGE = 1200;

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 10;

export function isAcceptedImage(type: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

export function isPdf(type: string): boolean {
  return type === "application/pdf";
}

/**
 * Scale an image down to fit MAX_EDGE and re-encode as JPEG.
 * Returns the original file untouched if the browser can't decode it.
 */
export async function downscale(file: File): Promise<File> {
  if (!isAcceptedImage(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close();
      return file;
    }

    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) return file;

    return new File([blob], replaceExtension(file.name, "jpg"), { type: "image/jpeg" });
  } catch {
    // A format the browser can't decode still gets a chance server-side.
    return file;
  }
}

function replaceExtension(name: string, extension: string): string {
  return name.replace(/\.[^.]+$/, "") + "." + extension;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
