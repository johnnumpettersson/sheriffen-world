import React, { useRef, useState, useCallback } from "react";
import type { Locale } from "../../i18n";
import { compressImages } from "../../utils/compressImage";
import styles from "./ImageUpload.module.css";

interface ImageUploadProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing?: boolean;
  isAuthenticated?: boolean;
  onRequireLogin?: () => void;
  onLogout?: () => void;
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
  onLogout,
  uploadProgress = null,
  locale,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
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
          authHint: "Inloggning krävs!",
          loginToUpload: "Logga in",
          logout: "Logga ut",
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
          loginToUpload: "Log in to upload",
          logout: "Log out",
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
        onRequireLogin?.();
        return;
      }

      const valid = validate(Array.from(files));
      if (valid.length === 0) return;

      setIsCompressing(true);
      setError(null);

      try {
        const { compressedFiles } = await compressImages(valid);

        onFilesSelected(compressedFiles);
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
        {(isProcessing || isCompressing) && (
          <div className={styles.progressBarTrack}>
            <span
              className={styles.progressBarFill}
              style={{ width: `${progressPercent.toFixed(1)}%` }}
            />
          </div>
        )}
      </div>
      <div className={styles.authRow}>
        {isAuthenticated ? (
          <button
            type="button"
            className={`${styles.belowBoxBtn} ${styles.belowBoxBtnLoggedIn}`}
            onClick={onLogout}
          >
            ✓ {t.logout}
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.belowBoxBtn} ${styles.belowBoxBtnLogin}`}
            onClick={onRequireLogin}
          >
            → {t.loginToUpload}
          </button>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

