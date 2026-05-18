import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  DialogActions,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  TextField,
  Tabs,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { GB, SE } from "country-flag-icons/react/3x2";
import * as Flags from "country-flag-icons/react/3x2";
import { useTheme } from "@mui/material/styles";
import { useImageGallery } from "./hooks/useImageGallery";
import type { UploadProgressUpdate } from "./hooks/useImageGallery";
import ImageUpload from "./components/ImageUpload/ImageUpload";
import Images from "./components/Images/Images";
import MapView from "./components/MapView/MapView";
import CountriesList from "./components/CountriesList/CountriesList";
import type { Locale } from "./i18n";
import type { GeoLocation } from "./types";
import styles from "./App.module.css";

type Tab = "gallery" | "map";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);
const AUTH_STORAGE_KEY = "upload-auth-token";
const LOCALE_STORAGE_KEY = "app-locale";

interface MetadataFormState {
  coordinates: string;
  lat: string;
  lng: string;
  country: string;
  city: string;
  date: string;
  comment: string;
}

interface ReverseGeocodeResponse {
  country: string | null;
  city: string | null;
  countryCode?: string | null;
}

interface PreviewResolvedLocation {
  country: string;
  city: string;
}

interface UploadProgressState {
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  uploadedBytes: number;
  totalBytes: number;
}

const appText = {
  en: {
    subtitle: "Upload photos and see them on a world map",
    uploadLoginActive: "Upload login active",
    logout: "Log out",
    loginToUpload: "Log in to upload",
    imagesLabel: (count: number) => `${count} image${count !== 1 ? "s" : ""}`,
    withGpsLabel: (count: number) => `${count} with GPS location`,
    selectedLabel: (name: string) => `Selected: ${name}`,
    worldMapTab: (count: number) => `World Map${count ? ` (${count})` : ""}`,
    galleryTab: (count: number) => `Images (${count})`,
    uploadLoginTitle: "Upload Login",
    username: "Username",
    password: "Password",
    invalidCredentials: "Invalid username or password.",
    loginServiceDown: "Unable to reach login service. Please try again.",
    loginRequiredUpload: "Please log in to upload images.",
    loginRequiredMetadataEdit: "Please log in to edit image metadata.",
    sessionExpired: "Your upload session expired. Please log in again.",
    metadataEditTitle: "Edit Image Metadata",
    coordinates: "Coordinates",
    geolocation: "Geolocation (city)",
    country: "Country",
    latitude: "Latitude",
    longitude: "Longitude",
    date: "Date",
    comment: "Comment",
    coordinatesHint: "Optional: paste coordinates like -12.000, 12.123",
    autoFilledFromCoordinates: "Auto-filled from coordinates",
    saveMetadata: "Save metadata",
    savingMetadata: "Saving...",
    resolvingLocation: "Looking up location...",
    metadataCoordsPair: "Latitude and longitude must both be provided.",
    metadataCoordsInvalid: "Coordinates must be valid decimal numbers.",
    metadataCoordsRange:
      "Latitude must be between -90 and 90, longitude between -180 and 180.",
    metadataDateInvalid: "Date is not valid.",
    metadataSaveFailed: "Unable to save metadata right now.",
    unknownLocation: "Unknown",
    cancel: "Cancel",
    login: "Log in",
    loggingIn: "Logging in...",
    deleteImageTitle: "Delete Image?",
    deleteImageBody: (name: string) =>
      `Are you sure you want to delete "${name}"?`,
    delete: "Delete",
    switchToEnglish: "Switch to English",
    switchToSwedish: "Switch to Swedish",
  },
  sv: {
    subtitle: "Ladda upp bilder och se dem pa världskartan",
    uploadLoginActive: "Inloggad för uppladdning",
    logout: "Logga ut",
    loginToUpload: "Logga in for att ladda upp",
    imagesLabel: (count: number) => `${count} bild${count !== 1 ? "er" : ""}`,
    withGpsLabel: (count: number) => `${count} med GPS-position`,
    selectedLabel: (name: string) => `Vald: ${name}`,
    worldMapTab: (count: number) => `Världskarta${count ? ` (${count})` : ""}`,
    galleryTab: (count: number) => `Bilder (${count})`,
    uploadLoginTitle: "Inloggning for uppladdning",
    username: "Anvandarnamn",
    password: "Losenord",
    invalidCredentials: "Fel anvandarnamn eller losenord.",
    loginServiceDown: "Kunde inte na inloggningstjansten. Forsok igen.",
    loginRequiredUpload: "Logga in for att ladda upp bilder.",
    loginRequiredMetadataEdit: "Logga in for att redigera bildmetadata.",
    sessionExpired: "Din uppladdningssession gick ut. Logga in igen.",
    metadataEditTitle: "Redigera bildmetadata",
    coordinates: "Koordinater",
    geolocation: "Geolokalisering (stad)",
    country: "Land",
    latitude: "Latitud",
    longitude: "Longitud",
    date: "Datum",
    comment: "Kommentar",
    coordinatesHint: "Valfritt: klistra in koordinater som -12.000, 12.123",
    autoFilledFromCoordinates: "Fylls i automatiskt från koordinater",
    saveMetadata: "Spara",
    savingMetadata: "Sparar...",
    resolvingLocation: "Soker plats...",
    metadataCoordsPair: "Latitud och longitud maste anges tillsammans.",
    metadataCoordsInvalid: "Koordinater maste vara giltiga decimaltal.",
    metadataCoordsRange:
      "Latitud maste vara mellan -90 och 90, longitud mellan -180 och 180.",
    metadataDateInvalid: "Datumet ar ogiltigt.",
    metadataSaveFailed: "Kunde inte spara just nu.",
    unknownLocation: "Okänd",
    cancel: "Avbryt",
    login: "Logga in",
    loggingIn: "Loggar in...",
    deleteImageTitle: "Ta bort bild?",
    deleteImageBody: (name: string) =>
      `Ar du saker pa att du vill ta bort "${name}"?`,
    delete: "Ta bort",
    switchToEnglish: "Byt till engelska",
    switchToSwedish: "Byt till svenska",
  },
};

