import Pica from "pica";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pica = (Pica as any).default || Pica;

const MAX_DIMENSION = 3200;
const WEBP_QUALITY = 0.85;

interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

async function getImageDimensions(file: File): Promise<{
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

export async function compressImage(file: File): Promise<CompressionResult> {
  const originalSize = file.size;

  try {
    // Get image dimensions
    const { width, height } = await getImageDimensions(file);

    // If image is already small, skip compression
    if (
      width <= MAX_DIMENSION &&
      height <= MAX_DIMENSION &&
      originalSize < 2 * 1024 * 1024
    ) {
      return {
        file,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
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

    // Create canvas for resizing
    const canvas = document.createElement("canvas");
    canvas.width = newWidth;
    canvas.height = newHeight;

    // Use Pica for high-quality resizing
    const picaInstance = pica();
    const img = new Image();
    img.src = URL.createObjectURL(file);

    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
    });

    const resizedCanvas = await picaInstance.resize(img, canvas);

    // Convert to blob with quality setting
    return new Promise<CompressionResult>((resolve, reject) => {
      resizedCanvas.toBlob(
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
