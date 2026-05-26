import { useState, useCallback, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import exifr from "exifr";
import type { GalleryImage, GeoLocation } from "../types";
import type { ImageExif } from "../utils/compressImage";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);

interface ApiImageRecord {
  id: string;
  name: string;
  dataUrl: string;
  mapThumbnailUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  location: GeoLocation | null;
  comment?: string | null;
  takenAt: string | null;
  uploadedAt: string;
  size: number;
  type: string;
  mediaType?: "image" | "video";
  duration?: number;
}

interface UploadSessionInitResponse {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

interface UploadSessionStatusResponse {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
}

interface PersistedUploadSession {
  uploadId: string;
  fileFingerprint: string;
  name: string;
  size: number;
  type: string;
  chunkSize: number;
  totalChunks: number;
  updatedAt: number;
}

interface ApiImagesPageResponse {
  items: ApiImageRecord[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

const CHUNK_UPLOAD_MAX_RETRIES = 3;
const CHUNK_UPLOAD_RETRY_BASE_DELAY_MS = 450;
const UPLOAD_RESUME_STORAGE_KEY = "sheriffen-world-upload-resume-sessions";
const DEFAULT_GALLERY_ITEMS_PER_PAGE = 50;

interface ImageMetadataUpdate {
  location: GeoLocation | null;
  takenAt: Date | null;
  comment: string | null;
}

export interface UploadProgressUpdate {
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  uploadedBytes: number;
  totalBytes: number;
}

export function useImageGallery(gallery: "main" | "kids" | "resor" = "main") {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryPageSize, setGalleryPageSize] = useState(
    DEFAULT_GALLERY_ITEMS_PER_PAGE,
  );
  const [galleryPageImages, setGalleryPageImages] = useState<GalleryImage[]>(
    [],
  );
  const [galleryTotalItems, setGalleryTotalItems] = useState(0);
  const [galleryTotalPages, setGalleryTotalPages] = useState(1);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const warmedImageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    fetchImagesFromServer(gallery)
      .then((serverImages) => {
        if (!cancelled) {
          setImages(serverImages.map(fromApiImageRecord));
        }
      })
      .catch(() => {
        // Keep local state empty when API is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [gallery]);

  const refreshGalleryPage = useCallback(
    async (pageToLoad: number, pageSizeToLoad: number) => {
      const clampedPage = Math.max(1, pageToLoad);
      const clampedPageSize = Math.max(1, pageSizeToLoad);

      setIsGalleryLoading(true);
      try {
        const response = await fetchImagesPageFromServer(
          clampedPage,
          clampedPageSize,
          gallery,
        );

        const pageImages = response.items.map(fromApiImageRecord);

        // Merge page images into the full images list so that lookups
        // (delete, metadata, preview) never miss an image that is visible
        // in the gallery but missing from a stale initial fetch.
        setImages((prev) => {
          const existingIds = new Set(prev.map((img) => img.id));
          const incoming = pageImages.filter((img) => !existingIds.has(img.id));
          return incoming.length === 0 ? prev : [...prev, ...incoming];
        });

        setGalleryPage(response.page);
        setGalleryPageSize(response.pageSize);
        setGalleryPageImages(pageImages);
        setGalleryTotalItems(response.totalItems);
        setGalleryTotalPages(response.totalPages);
      } finally {
        setIsGalleryLoading(false);
      }
    },
    [gallery],
  );

  useEffect(() => {
    refreshGalleryPage(galleryPage, galleryPageSize).catch(() => {
      setGalleryPageImages([]);
      setGalleryTotalItems(0);
      setGalleryTotalPages(1);
    });
  }, [galleryPage, galleryPageSize, refreshGalleryPage]);

  useEffect(() => {
    if (images.length === 0) {
      return;
    }

    warmImagesInCache(images, warmedImageIdsRef.current);
  }, [images]);

  const addImages = useCallback(
    async (
      files: File[],
      authToken?: string,
      onProgress?: (update: UploadProgressUpdate) => void,
      preExtractedExifList?: (ImageExif | null)[],
    ) => {
      const newImages: GalleryImage[] = [];
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      let aggregateUploadedBytes = 0;

      for (const [fileIndex, file] of files.entries()) {
        let location: GeoLocation | null = null;
        let takenAt: Date | null = null;
        let uploadedForCurrentFile = 0;

        const reportProgress = (currentFileUploadedBytes: number) => {
          if (!onProgress) {
            return;
          }

          const clampedCurrentFileBytes = Math.min(
            Math.max(0, currentFileUploadedBytes),
            file.size,
          );
          const delta = clampedCurrentFileBytes - uploadedForCurrentFile;

          if (delta === 0) {
            return;
          }

          uploadedForCurrentFile = clampedCurrentFileBytes;
          aggregateUploadedBytes = Math.min(
            totalBytes,
            aggregateUploadedBytes + delta,
          );

          onProgress({
            fileName: file.name,
            fileIndex,
            totalFiles: files.length,
            uploadedBytes: aggregateUploadedBytes,
            totalBytes,
          });
        };

        try {
          if (file.type.startsWith("video/")) {
            // Videos don't carry EXIF GPS — skip extraction entirely.
            throw new Error("skip-exif");
          }
          // Use pre-extracted EXIF when provided (compression strips EXIF from canvas output).
          // Fall back to parsing the file directly for uncompressed originals.
          const preExtracted = preExtractedExifList?.[fileIndex];
          const exif = preExtracted !== undefined
            ? preExtracted
            : await exifr.parse(file, { gps: true, tiff: true });

          if (import.meta.env.DEV) {
            console.log("[sheriffen-world] EXIF metadata", {
              fileName: file.name,
              exif,
              source: preExtracted !== undefined ? "pre-extracted" : "parsed",
            });
          }

          if (exif?.latitude != null && exif?.longitude != null) {
            location = { lat: exif.latitude, lng: exif.longitude };
          }
          if (exif?.DateTimeOriginal) {
            takenAt = new Date(exif.DateTimeOriginal);
          }
        } catch {
          // EXIF parsing is best-effort; silently ignore failures
        }

        try {
          const uploaded = await uploadImageToServer(
            file,
            location,
            takenAt,
            authToken,
            reportProgress,
            gallery,
          );
          reportProgress(file.size);
          newImages.push(fromApiImageRecord(uploaded));
          continue;
        } catch (error) {
          if (
            error instanceof Error &&
            (error.message === "Authentication required" ||
              error.message === "Unauthorized upload request")
          ) {
            throw error;
          }

          // Fallback to in-memory image when API/storage is unavailable.
        }

        const dataUrl = await readFileAsDataUrl(file);
        reportProgress(file.size);

        newImages.push({
          id: uuidv4(),
          name: file.name,
          dataUrl,
          mapThumbnailUrl: dataUrl,
          thumbnailUrl: dataUrl,
          previewUrl: dataUrl,
          location,
          comment: null,
          takenAt,
          uploadedAt: new Date(),
          size: file.size,
          type: file.type,
        });
      }

      setImages((prev) => [...prev, ...newImages]);
      await refreshGalleryPage(1, galleryPageSize);

      return newImages;
    },
    [galleryPageSize, refreshGalleryPage],
  );

  const removeImage = useCallback(
    (id: string, authToken?: string) => {
      // Optimistically remove from local state for immediate UI feedback.
      setImages((prev) => prev.filter((img) => img.id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));

      // Await the server delete before refreshing so the image is actually
      // gone when the paginated list is re-fetched.
      deleteImageFromServer(id, authToken)
        .then(() => refreshGalleryPage(galleryPage, galleryPageSize))
        .catch(() => {
          // On failure, re-sync from server to restore accurate state.
          refreshGalleryPage(galleryPage, galleryPageSize).catch(() => {});
        });
    },
    [galleryPage, galleryPageSize, refreshGalleryPage],
  );

  const updateImageMetadata = useCallback(
    async (id: string, update: ImageMetadataUpdate, authToken?: string) => {
      const updated = await updateImageMetadataOnServer(id, update, authToken);

      setImages((prev) =>
        prev.map((img) => (img.id === id ? fromApiImageRecord(updated) : img)),
      );

      await refreshGalleryPage(galleryPage, galleryPageSize);
    },
    [galleryPage, galleryPageSize, refreshGalleryPage],
  );

  const updateLocation = useCallback((id: string, location: GeoLocation) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, location } : img)),
    );
  }, []);

  const selectedImage = images.find((img) => img.id === selectedId) ?? null;

  const setGalleryItemsPerPage = useCallback((nextPageSize: number) => {
    const normalized = Math.max(1, Math.floor(nextPageSize));

    setGalleryPage(1);
    setGalleryPageSize(normalized);
  }, []);

  return {
    images,
    galleryPageImages,
    galleryPage,
    galleryPageSize,
    galleryTotalItems,
    galleryTotalPages,
    isGalleryLoading,
    selectedId,
    selectedImage,
    setSelectedId,
    setGalleryPage,
    setGalleryPageSize: setGalleryItemsPerPage,
    addImages,
    removeImage,
    updateImageMetadata,
    updateLocation,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function fromApiImageRecord(record: ApiImageRecord): GalleryImage {
  const fullUrl = resolveDataUrl(record.dataUrl);

  return {
    id: record.id,
    name: record.name,
    dataUrl: fullUrl,
    mapThumbnailUrl: record.mapThumbnailUrl
      ? resolveDataUrl(record.mapThumbnailUrl)
      : record.thumbnailUrl
        ? resolveDataUrl(record.thumbnailUrl)
        : fullUrl,
    thumbnailUrl: record.thumbnailUrl
      ? resolveDataUrl(record.thumbnailUrl)
      : fullUrl,
    previewUrl: record.previewUrl ? resolveDataUrl(record.previewUrl) : fullUrl,
    location: record.location,
    comment:
      typeof record.comment === "string" && record.comment.trim() !== ""
        ? record.comment
        : null,
    takenAt: record.takenAt ? new Date(record.takenAt) : null,
    uploadedAt: new Date(record.uploadedAt),
    size: record.size,
    type: record.type,
    mediaType: record.mediaType,
    duration: record.duration,
  };
}

function resolveDataUrl(dataUrl: string): string {
  if (/^https?:\/\//i.test(dataUrl)) {
    return dataUrl;
  }

  return `${API_BASE_URL}${dataUrl}`;
}

async function fetchImagesFromServer(gallery: string): Promise<ApiImageRecord[]> {
  const response = await fetch(`${API_BASE_URL}/api/images?gallery=${gallery}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load images from server");
  }

  return response.json() as Promise<ApiImageRecord[]>;
}

async function fetchImagesPageFromServer(
  page: number,
  pageSize: number,
  gallery: string,
): Promise<ApiImagesPageResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/images?page=${page}&pageSize=${pageSize}&gallery=${gallery}`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error("Failed to load paged images from server");
  }

  return response.json() as Promise<ApiImagesPageResponse>;
}

function warmImagesInCache(
  images: GalleryImage[],
  warmedImageIds: Set<string>,
): void {
  if (typeof window === "undefined" || typeof caches === "undefined") {
    return;
  }

  const queue = images.filter((image) => !warmedImageIds.has(image.id));
  if (queue.length === 0) {
    return;
  }

  queue.forEach((image) => warmedImageIds.add(image.id));

  window.setTimeout(() => {
    void (async () => {
      const cache = await caches.open("sheriffen-world-assets-v1");

      for (const image of queue) {
        const urls = [image.mapThumbnailUrl, image.thumbnailUrl];
        for (const url of urls) {
          try {
            if (await cache.match(url)) {
              continue;
            }

            const response = await fetch(url, { cache: "force-cache" });
            if (response.ok) {
              await cache.put(url, response.clone());
            }
          } catch {
            // Cache warming is best-effort.
          }
        }
      }
    })();
  }, 0);
}

async function uploadImageToServer(
  file: File,
  location: GeoLocation | null,
  takenAt: Date | null,
  authToken?: string,
  onProgress?: (uploadedBytes: number) => void,
  gallery: string = "main",
): Promise<ApiImageRecord> {
  if (!authToken) {
    throw new Error("Authentication required");
  }

  const fileFingerprint = getFileFingerprint(file);
  const persistedSession = getPersistedUploadSession(fileFingerprint);
  let uploadId: string | null = null;
  let chunkSize = 0;
  let totalChunks = 0;
  let receivedChunks = new Set<number>();

  if (persistedSession) {
    const status = await fetchUploadSessionStatus(
      persistedSession.uploadId,
      authToken,
    );

    if (
      status &&
      status.chunkSize === persistedSession.chunkSize &&
      status.totalChunks === persistedSession.totalChunks
    ) {
      uploadId = status.uploadId;
      chunkSize = status.chunkSize;
      totalChunks = status.totalChunks;
      receivedChunks = sanitizeReceivedChunks(
        status.receivedChunks,
        totalChunks,
      );
      onProgress?.(
        calculateUploadedBytes(receivedChunks, chunkSize, file.size),
      );
    } else {
      clearPersistedUploadSession(fileFingerprint);
    }
  }

  if (!uploadId) {
    const initResponse = await fetch(`${API_BASE_URL}/api/uploads/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        location,
        takenAt: takenAt ? takenAt.toISOString() : null,
        gallery,
      }),
    });

    if (!initResponse.ok) {
      if (initResponse.status === 401) {
        throw new Error("Unauthorized upload request");
      }

      throw new Error("Failed to initialize upload");
    }

    const initiated = (await initResponse.json()) as UploadSessionInitResponse;
    uploadId = initiated.uploadId;
    chunkSize = initiated.chunkSize;
    totalChunks = initiated.totalChunks;
    receivedChunks = new Set<number>();

    setPersistedUploadSession({
      uploadId,
      fileFingerprint,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      chunkSize,
      totalChunks,
      updatedAt: Date.now(),
    });
  }

  try {
    while (receivedChunks.size < totalChunks) {
      const chunkIndex = getNextMissingChunkIndex(receivedChunks, totalChunks);

      if (chunkIndex === -1) {
        break;
      }

      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      try {
        await uploadChunkWithRetry(uploadId, chunkIndex, chunk, authToken);
        receivedChunks.add(chunkIndex);
        touchPersistedUploadSession(fileFingerprint);
        onProgress?.(
          calculateUploadedBytes(receivedChunks, chunkSize, file.size),
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Unauthorized upload request"
        ) {
          throw error;
        }

        const status = await fetchUploadSessionStatus(uploadId, authToken);
        if (status) {
          receivedChunks = sanitizeReceivedChunks(
            status.receivedChunks,
            totalChunks,
          );
          touchPersistedUploadSession(fileFingerprint);
          onProgress?.(
            calculateUploadedBytes(receivedChunks, chunkSize, file.size),
          );
          continue;
        }

        throw error;
      }
    }

    const completeResponse = await fetch(
      `${API_BASE_URL}/api/uploads/${encodeURIComponent(uploadId)}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    if (!completeResponse.ok) {
      if (completeResponse.status === 401) {
        throw new Error("Unauthorized upload request");
      }

      throw new Error("Failed to finalize upload");
    }

    onProgress?.(file.size);
    clearPersistedUploadSession(fileFingerprint);
    return completeResponse.json() as Promise<ApiImageRecord>;
  } catch (error) {
    throw error;
  }
}

function getFileFingerprint(file: File): string {
  return [file.name, file.size, file.type, file.lastModified].join("::");
}

function getPersistedUploadSessionsMap(): Record<
  string,
  PersistedUploadSession
> {
  try {
    const raw = localStorage.getItem(UPLOAD_RESUME_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed as Record<string, PersistedUploadSession>;
  } catch {
    return {};
  }
}

function setPersistedUploadSessionsMap(
  sessions: Record<string, PersistedUploadSession>,
): void {
  try {
    localStorage.setItem(UPLOAD_RESUME_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Ignore storage failures.
  }
}

function getPersistedUploadSession(
  fileFingerprint: string,
): PersistedUploadSession | null {
  const sessions = getPersistedUploadSessionsMap();
  const session = sessions[fileFingerprint];

  return session ?? null;
}

function setPersistedUploadSession(session: PersistedUploadSession): void {
  const sessions = getPersistedUploadSessionsMap();
  sessions[session.fileFingerprint] = session;
  setPersistedUploadSessionsMap(sessions);
}

function touchPersistedUploadSession(fileFingerprint: string): void {
  const sessions = getPersistedUploadSessionsMap();
  const session = sessions[fileFingerprint];

  if (!session) {
    return;
  }

  sessions[fileFingerprint] = {
    ...session,
    updatedAt: Date.now(),
  };
  setPersistedUploadSessionsMap(sessions);
}

function clearPersistedUploadSession(fileFingerprint: string): void {
  const sessions = getPersistedUploadSessionsMap();

  if (!sessions[fileFingerprint]) {
    return;
  }

  delete sessions[fileFingerprint];
  setPersistedUploadSessionsMap(sessions);
}

function getNextMissingChunkIndex(
  receivedChunks: Set<number>,
  totalChunks: number,
): number {
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    if (!receivedChunks.has(chunkIndex)) {
      return chunkIndex;
    }
  }

  return -1;
}

function sanitizeReceivedChunks(
  chunkIndexes: number[],
  totalChunks: number,
): Set<number> {
  const validChunkIndexes = chunkIndexes.filter(
    (value) => Number.isInteger(value) && value >= 0 && value < totalChunks,
  );

  return new Set(validChunkIndexes);
}

function calculateUploadedBytes(
  receivedChunks: Set<number>,
  chunkSize: number,
  totalSize: number,
): number {
  let uploadedBytes = 0;

  for (const chunkIndex of receivedChunks) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, totalSize);
    uploadedBytes += Math.max(0, end - start);
  }

  return Math.min(totalSize, uploadedBytes);
}

async function uploadChunkWithRetry(
  uploadId: string,
  chunkIndex: number,
  chunk: Blob,
  authToken: string,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= CHUNK_UPLOAD_MAX_RETRIES; attempt += 1) {
    try {
      const chunkResponse = await fetch(
        `${API_BASE_URL}/api/uploads/${encodeURIComponent(uploadId)}/chunks/${chunkIndex}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            Authorization: `Bearer ${authToken}`,
          },
          body: chunk,
        },
      );

      if (chunkResponse.ok) {
        return;
      }

      if (chunkResponse.status === 401) {
        throw new Error("Unauthorized upload request");
      }

      lastError = new Error(
        `Failed to upload image chunk (status ${chunkResponse.status})`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Unauthorized upload request"
      ) {
        throw error;
      }

      lastError =
        error instanceof Error
          ? error
          : new Error("Failed to upload image chunk");
    }

    if (attempt < CHUNK_UPLOAD_MAX_RETRIES) {
      await wait(CHUNK_UPLOAD_RETRY_BASE_DELAY_MS * attempt);
    }
  }

  throw lastError ?? new Error("Failed to upload image chunk");
}

async function fetchUploadSessionStatus(
  uploadId: string,
  authToken: string,
): Promise<UploadSessionStatusResponse | null> {
  const response = await fetch(
    `${API_BASE_URL}/api/uploads/${encodeURIComponent(uploadId)}/status`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    },
  );

  if (response.status === 401) {
    throw new Error("Unauthorized upload request");
  }

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as UploadSessionStatusResponse;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function deleteImageFromServer(id: string, authToken?: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/images/${id}`, {
    method: "DELETE",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });

  if (response.status === 401) {
    throw new Error("Unauthorized upload request");
  }
}

async function updateImageMetadataOnServer(
  id: string,
  update: ImageMetadataUpdate,
  authToken?: string,
): Promise<ApiImageRecord> {
  if (!authToken) {
    throw new Error("Authentication required");
  }

  const response = await fetch(`${API_BASE_URL}/api/images/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      location: update.location,
      takenAt: update.takenAt ? update.takenAt.toISOString() : null,
      comment: update.comment,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized upload request");
    }

    throw new Error("Failed to update image metadata");
  }

  return response.json() as Promise<ApiImageRecord>;
}
