import React, { useRef, useState, useCallback } from "react";
import type { Locale } from "../../i18n";
import {
  compressImages,
  formatBytes as formatBytesUtil,
} from "../../utils/compressImage";
import styles from "./ImageUpload.module.css";

interface ImageUploadProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing?: boolean;
  isAuthenticated?: boolean;
  onRequireLogin?: () => void;
  uploadProgress?: {
    fileName: string;
    fileIndex: number;
    totalFiles: number;
    uploadedBytes: number;
    totalBytes: number;
  } | null;
  locale: Locale;
}

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
];
const MAX_FILE_SIZE_MB = 5 * 1024;

export default function ImageUpload({
  onFilesSelected,
  isProcessing = false,
  isAuthenticated = false,
  onRequireLogin,
  uploadProgress = null,
  locale,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionMessage, setCompressionMessage] = useState<string | null>(
    null,
  );
  const t =
    locale === "sv"
      ? {
          unsupportedType: (name: string) =>
            `"${name}" ar inte en bildtyp som stods.`,
          tooLarge: (name: string) =>
            `"${name}" overskrider gransen pa ${MAX_FILE_SIZE_MB} MB.`,
          loginRequired: "Logga in innan du laddar upp bilder.",
          ariaLabel: "Ladda upp bilder genom att klicka eller släppa filer",
          processing: "Bearbetar bilder...",
          processingFile: (index: number, total: number, name: string) =>
            `Laddar upp ${index}/${total}: ${name}`,
          dropPrefix: "Släpp bilder här eller",
          browse: "klicka for att välja",
          hint: `JPEG · PNG · WebP · GIF · Max ${MAX_FILE_SIZE_MB} MB · GPS upptäcks automatiskt`,
          authHint: "Inloggning kravs!",
        }
      : {
          unsupportedType: (name: string) =>
            `"${name}" is not a supported image type.`,
          tooLarge: (name: string) =>
            `"${name}" exceeds the ${MAX_FILE_SIZE_MB} MB limit.`,
          loginRequired: "Please log in before uploading images.",
          ariaLabel: "Upload images by clicking or dropping files",
          processing: "Processing images...",
          processingFile: (index: number, total: number, name: string) =>
            `Uploading ${index}/${total}: ${name}`,
          dropPrefix: "Drop images here or",
          browse: "click to browse",
          hint: `JPEG · PNG · WebP · GIF · Max ${MAX_FILE_SIZE_MB} MB · GPS auto-detected`,
          authHint: "Login required!",
        };

  const validate = (files: File[]): File[] => {
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        errors.push(t.unsupportedType(file.name));
        continue;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        errors.push(t.tooLarge(file.name));
        continue;
      }
      valid.push(file);
    }

    setError(errors.length > 0 ? errors.join(" ") : null);
    return valid;
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      if (!isAuthenticated) {
        setError(t.loginRequired);
        onRequireLogin?.();
        return;
      }

      const valid = validate(Array.from(files));
      if (valid.length === 0) return;

      setIsCompressing(true);
      setCompressionMessage(null);
      setError(null);

      try {
        const { compressedFiles, results } = await compressImages(valid);

        const totalOriginal = results.reduce(
          (sum, r) => sum + r.originalSize,
          0,
        );
        const totalCompressed = results.reduce(
          (sum, r) => sum + r.compressedSize,
          0,
        );
        const avgRatio = (totalCompressed / totalOriginal) * 100;

        setCompressionMessage(
          `Compressed: ${formatBytesUtil(totalOriginal)} → ${formatBytesUtil(totalCompressed)} (${avgRatio.toFixed(0)}%)`,
        );

        onFilesSelected(compressedFiles);
        setTimeout(() => setCompressionMessage(null), 3000);
      } catch (err) {
        console.error("Compression failed:", err);
        setError(
          locale === "sv"
            ? "Fel vid komprimering av bilder"
            : "Failed to compress images",
        );
      } finally {
        setIsCompressing(false);
      }
    },
    [isAuthenticated, onFilesSelected, onRequireLogin, t, locale],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);
  const totalBytes = uploadProgress?.totalBytes ?? 0;
  const uploadedBytes = uploadProgress?.uploadedBytes ?? 0;
  const progressPercent =
    totalBytes > 0 ? Math.min(100, (uploadedBytes / totalBytes) * 100) : 0;

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.dropzone} ${isDragging ? styles.dragging : ""} ${isProcessing || isCompressing ? styles.processing : ""}`}
        onClick={() => {
          if (isProcessing || isCompressing) return;
          if (!isAuthenticated) {
            setError(t.loginRequired);
            onRequireLogin?.();
            return;
          }

          inputRef.current?.click();
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        aria-label={t.ariaLabel}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className={styles.hiddenInput}
          onChange={onInputChange}
          aria-hidden="true"
        />
        {isProcessing || isCompressing ? (
          <>
            <span className={styles.processingText}>
              {isCompressing ? "Compressing images..." : t.processing}
            </span>
            {uploadProgress ? (
              <>
                <p className={styles.progressFile}>
                  {t.processingFile(
                    uploadProgress.fileIndex + 1,
                    uploadProgress.totalFiles,
                    uploadProgress.fileName,
                  )}
                </p>
                <div className={styles.progressBarTrack}>
                  <span
                    className={styles.progressBarFill}
                    style={{ width: `${progressPercent.toFixed(1)}%` }}
                  />
                </div>
                <p className={styles.progressStats}>
                  {`${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)} (${Math.round(progressPercent)}%)`}
                </p>
              </>
            ) : null}
          </>
        ) : (
          <>
            <svg
              className={styles.uploadIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 16V4m0 0L8 8m4-4 4 4" />
              <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1" />
            </svg>
            <p className={styles.label}>
              {t.dropPrefix} <strong>{t.browse}</strong>
            </p>
            <p className={styles.hint}>{t.hint}</p>
            {!isAuthenticated && (
              <p className={styles.authHint}>{t.authHint}</p>
            )}
          </>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {compressionMessage && (
        <p className={styles.info} role="status">
          {compressionMessage}
        </p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
