import type { GalleryImage } from "../../types";
import type { Locale } from "../../i18n";
import { useMemo } from "react";
import ImageCard from "../ImageCard/ImageCard";
import styles from "./Images.module.css";

interface ImagesProps {
  images: GalleryImage[];
  page: number;
  totalPages: number;
  totalItems: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  selectedId: string | null;
  unpreviewedImageIds: Set<string>;
  recentlyPreviewedImageIds: Set<string>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onEditMetadata: (id: string) => void;
  locale: Locale;
}

export default function Images({
  images,
  page,
  totalPages,
  totalItems,
  isLoading,
  onPageChange,
  selectedId,
  unpreviewedImageIds,
  recentlyPreviewedImageIds,
  onSelect,
  onRemove,
  onEditMetadata,
  locale,
}: ImagesProps) {
  const t =
    locale === "sv"
      ? {
          empty: "Inga bilder än - ladda upp några ovanför!",
          loading: "Laddar bilder...",
          aria: "Bilder",
          previous: "Forra sidan",
          next: "Nasta sidan",
          pageSizeLabel: "Poster per sida",
          goToPage: (target: number) => `Gå till sida ${target}`,
          pageSummary: (current: number, total: number, count: number) =>
            `Sida ${current}/${total} • ${count} poster • ${pageSize}/sida`,
        }
      : {
          empty: "No images yet - upload some above!",
          loading: "Loading images...",
          aria: "Images",
          previous: "Previous page",
          next: "Next page",
          pageSizeLabel: "Items per page",
          goToPage: (target: number) => `Go to page ${target}`,
          pageSummary: (current: number, total: number, count: number) =>
            `Page ${current}/${total} • ${count} items • ${pageSize}/page`,
        };

  const hasImages = totalItems > 0;
  const pageButtons = getVisiblePages(page, totalPages);

  const sortedImages = useMemo(() => {
    return [...images].sort((a, b) => {
      const timeA = (a.takenAt ?? a.uploadedAt).getTime();
      const timeB = (b.takenAt ?? b.uploadedAt).getTime();
      return timeB - timeA;
    });
  }, [images]);

  if (isLoading && images.length === 0) {
    return <div className={styles.empty}>{t.loading}</div>;
  }

  if (images.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{t.empty}</p>
      </div>
    );
  }

  return (
    <section aria-label={t.aria}>
      <div className={styles.gallery}>
        {sortedImages.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            isSelected={image.id === selectedId}
            isUnpreviewed={unpreviewedImageIds.has(image.id)}
            isRecentlyPreviewed={recentlyPreviewedImageIds.has(image.id)}
            onSelect={onSelect}
            onRemove={onRemove}
            onEditMetadata={onEditMetadata}
            locale={locale}
          />
        ))}
      </div>

      <div className={styles.pagerRow}>
        <div className={styles.pageControls}>
          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || isLoading}
            aria-label={t.previous}
            title={t.previous}
          >
            ←
          </button>

          <div className={styles.pageNumberGroup}>
            {pageButtons.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={`${styles.pageNumberButton} ${pageNumber === page ? styles.pageNumberButtonActive : ""}`}
                onClick={() => onPageChange(pageNumber)}
                disabled={isLoading}
                aria-current={pageNumber === page ? "page" : undefined}
                aria-label={t.goToPage(pageNumber)}
                title={t.goToPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || isLoading || !hasImages}
            aria-label={t.next}
            title={t.next}
          >
            →
          </button>
        </div>

      </div>
    </section>
  );
}

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  const maxVisible = 5;
  const safeTotalPages = Math.max(1, totalPages);

  if (safeTotalPages <= maxVisible) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1);
  }

  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, currentPage - half);
  let end = Math.min(safeTotalPages, start + maxVisible - 1);

  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
