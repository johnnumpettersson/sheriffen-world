import exifr from "exifr";

const MAX_DIMENSION = 3200;
const WEBP_QUALITY = 0.85;

export interface ImageExif {
  latitude: number | null;
  longitude: number | null;
  DateTimeOriginal: Date | null;
}

interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  exif: ImageExif | null;
}

export async function compressImage(file: File): Promise<CompressionResult> {
  const originalSize = file.size;

  // Extract EXIF from the original file before canvas strips it.
  let exif: ImageExif | null = null;
  try {
    const parsed = await exifr.parse(file, { gps: true, tiff: true });
    if (parsed) {
      exif = {
        latitude: parsed.latitude ?? null,
        longitude: parsed.longitude ?? null,
        DateTimeOriginal: parsed.DateTimeOriginal ?? null,
      };
    }
  } catch {
    // EXIF parsing is best-effort
  }

  try {
    // createImageBitmap decodes the file once and correctly applies EXIF
    // orientation, so width/height always reflect the displayed orientation.
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    // If image is already small, skip compression
    if (
      width <= MAX_DIMENSION &&
      height <= MAX_DIMENSION &&
      originalSize < 2 * 1024 * 1024
    ) {
      bitmap.close();
      return {
        file,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        exif,
      };
    }

    // Calculate new dimensions maintaining aspect ratio
    let newWidth = width;
    let newHeight = height;

    if (width > height && width > MAX_DIMENSION) {
      newWidth = MAX_DIMENSION;
      newHeight = Math.round((height / width) * MAX_DIMENSION);
    } else if (height > MAX_DIMENSION) {
      newHeight = MAX_DIMENSION;
      newWidth = Math.round((width / height) * MAX_DIMENSION);
    }

    const canvas = document.createElement("canvas");
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2d context");
    ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
    bitmap.close();

    return new Promise<CompressionResult>((resolve, reject) => {
      canvas.toBlob(
        (blob: Blob | null) => {
          if (!blob) {
            reject(new Error("Failed to compress image"));
            return;
          }

          const compressedFile = new File([blob], file.name, {
            type: "image/webp",
            lastModified: file.lastModified,
          });

          resolve({
            file: compressedFile,
            originalSize,
            compressedSize: blob.size,
            compressionRatio: blob.size / originalSize,
            exif,
          });
        },
        "image/webp",
        WEBP_QUALITY,
      );
    });
  } catch (error) {
    console.warn("Image compression failed, using original:", error);
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      exif,
    };
  }
}

export async function compressImages(
  files: File[],
): Promise<{ compressedFiles: File[]; results: CompressionResult[] }> {
  const results = await Promise.all(files.map((file) => compressImage(file)));
  const compressedFiles = results.map((result) => result.file);

  return { compressedFiles, results };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