function getFlagComponent(countryCode: string) {
  const normalizedCode = countryCode.trim();

  if (!/^[A-Za-z]{2}$/.test(normalizedCode)) {
    return null;
  }

  const codeUpper = normalizedCode.toUpperCase() as keyof typeof Flags;
  return Flags[codeUpper] ?? null;
}

export default function App() {
  const theme = useTheme();
  const {
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
    setGalleryPageSize,
    addImages,
    removeImage,
    updateImageMetadata,
  } = useImageGallery();
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [newUploadCount, setNewUploadCount] = useState(0);
  const [unpreviewedImageIds, setUnpreviewedImageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [recentlyPreviewedImageIds, setRecentlyPreviewedImageIds] = useState<
    Set<string>
  >(() => new Set());
  const previewedBadgeTimeoutsRef = useRef<Map<string, number>>(new Map());
  const [previewImageId, setPreviewImageId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem(AUTH_STORAGE_KEY),
  );
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === "en" ? "en" : "sv";
  });
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [username, setUsername] = useState("sheriffen");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [metadataCandidateId, setMetadataCandidateId] = useState<string | null>(
    null,
  );
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [isResolvingPreviewLocation, setIsResolvingPreviewLocation] =
    useState(false);
  const [previewResolvedLocationCache, setPreviewResolvedLocationCache] =
    useState<Record<string, PreviewResolvedLocation>>({});
  const [metadataForm, setMetadataForm] = useState<MetadataFormState>({
    coordinates: "",
    lat: "",
    lng: "",
    country: "",
    city: "",
    date: "",
    comment: "",
  });
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgressState | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const t = appText[locale];

  const handleUploadProgress = useCallback((update: UploadProgressUpdate) => {
    setUploadProgress({
      fileName: update.fileName,
      fileIndex: update.fileIndex,
      totalFiles: update.totalFiles,
      uploadedBytes: update.uploadedBytes,
      totalBytes: update.totalBytes,
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    return () => {
      for (const timeoutId of previewedBadgeTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      previewedBadgeTimeoutsRef.current.clear();
    };
  }, []);

  const invalidateAuthSession = useCallback((message: string) => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthToken(null);
    setAuthError(message);
    setIsLoginOpen(true);
  }, []);

  const validateAuthToken = useCallback(async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/validate`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.ok;
  }, []);

  useEffect(() => {
    if (!authToken) {
      return;
    }

    validateAuthToken(authToken)
      .then((isValid) => {
        if (!isValid) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthToken(null);
        }
      })
      .catch(() => {
        // Ignore transient network failures; token will be checked again before protected actions.
      });
  }, [authToken, validateAuthToken]);

  const handleFilesSelected = async (files: File[]) => {
    if (!authToken) {
      setAuthError(t.loginRequiredUpload);
      setIsLoginOpen(true);
      return;
    }

    const isValid = await validateAuthToken(authToken).catch(() => false);
    if (!isValid) {
      invalidateAuthSession(t.sessionExpired);
      return;
    }

    setIsUploading(true);
    setUploadProgress(null);

    addImages(files, authToken, handleUploadProgress)
      .then((addedImages) => {
        setUnpreviewedImageIds((prev) => {
          const next = new Set(prev);
          for (const image of addedImages) {
            next.add(image.id);
          }
          return next;
        });

        if (activeTab === "gallery") {
          setNewUploadCount(0);
          return;
        }

        setNewUploadCount((prev) => prev + addedImages.length);
      })
      .catch((error) => {
        if (
          error instanceof Error &&
          (error.message === "Authentication required" ||
            error.message === "Unauthorized upload request")
        ) {
          invalidateAuthSession(t.sessionExpired);
        }
      })
      .finally(() => {
        setIsUploading(false);
        setUploadProgress(null);
      });
  };

  const handleLoginSubmit = async () => {
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setAuthError(t.invalidCredentials);
        return;
      }

      const data = (await response.json()) as { token: string };
      localStorage.setItem(AUTH_STORAGE_KEY, data.token);
      setAuthToken(data.token);
      setPassword("");
      setIsLoginOpen(false);
    } catch {
      setAuthError(t.loginServiceDown);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthToken(null);
    setPassword("");
    setAuthError(null);
  };

  const markImageAsPreviewed = useCallback((imageId: string | null) => {
    if (!imageId) {
      return;
    }

    let wasUnpreviewed = false;

    setUnpreviewedImageIds((prev) => {
      if (!prev.has(imageId)) {
        return prev;
      }

      wasUnpreviewed = true;
      const next = new Set(prev);
      next.delete(imageId);
      return next;
    });

    if (!wasUnpreviewed) {
      return;
    }

    setRecentlyPreviewedImageIds((prev) => {
      const next = new Set(prev);
      next.add(imageId);
      return next;
    });

    const existingTimeout = previewedBadgeTimeoutsRef.current.get(imageId);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    const timeoutId = window.setTimeout(() => {
      setRecentlyPreviewedImageIds((prev) => {
        if (!prev.has(imageId)) {
          return prev;
        }

        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
      previewedBadgeTimeoutsRef.current.delete(imageId);
    }, 450);

    previewedBadgeTimeoutsRef.current.set(imageId, timeoutId);
  }, []);

  const handleSelectSidebarLocation = (imageId: string) => {
    setSelectedId(imageId);
    setActiveTab("map");
  };

  const imagesWithLocation = images.filter((img) => img.location !== null);
  const hasUnseenUploads = newUploadCount > 0 && activeTab !== "gallery";
  const deleteCandidate = deleteCandidateId
    ? (images.find((img) => img.id === deleteCandidateId) ?? null)
    : null;
  const metadataCandidate = metadataCandidateId
    ? (images.find((img) => img.id === metadataCandidateId) ?? null)
    : null;
  const previewIndex = previewImageId
    ? images.findIndex((img) => img.id === previewImageId)
    : -1;
  const previewImage = previewIndex >= 0 ? images[previewIndex] : null;
  const previewLocationKey = previewImage?.location
    ? getCoordinateCacheKey(
      previewImage.location.lat,
      previewImage.location.lng,
    )
    : null;
  const previewResolvedLocation = previewLocationKey
    ? previewResolvedLocationCache[previewLocationKey]
    : undefined;

  const handleConfirmDelete = () => {
    if (!deleteCandidate) {
      setDeleteCandidateId(null);
      return;
    }

    if (previewImageId === deleteCandidate.id) {
      setPreviewImageId(null);
    }

    setUnpreviewedImageIds((prev) => {
      if (!prev.has(deleteCandidate.id)) {
        return prev;
      }

      const next = new Set(prev);
      next.delete(deleteCandidate.id);
      return next;
    });
    setRecentlyPreviewedImageIds((prev) => {
      if (!prev.has(deleteCandidate.id)) {
        return prev;
      }

      const next = new Set(prev);
      next.delete(deleteCandidate.id);
      return next;
    });
    const timeoutId = previewedBadgeTimeoutsRef.current.get(deleteCandidate.id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      previewedBadgeTimeoutsRef.current.delete(deleteCandidate.id);
    }

    removeImage(deleteCandidate.id);
    setDeleteCandidateId(null);
  };

  const handlePreviewStep = (direction: -1 | 1) => {
    if (images.length === 0) return;

    const currentIndex = previewIndex >= 0 ? previewIndex : 0;
    const nextIndex =
      (currentIndex + direction + images.length) % images.length;
    const nextId = images[nextIndex].id;

    setPreviewImageId(nextId);
    setSelectedId(nextId);
    markImageAsPreviewed(nextId);
  };

  const handleOpenMetadataEditor = async (imageId: string) => {
    if (!authToken) {
      setAuthError(t.loginRequiredMetadataEdit);
      setIsLoginOpen(true);
      return;
    }

    const isValid = await validateAuthToken(authToken).catch(() => false);
    if (!isValid) {
      invalidateAuthSession(t.sessionExpired);
      return;
    }

    const image = images.find((item) => item.id === imageId);
    if (!image) {
      return;
    }

    const takenAt = image.takenAt;

    setMetadataError(null);
    setMetadataForm({
      coordinates: image.location
        ? formatCoordinatePair(image.location.lat, image.location.lng)
        : "",
      lat: image.location ? String(image.location.lat) : "",
      lng: image.location ? String(image.location.lng) : "",
      country: image.location?.country ?? "",
      city: image.location?.city ?? "",
      date: takenAt ? formatDateInputValue(takenAt) : "",
      comment: image.comment ?? "",
    });
    setMetadataCandidateId(imageId);
  };

  const handleSaveMetadata = async () => {
    if (!metadataCandidate) {
      setMetadataCandidateId(null);
      return;
    }

    const latText = metadataForm.lat.trim();
    const lngText = metadataForm.lng.trim();
    const country = metadataForm.country.trim();
    const city = metadataForm.city.trim();
    const dateText = metadataForm.date.trim();
    const comment = metadataForm.comment.trim();

    const hasLat = latText !== "";
    const hasLng = lngText !== "";

    if (hasLat !== hasLng) {
      setMetadataError(t.metadataCoordsPair);
      return;
    }

    let location: GeoLocation | null = null;

    if (hasLat && hasLng) {
      const lat = Number(latText);
      const lng = Number(lngText);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setMetadataError(t.metadataCoordsInvalid);
        return;
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setMetadataError(t.metadataCoordsRange);
        return;
      }

      location = {
        lat,
        lng,
      };

      if (country) {
        location.country = country;
      }

      if (city) {
        location.city = city;
      }
    }

    let takenAt: Date | null = null;

    if (dateText !== "") {
      const parts = dateText.split("-");
      if (parts.length !== 3) {
        setMetadataError(t.metadataDateInvalid);
        return;
      }

      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);

      if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day)
      ) {
        setMetadataError(t.metadataDateInvalid);
        return;
      }

      const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

      if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() + 1 !== month ||
        parsed.getUTCDate() !== day
      ) {
        setMetadataError(t.metadataDateInvalid);
        return;
      }

      takenAt = parsed;
    }

    if (!authToken) {
      setMetadataError(t.loginRequiredMetadataEdit);
      setIsLoginOpen(true);
      return;
    }

    const isValid = await validateAuthToken(authToken).catch(() => false);
    if (!isValid) {
      setMetadataCandidateId(null);
      invalidateAuthSession(t.sessionExpired);
      return;
    }

    setMetadataError(null);
    setIsSavingMetadata(true);

    try {
      await updateImageMetadata(
        metadataCandidate.id,
        {
          location,
          takenAt,
          comment: comment === "" ? null : comment,
        },
        authToken,
      );

      setMetadataCandidateId(null);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "Authentication required" ||
          error.message === "Unauthorized upload request")
      ) {
        setMetadataCandidateId(null);
        invalidateAuthSession(t.sessionExpired);
        return;
      }

      setMetadataError(t.metadataSaveFailed);
    } finally {
      setIsSavingMetadata(false);
    }
  };

  useEffect(() => {
    if (!metadataCandidateId) {
      setIsResolvingLocation(false);
      return;
    }

    const latText = metadataForm.lat.trim();
    const lngText = metadataForm.lng.trim();

    if (latText === "" || lngText === "") {
      setIsResolvingLocation(false);
      setMetadataForm((prev) => ({
        ...prev,
        country: "",
        city: "",
      }));
      return;
    }

    const lat = Number(latText);
    const lng = Number(lngText);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setIsResolvingLocation(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsResolvingLocation(true);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as ReverseGeocodeResponse;

        setMetadataForm((prev) => {
          if (prev.lat.trim() !== latText || prev.lng.trim() !== lngText) {
            return prev;
          }

          return {
            ...prev,
            country: data.country ?? "",
            city: data.city ?? "",
          };
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      } finally {
        setIsResolvingLocation(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [metadataCandidateId, metadataForm.lat, metadataForm.lng]);

  useEffect(() => {
    if (!previewImage?.location) {
      setIsResolvingPreviewLocation(false);
      return;
    }

    const { lat, lng } = previewImage.location;
    const cacheKey = getCoordinateCacheKey(lat, lng);

    if (previewResolvedLocationCache[cacheKey]) {
      setIsResolvingPreviewLocation(false);
      return;
    }

    const controller = new AbortController();
    setIsResolvingPreviewLocation(true);

    fetch(
      `${API_BASE_URL}/api/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as ReverseGeocodeResponse;
        const countryCode =
          typeof data.countryCode === "string" ? data.countryCode : undefined;
        const country =
          countryCode && typeof Intl?.DisplayNames === "function"
            ? (new Intl.DisplayNames(["en"], { type: "region" }).of(
              countryCode.toUpperCase(),
            ) ?? data.country)
            : data.country;

        setPreviewResolvedLocationCache((prev) => ({
          ...prev,
          [cacheKey]: {
            country:
              typeof country === "string" && country.trim() !== ""
                ? country
                : "",
            city:
              typeof data.city === "string" && data.city.trim() !== ""
                ? data.city
                : "",
          },
        }));
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      })
      .finally(() => {
        setIsResolvingPreviewLocation(false);
      });

    return () => {
      controller.abort();
    };
  }, [previewImage, previewResolvedLocationCache]);

  return (
    <div
      className={styles.app}
      style={
        {
          "--app-bg": theme.palette.background.default,
          "--app-text": theme.palette.text.primary,
          "--footer-bg": theme.palette.background.paper,
          "--footer-border": theme.palette.divider,
          "--footer-text": theme.palette.text.secondary,
          "--header-shadow": "0 2px 12px rgba(0, 0, 0, 0.6)",
          "--header-gradient":
            "linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 100%)",
        } as React.CSSProperties
      }
    >
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.brandRow}>
            <img
              src="/sheriffen.jpg"
              alt="Sheriffen World logo"
              className={styles.logo}
            />
            <div>
              <h1 className={styles.title}>Sheriffen World</h1>
              <p className={styles.subtitle}>{t.subtitle}</p>
            </div>
          </div>
          <div className={styles.langToggleGroup}>
            <IconButton
              onClick={() => setLocale("sv")}
              aria-label={t.switchToSwedish}
              title={t.switchToSwedish}
              className={`${styles.langToggle} ${locale === "sv" ? styles.langToggleActive : ""}`}
            >
              <SE className={styles.langFlag} title="Svenska" />
            </IconButton>
            <IconButton
              onClick={() => setLocale("en")}
              aria-label={t.switchToEnglish}
              title={t.switchToEnglish}
              className={`${styles.langToggle} ${locale === "en" ? styles.langToggleActive : ""}`}
            >
              <GB className={styles.langFlag} title="English" />
            </IconButton>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.statsBar}>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            <Chip
              color="primary"
              variant="outlined"
              label={t.imagesLabel(images.length)}
            />
            <Chip
              color="secondary"
              variant="outlined"
              label={t.withGpsLabel(imagesWithLocation.length)}
            />
            {selectedImage && (
              <Chip
                color="default"
                label={t.selectedLabel(selectedImage.name)}
              />
            )}
          </Stack>
        </div>

        <nav className={styles.tabs} aria-label="View switcher">
          <Tabs
            value={activeTab}
            onChange={(_, value: Tab) => {
              setActiveTab(value);
              if (value === "gallery") {
                setNewUploadCount(0);
              }
            }}
            aria-label="Gallery and map view tabs"
          >
            <Tab value="map" label={t.worldMapTab(imagesWithLocation.length)} />
            <Tab
              value="gallery"
              label={
                <Badge
                  color="error"
                  variant="dot"
                  invisible={!hasUnseenUploads}
                >
                  <span>{t.galleryTab(images.length)}</span>
                </Badge>
              }
            />
          </Tabs>
        </nav>

        <div className={styles.contentWrapper}>
          <div className={styles.content}>
            {activeTab === "gallery" ? (
              <Images
                images={galleryPageImages}
                page={galleryPage}
                totalPages={galleryTotalPages}
                totalItems={galleryTotalItems}
                pageSize={galleryPageSize}
                isLoading={isGalleryLoading}
                onPageChange={setGalleryPage}
                onPageSizeChange={setGalleryPageSize}
                selectedId={selectedId}
                onSelect={(id) => {
                  const nextId = id === selectedId ? null : id;
                  setSelectedId(nextId);
                  setPreviewImageId(nextId);
                  markImageAsPreviewed(nextId);
                }}
                onRemove={setDeleteCandidateId}
                onEditMetadata={handleOpenMetadataEditor}
                unpreviewedImageIds={unpreviewedImageIds}
                recentlyPreviewedImageIds={recentlyPreviewedImageIds}
                locale={locale}
              />
            ) : (
              <div className={styles.mapWrapper}>
                <MapView
                  images={images}
                  selectedId={selectedId}
                  onSelectMarker={(id) =>
                    setSelectedId(id === selectedId ? null : id)
                  }
                  onOpenImage={(id) => {
                    setSelectedId(id);
                    setPreviewImageId(id);
                    markImageAsPreviewed(id);
                  }}
                  locale={locale}
                />
              </div>
            )}
          </div>

          <aside className={styles.sidebar}>
            <div className={styles.sidebarLocationsSection}>
              <CountriesList
                images={images}
                onSelectLocation={handleSelectSidebarLocation}
                locale={locale}
              />
            </div>

            <section className={styles.sidebarUploadSection}>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                {authToken ? (
                  <>
                    <Chip
                      color="success"
                      label={t.uploadLoginActive}
                      size="small"
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleLogout}
                    >
                      {t.logout}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => {
                      setAuthError(null);
                      setIsLoginOpen(true);
                    }}
                  >
                    {t.loginToUpload}
                  </Button>
                )}
              </Stack>
              <ImageUpload
                onFilesSelected={handleFilesSelected}
                isProcessing={isUploading}
                isAuthenticated={Boolean(authToken)}
                onRequireLogin={() => setIsLoginOpen(true)}
                uploadProgress={uploadProgress}
                locale={locale}
              />
            </section>
          </aside>
        </div>
      </main>

      <footer className={styles.footer}></footer>

      <Dialog
        open={previewImage !== null}
        onClose={() => setPreviewImageId(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            handlePreviewStep(-1);
          }

          if (event.key === "ArrowRight") {
            handlePreviewStep(1);
          }
        }}
        maxWidth="lg"
        fullWidth
      >
        <IconButton
          aria-label="Close image preview"
          onClick={() => setPreviewImageId(null)}
          sx={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}
        >
          <CloseIcon />
        </IconButton>

        {images.length > 1 && (
          <>
            <IconButton
              aria-label="Previous image"
              onClick={() => handlePreviewStep(-1)}
              sx={{
                position: "absolute",
                top: "50%",
                left: 8,
                transform: "translateY(-50%)",
                zIndex: 2,
                bgcolor: "rgba(0, 0, 0, 0.45)",
                color: "white",
                "&:hover": { bgcolor: "rgba(0, 0, 0, 0.6)" },
              }}
            >
              <NavigateBeforeIcon />
            </IconButton>
            <IconButton
              aria-label="Next image"
              onClick={() => handlePreviewStep(1)}
              sx={{
                position: "absolute",
                top: "50%",
                right: 8,
                transform: "translateY(-50%)",
                zIndex: 2,
                bgcolor: "rgba(0, 0, 0, 0.45)",
                color: "white",
                "&:hover": { bgcolor: "rgba(0, 0, 0, 0.6)" },
              }}
            >
              <NavigateNextIcon />
            </IconButton>
          </>
        )}

        <DialogContent sx={{ p: 0, bgcolor: "black", position: "relative" }}>
          {previewImage && (
            <>
              <Box sx={{ position: "relative" }}>
                <img
                  src={previewImage.previewUrl || previewImage.dataUrl}
                  alt={previewImage.name}
                  loading="eager"
                  decoding="async"
                  style={{
                    width: "100%",
                    maxHeight: "80vh",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
                <Box
                  sx={{
                    position: "absolute",
                    left: 12,
                    bottom: 12,
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 1,
                    bgcolor: "rgba(0, 0, 0, 0.55)",
                    color: "white",
                    fontSize: "0.85rem",
                  }}
                >
                  {previewImage.name} ({previewIndex + 1}/{images.length})
                </Box>
              </Box>

              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  bgcolor: "#111827",
                  color: "white",
                  borderTop: "1px solid rgba(255, 255, 255, 0.12)",
                  display: "grid",
                  gap: 0.5,
                }}
              >
                <Box
                  sx={{
                    fontSize: "0.86rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <strong>{t.country}:</strong>
                  {(() => {
                    const code = previewImage.location?.countryCode;
                    if (code) {
                      const FlagComponent = getFlagComponent(code);
                      if (FlagComponent) {
                        return (
                          <FlagComponent
                            title={code.toUpperCase()}
                            style={{
                              width: "1.3rem",
                              height: "auto",
                              borderRadius: "2px",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                              flexShrink: 0,
                            }}
                          />
                        );
                      }
                    }
                    return null;
                  })()}
                  <span>
                    {isResolvingPreviewLocation
                      ? t.resolvingLocation
                      : previewResolvedLocation?.country ||
                      previewImage.location?.country ||
                      t.unknownLocation}
                  </span>
                </Box>
                <Box sx={{ fontSize: "0.86rem" }}>
                  <strong>{t.geolocation}:</strong>{" "}
                  {isResolvingPreviewLocation
                    ? t.resolvingLocation
                    : previewResolvedLocation?.city ||
                    previewImage.location?.city ||
                    t.unknownLocation}
                </Box>
                <Box sx={{ fontSize: "0.86rem" }}>
                  <strong>{t.comment}:</strong>{" "}
                  {previewImage.comment?.trim() ?? ""}
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteCandidate !== null}
        onClose={() => setDeleteCandidateId(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t.deleteImageTitle}</DialogTitle>
        <DialogContent>
          {deleteCandidate ? (
            <p>{t.deleteImageBody(deleteCandidate.name)}</p>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteCandidateId(null)}>{t.cancel}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleConfirmDelete}
          >
            {t.delete}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={metadataCandidate !== null}
        onClose={() => {
          if (!isSavingMetadata) {
            setMetadataCandidateId(null);
            setMetadataError(null);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t.metadataEditTitle}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {metadataError && <Alert severity="error">{metadataError}</Alert>}
            <TextField
              label={t.country}
              value={metadataForm.country}
              disabled
              helperText={
                isResolvingLocation
                  ? t.resolvingLocation
                  : t.autoFilledFromCoordinates
              }
              fullWidth
            />
            <TextField
              label={t.geolocation}
              value={metadataForm.city}
              disabled
              helperText={
                isResolvingLocation
                  ? t.resolvingLocation
                  : t.autoFilledFromCoordinates
              }
              fullWidth
            />
            <TextField
              label={t.coordinates}
              value={metadataForm.coordinates}
              onChange={(event) => {
                const coordinates = event.target.value;
                const trimmed = coordinates.trim();
                const parsed = parseCoordinatePairInput(coordinates);

                setMetadataForm((prev) => {
                  if (trimmed === "") {
                    return {
                      ...prev,
                      coordinates,
                      lat: "",
                      lng: "",
                      country: "",
                      city: "",
                    };
                  }

                  if (!parsed) {
                    return {
                      ...prev,
                      coordinates,
                    };
                  }

                  return {
                    ...prev,
                    coordinates,
                    lat: String(parsed.lat),
                    lng: String(parsed.lng),
                  };
                });
              }}
              helperText={t.coordinatesHint}
              fullWidth
            />
            <TextField
              label={t.date}
              type="date"
              value={metadataForm.date}
              onChange={(event) =>
                setMetadataForm((prev) => ({
                  ...prev,
                  date: event.target.value,
                }))
              }
              slotProps={{
                inputLabel: { shrink: true },
              }}
              fullWidth
            />
            <TextField
              label={t.comment}
              value={metadataForm.comment}
              onChange={(event) =>
                setMetadataForm((prev) => ({
                  ...prev,
                  comment: event.target.value,
                }))
              }
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setMetadataCandidateId(null);
              setMetadataError(null);
            }}
            disabled={isSavingMetadata}
          >
            {t.cancel}
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveMetadata}
            disabled={isSavingMetadata}
          >
            {isSavingMetadata ? t.savingMetadata : t.saveMetadata}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isLoginOpen}
        onClose={() => {
          if (!isAuthenticating) {
            setIsLoginOpen(false);
          }
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t.uploadLoginTitle}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {authError && <Alert severity="error">{authError}</Alert>}
            <TextField
              label={t.username}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              fullWidth
            />
            <TextField
              label={t.password}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              fullWidth
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleLoginSubmit();
                }
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setIsLoginOpen(false)}
            disabled={isAuthenticating}
          >
            {t.cancel}
          </Button>
          <Button
            variant="contained"
            onClick={handleLoginSubmit}
            disabled={
              isAuthenticating || username.trim() === "" || password === ""
            }
          >
            {isAuthenticating ? t.loggingIn : t.login}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

function formatDateInputValue(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCoordinatePair(
  lat: number | string,
  lng: number | string,
): string {
  const latText = String(lat).trim();
  const lngText = String(lng).trim();

  if (latText === "" || lngText === "") {
    return "";
  }

  return `${latText}, ${lngText}`;
}

function parseCoordinatePairInput(
  value: string,
): { lat: number; lng: number } | null {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length !== 2) {
    return null;
  }

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function getCoordinateCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}
