import type { GalleryImage } from "../../types";
import type { Locale } from "../../i18n";
import * as Flags from "country-flag-icons/react/3x2";
import styles from "./ImageCard.module.css";

interface ImageCardProps {
  image: GalleryImage;
  isSelected: boolean;
  isUnpreviewed: boolean;
  isRecentlyPreviewed: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onEditMetadata: (id: string) => void;
  isAuthenticated?: boolean;
  locale: Locale;
  bulkSelectMode?: boolean;
  isChecked?: boolean;
  onToggleCheck?: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageCard({
  image,
  isSelected,
  isUnpreviewed,
  isRecentlyPreviewed,
  onSelect,
  onRemove,
  onEditMetadata,
  isAuthenticated = false,
  locale,
  bulkSelectMode = false,
  isChecked = false,
  onToggleCheck,
}: ImageCardProps) {
  const t =
    locale === "sv"
      ? {
          selectImage: (name: string) => `Valj bild ${name}`,
          hasGps: "Har GPS-position",
          editMetadata: "Redigera metadata",
          notPreviewed: "NYTT",
          editImage: (name: string) => `Redigera metadata for ${name}`,
          downloadImage: (name: string) => `Ladda ned ${name}`,
          removeImage: (name: string) => `Ta bort ${name}`,
          removeTitle: "Ta bort bild",
        }
      : {
          selectImage: (name: string) => `Select image ${name}`,
          hasGps: "Has GPS location",
          editMetadata: "Edit metadata",
          notPreviewed: "Not previewed",
          editImage: (name: string) => `Edit metadata for ${name}`,
          downloadImage: (name: string) => `Download ${name}`,
          removeImage: (name: string) => `Remove ${name}`,
          removeTitle: "Remove image",
        };

  const handleClick = () => {
    if (bulkSelectMode) {
      onToggleCheck?.(image.id);
    } else {
      onSelect(image.id);
    }
  };

  return (
    <article
      className={`${styles.card} ${isSelected && !bulkSelectMode ? styles.selected : ""} ${bulkSelectMode && isChecked ? styles.checked : ""}`}
      onClick={handleClick}
      tabIndex={0}
      role="button"
      aria-pressed={bulkSelectMode ? isChecked : isSelected}
      aria-label={t.selectImage(image.name)}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
    >
      {bulkSelectMode && (
        <span className={`${styles.checkOverlay} ${isChecked ? styles.checkOverlayChecked : ""}`}>
          {isChecked ? "✓" : ""}
        </span>
      )}
      <div className={styles.imageWrapper}>
        <img
          src={image.thumbnailUrl || image.dataUrl}
          alt={image.name}
          className={styles.image}
          loading="lazy"
          decoding="async"
        />
        {(image.mediaType === "video" || image.type?.startsWith("video/")) && (
          <span className={styles.playBadge}>▶</span>
        )}
        {image.location && (
          <span className={styles.pinBadge} title={t.hasGps}>
            📍
          </span>
        )}
        {(isUnpreviewed || isRecentlyPreviewed) && (
          <span
            className={`${styles.unpreviewedBadge} ${isRecentlyPreviewed ? styles.unpreviewedBadgeClearing : ""}`}
          >
            {t.notPreviewed}
          </span>
        )}
      </div>
      <div className={styles.info}>
        <p className={styles.name} title={image.name}>
          {image.name}
        </p>
        <button
          className={styles.downloadIcon}
          onClick={async (e) => {
            e.stopPropagation();
            try {
              const response = await fetch(image.dataUrl);
              if (!response.ok) throw new Error("Download failed");
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = objectUrl;
              link.download = image.name;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(objectUrl);
            } catch {
              const link = document.createElement("a");
              link.href = image.dataUrl;
              link.download = image.name;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }
          }}
          aria-label={t.downloadImage(image.name)}
          title={t.downloadImage(image.name)}
        >
          {locale === "sv" ? "Ladda ned" : "Download"}
        </button>
        {(image.location?.country || image.location?.countryCode) && (
          <p className={styles.countryRow}>
            <CountryFlagBadge countryCode={image.location?.countryCode} />
            <span className={styles.countryName}>
              {getCountryLabel(image) ?? "Unknown"}
            </span>
          </p>
        )}
        <p className={styles.meta}>{formatBytes(image.size)}</p>
        {image.location && (
          <p className={styles.coords}>
            {image.location.lat.toFixed(4)}, {image.location.lng.toFixed(4)}
          </p>
        )}
      </div>
      {isAuthenticated && (
        <>
          <button
            className={styles.editBtn}
            onClick={(e) => {
              e.stopPropagation();
              onEditMetadata(image.id);
            }}
            aria-label={t.editImage(image.name)}
            title={t.editMetadata}
          >
            ✎
          </button>
          <button
            className={styles.removeBtn}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(image.id);
            }}
            aria-label={t.removeImage(image.name)}
            title={t.removeTitle}
          >
            ✕
          </button>
        </>
      )}
    </article>
  );
}

function CountryFlagBadge({ countryCode }: { countryCode?: string }) {
  const normalizedCode = countryCode?.trim();

  if (!normalizedCode || !/^[A-Za-z]{2}$/.test(normalizedCode)) {
    return <span className={styles.flagFallback}>🌍</span>;
  }

  const codeUpper = normalizedCode.toUpperCase() as keyof typeof Flags;
  const FlagComponent = Flags[codeUpper];

  if (!FlagComponent) {
    return <span className={styles.flagFallback}>🌍</span>;
  }

  return (
    <span className={styles.flagBadge}>
      <FlagComponent title={codeUpper} className={styles.flagIcon} />
    </span>
  );
}

function getCountryLabel(image: GalleryImage): string | null {
  return (
    image.location?.country ??
    image.location?.countryCode?.toUpperCase() ??
    null
  );
}
