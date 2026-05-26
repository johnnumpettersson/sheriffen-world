import type { GalleryImage } from "../../types";
import type { Locale } from "../../i18n";
import { useMemo, useRef, useState, useEffect } from "react";
import type React from "react";
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
  isAuthenticated?: boolean;
  locale: Locale;
  uploadSlot?: React.ReactNode;
  showTopPager?: boolean;
  bulkSelectMode?: boolean;
  selectedImageIds?: Set<string>;
  onToggleBulkSelectMode?: () => void;
  onToggleImageSelect?: (id: string) => void;
  onBulkDelete?: () => void;
  onMarkAllPage?: () => void;
  toolbarSlot?: React.ReactNode;
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
  isAuthenticated = false,
  locale,
  uploadSlot,
  showTopPager = false,
  bulkSelectMode = false,
  selectedImageIds,
  onToggleBulkSelectMode,
  onToggleImageSelect,
  onBulkDelete,
  onMarkAllPage,
  toolbarSlot,
}: ImagesProps) {
  const t =
    locale === "sv"
      ? {
          empty: "Inga bilder än - ladda upp några ovanför!",
          loading: "Laddar bilder...",
          aria: "Bilder",
          previous: "Forra sidan",
          next: "Nasta sidan",
          goToPage: (target: number) => `Gå till sida ${target}`,
          select: "Markera flera",
          cancelSelect: "Avbryt",
          deleteSelected: (n: number) => `Ta bort ${n} bild${n !== 1 ? "er" : ""}`,
          markAll: "Markera alla",
          unmarkAll: "Avmarkera alla",
        }
      : {
          empty: "No images yet - upload some above!",
          loading: "Loading images...",
          aria: "Images",
          previous: "Previous page",
          next: "Next page",
          goToPage: (target: number) => `Go to page ${target}`,
          select: "Mark multiple",
          cancelSelect: "Cancel",
          deleteSelected: (n: number) => `Delete ${n} image${n !== 1 ? "s" : ""}`,
          markAll: "Mark all",
          unmarkAll: "Unmark all",
        };

  const hasImages = totalItems > 0;
  const pageButtons = getVisiblePages(page, totalPages);

  const sortedImages = useMemo(() => {
    return [...images].sort(
      (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
    );
  }, [images]);

  if (isLoading && images.length === 0 && !uploadSlot) {
    return <div className={styles.empty}>{t.loading}</div>;
  }

  if (images.length === 0 && !uploadSlot) {
    return (
      <div className={styles.empty}>
        <p>{t.empty}</p>
      </div>
    );
  }

  const renderPager = (hidden = false) => (
    <div className={`${styles.pagerRow}${hidden ? ` ${styles.pagerRowHidden}` : ""}`}>
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
  );

  const checkedCount = selectedImageIds?.size ?? 0;
  const allPageSelected = sortedImages.length > 0 && sortedImages.every((img) => selectedImageIds?.has(img.id));

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <section aria-label={t.aria}>
      {showTopPager && renderPager(totalItems === 0)}
      {((isAuthenticated && totalItems > 0) || toolbarSlot) && (
        <div className={styles.bulkToolbar}>
          <div className={styles.toolbarLeft}>{toolbarSlot}</div>
          {isAuthenticated && checkedCount > 0 && (
            <button
              type="button"
              className={styles.trashBtn}
              onClick={onBulkDelete}
              aria-label={t.deleteSelected(checkedCount)}
              title={t.deleteSelected(checkedCount)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
                <path d="M9 3h6l1 1h4v2H4V4h4l1-1ZM5 7h14l-1 14H6L5 7Zm5 2v10h1V9h-1Zm4 0v10h1V9h-1Z"/>
              </svg>
            </button>
          )}
          {isAuthenticated && <div className={styles.menuWrapper} ref={menuRef}>
            <button
              type="button"
              className={styles.menuTrigger}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Image actions menu"
              title="Image actions"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.47.41l-.36 2.54a7.1 7.1 0 0 0-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 9.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.36 1.04.67 1.62.94l.36 2.54c.06.26.29.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54a7.1 7.1 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/>
              </svg>
            </button>
            {menuOpen && (
              <div className={styles.menuDropdown}>
                <button
                  type="button"
                  className={bulkSelectMode ? styles.menuItemCancel : styles.menuItem}
                  onClick={() => { onToggleBulkSelectMode?.(); setMenuOpen(false); }}
                >
                  {bulkSelectMode ? t.cancelSelect : t.select}
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => { onMarkAllPage?.(); setMenuOpen(false); }}
                >
                  {allPageSelected ? t.unmarkAll : t.markAll}
                </button>
              </div>
            )}
          </div>}
        </div>
      )}
      <div className={styles.gallery}>
        {uploadSlot}
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
            isAuthenticated={isAuthenticated}
            locale={locale}
            bulkSelectMode={bulkSelectMode}
            isChecked={selectedImageIds?.has(image.id) ?? false}
            onToggleCheck={onToggleImageSelect}
          />
        ))}
      </div>
      {showTopPager ? renderPager(totalItems === 0) : totalItems > 0 && renderPager()}
    </section>
  );
}

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  const maxVisible = 8;
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
