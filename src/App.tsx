import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  DialogActions,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  TextField,
  Tabs,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
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
import type { ImageExif } from "./utils/compressImage";
import { useNavigate, useMatch, useSearchParams } from "react-router-dom";
import styles from "./App.module.css";

type Tab = "gallery" | "map" | "kids" | "resor";
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
    loginToUpload: "Log in",
    imagesLabel: (count: number) => `${count} image${count !== 1 ? "s" : ""}`,
    withGpsLabel: (count: number) => `${count} with GPS location`,
    selectedLabel: (name: string) => `Selected: ${name}`,
    worldMapTab: (count: number) => `World Map${count ? ` (${count})` : ""}`,
    galleryTab: (count: number) => `Images (${count})`,
    sheriffenTab: (count: number) => `Sheriffen (${count})`,
    kidsTab: (count: number) => `Kids (${count})`,
    resorTab: (count: number) => `Trips (${count})`,
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
    createdBy: "Created by",
  },
  sv: {
    subtitle: "Ladda upp bilder och se dem på världskartan",
    uploadLoginActive: "Inloggad för uppladdning",
    logout: "Logga ut",
    loginToUpload: "Logga in",
    imagesLabel: (count: number) => `${count} bild${count !== 1 ? "er" : ""}`,
    withGpsLabel: (count: number) => `${count} med GPS-position`,
    selectedLabel: (name: string) => `Vald: ${name}`,
    worldMapTab: (count: number) => `Världskartan${count ? ` (${count})` : ""}`,
    galleryTab: (count: number) => `Bilder (${count})`,
    sheriffenTab: (count: number) => `Sheriffen (${count})`,
    kidsTab: (count: number) => `Barnen (${count})`,
    resorTab: (count: number) => `Resor (${count})`,
    uploadLoginTitle: "Inloggning för uppladdning",
    username: "Användarnamn",
    password: "Lösenord",
    invalidCredentials: "Fel användarnamn eller lösenord.",
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
    createdBy: "Skapad av",
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
  const mainGallery = useImageGallery("main");
  const kidsGallery = useImageGallery("kids");
  const resorGallery = useImageGallery("resor");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const galleryMatch = useMatch("/gallery/*");
  const kidsMatch = useMatch("/kids/*");
  const resorMatch = useMatch("/resor/*");
  const activeTab: Tab = galleryMatch ? "gallery" : kidsMatch ? "kids" : resorMatch ? "resor" : "map";
  const activeGallery = activeTab === "kids" ? kidsGallery : activeTab === "resor" ? resorGallery : mainGallery;
  const topTab: "gallery" | "map" = (galleryMatch || kidsMatch || resorMatch) ? "gallery" : "map";
  const gallerySubTab: "main" | "kids" | "resor" = kidsMatch ? "kids" : resorMatch ? "resor" : "main";
  const isKidsMode = !!kidsMatch;
  const urlPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const {
    images,
    galleryPageImages,
    galleryPage,
    galleryTotalItems,
    galleryTotalPages,
    isGalleryLoading,
    selectedId,
    setSelectedId,
    setGalleryPage,
    addImages,
    removeImage,
    updateImageMetadata,
  } = activeGallery;
  const mapImageMatch = useMatch("/map/image/:id");
  const galleryImageMatch = useMatch("/gallery/image/:id");
  const kidsImageMatch = useMatch("/kids/image/:id");
  const resorImageMatch = useMatch("/resor/image/:id");
  const [newUploadCount, setNewUploadCount] = useState(0);
  const [carouselResetSignal, setCarouselResetSignal] = useState(0);
  const [unpreviewedImageIds, setUnpreviewedImageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [recentlyPreviewedImageIds, setRecentlyPreviewedImageIds] = useState<
    Set<string>
  >(() => new Set());
  const previewedBadgeTimeoutsRef = useRef<Map<string, number>>(new Map());
  const swipeTouchStartXRef = useRef<number | null>(null);
  const [previewFadeKey, setPreviewFadeKey] = useState(0);
  const previewFadeActiveRef = useRef(false);
  const [mapPreviewMode, setMapPreviewMode] = useState(false);
  const previewImageId = mapImageMatch?.params.id ?? galleryImageMatch?.params.id ?? kidsImageMatch?.params.id ?? resorImageMatch?.params.id ?? null;
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
  const [showPassword, setShowPassword] = useState(false);
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

  const handleFilesSelected = async (files: File[], exifDataList?: (ImageExif | null)[]) => {
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

    addImages(files, authToken, handleUploadProgress, exifDataList)
      .then((addedImages) => {
        setUnpreviewedImageIds((prev) => {
          const next = new Set(prev);
          for (const image of addedImages) {
            next.add(image.id);
          }
          return next;
        });

        if (activeTab === "gallery" || activeTab === "kids") {
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
    navigate("/map");
  };

  const sortedImages = useMemo(
    () =>
      [...images].sort(
        (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
      ),
    [images],
  );

  const imagesWithLocation = mainGallery.images.filter((img) => img.location !== null);
  const hasUnseenUploads = newUploadCount > 0 && topTab !== "gallery";
  const deleteCandidate = deleteCandidateId
    ? (images.find((img) => img.id === deleteCandidateId) ?? null)
    : null;
  const metadataCandidate = metadataCandidateId
    ? (images.find((img) => img.id === metadataCandidateId) ?? null)
    : null;
  const previewIndex = previewImageId
    ? sortedImages.findIndex((img) => img.id === previewImageId)
    : -1;
  const previewImage = previewIndex >= 0 ? sortedImages[previewIndex] : null;
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

    if (!authToken) {
      setDeleteCandidateId(null);
      setAuthError(t.loginRequiredMetadataEdit);
      setIsLoginOpen(true);
      return;
    }

    if (previewImageId === deleteCandidate.id) {
      navigate(`/${activeTab}`);
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

    removeImage(deleteCandidate.id, authToken);
    setDeleteCandidateId(null);
  };

  const handlePreviewStep = (direction: -1 | 1) => {
    if (sortedImages.length === 0) return;

    const currentIndex = previewIndex >= 0 ? previewIndex : 0;
    const nextIndex =
      (currentIndex + direction + sortedImages.length) % sortedImages.length;
    const nextId = sortedImages[nextIndex].id;

    if (activeTab === "map") {
      previewFadeActiveRef.current = true;
      setPreviewFadeKey((prev) => prev + 1);
    } else {
      previewFadeActiveRef.current = false;
    }

    setSelectedId(nextId);
    navigate(`/${activeTab}/image/${nextId}`);
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

  useEffect(() => {
    if (!previewImageId) setMapPreviewMode(false);
  }, [previewImageId]);

  useEffect(() => {
    setGalleryPage(urlPage);
  }, [urlPage, setGalleryPage]);


  useEffect(() => {
    if (previewIndex < 0 || sortedImages.length <= 1) return;
    for (const dir of [-1, 1]) {
      const idx = (previewIndex + dir + sortedImages.length) % sortedImages.length;
      const img = sortedImages[idx];
      const src = img.previewUrl || img.dataUrl;
      const el = new window.Image();
      el.src = src;
    }
  }, [previewIndex, sortedImages]);

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
        } as React.CSSProperties
      }
    >
      <main className={styles.main}>
        {!isKidsMode && (
          <div className={styles.heroBanner}>
            <div className={styles.heroBannerContent}>
              <img src="/sheriffen.png" alt="Sheriffen" className={styles.heroImage} />
              <h1 className={styles.heroTitle}>Sheriffen</h1>
            </div>
            {authToken ? (
              <button
                type="button"
                className={`${styles.authBtn} ${styles.authBtnLoggedIn}`}
                onClick={handleLogout}
              >
                ✓ {t.logout}
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.authBtn} ${styles.authBtnLogin}`}
                onClick={() => { setAuthError(null); setIsLoginOpen(true); }}
              >
                → {t.loginToUpload}
              </button>
            )}
          </div>
        )}
        <div className={styles.centerColumn}>
          {!isKidsMode && (
            <div className={styles.tabBar}>
              <Tabs
                value={topTab}
                onChange={(_, value: "gallery" | "map") => {
                  if (value === "gallery") {
                    navigate("/gallery");
                    setNewUploadCount(0);
                  } else {
                    navigate("/map");
                    setCarouselResetSignal((prev) => prev + 1);
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
                      <span>{t.galleryTab(mainGallery.galleryTotalItems + kidsGallery.galleryTotalItems + resorGallery.galleryTotalItems)}</span>
                    </Badge>
                  }
                />
              </Tabs>
              <div className={styles.tabBarControls}>
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
            </div>
          )}
            <div className={styles.content}>
              {activeTab !== "map" ? (
                <>
                  {!isKidsMode && (
                    <Tabs
                      value={gallerySubTab}
                      onChange={(_, value: "main" | "kids" | "resor") => {
                        if (value === "kids") navigate("/kids");
                        else if (value === "resor") navigate("/resor");
                        else navigate("/gallery");
                      }}
                      textColor="secondary"
                      indicatorColor="secondary"
                      sx={{ borderBottom: 1, borderColor: "divider", mb: 1 }}
                    >
                      <Tab value="main" label={t.sheriffenTab(mainGallery.galleryTotalItems)} />
                      <Tab value="resor" label={t.resorTab(resorGallery.galleryTotalItems)} />
                    </Tabs>
                  )}
                  <Images
                    images={galleryPageImages}
                    page={galleryPage}
                    totalPages={galleryTotalPages}
                    totalItems={galleryTotalItems}
                    isLoading={isGalleryLoading}
                    onPageChange={(page) =>
                      setSearchParams(
                        page > 1 ? { page: String(page) } : {},
                        { replace: true },
                      )
                    }
                    selectedId={selectedId}
                    onSelect={(id) => {
                      const nextId = id === selectedId ? null : id;
                      previewFadeActiveRef.current = false;
                      setMapPreviewMode(false);
                      setSelectedId(nextId);
                      if (nextId) {
                        navigate(`/${activeTab}/image/${nextId}`);
                        markImageAsPreviewed(nextId);
                      } else {
                        navigate(`/${activeTab}`);
                      }
                    }}
                    onRemove={setDeleteCandidateId}
                    onEditMetadata={handleOpenMetadataEditor}
                    unpreviewedImageIds={unpreviewedImageIds}
                    recentlyPreviewedImageIds={recentlyPreviewedImageIds}
                    isAuthenticated={Boolean(authToken)}
                    locale={locale}
                    uploadSlot={
                      <ImageUpload
                        onFilesSelected={handleFilesSelected}
                        isProcessing={isUploading}
                        isAuthenticated={Boolean(authToken)}
                        onRequireLogin={() => { setAuthError(null); setIsLoginOpen(true); }}
                        uploadProgress={uploadProgress}
                        locale={locale}
                        cardMode
                      />
                    }
                  />
                </>
              ) : (
                <div className={styles.mapWrapper}>
                  <MapView
                    images={mapPreviewMode && previewImage ? [previewImage] : mainGallery.images}
                    selectedId={selectedId}
                    onSelectMarker={(id) =>
                      setSelectedId(id === selectedId ? null : id)
                    }
                    onOpenImage={(id) => {
                      previewFadeActiveRef.current = true;
                      setMapPreviewMode(true);
                      setPreviewFadeKey((prev) => prev + 1);
                      setSelectedId(null);
                      navigate(`/${activeTab}/image/${id}`);
                      markImageAsPreviewed(id);
                    }}
                    onResetView={() => {
                      setCarouselResetSignal((prev) => prev + 1);
                      setSelectedId(null);
                    }}
                    locale={locale}
                  />
                </div>
              )}
            </div>
            {activeTab === "map" && (
              <div className={styles.carouselWrapper}>
                <CountriesList
                  images={mainGallery.images}
                  onSelectLocation={handleSelectSidebarLocation}
                  locale={locale}
                  resetSignal={carouselResetSignal}
                  selectedId={selectedId}
                />
              </div>
            )}
          </div>
      </main>

      <footer className={styles.footer}>
        <span className={styles.footerVersion}>v{__APP_VERSION__}</span>
        <span>{t.createdBy} </span>
        <span className={styles.footerCreator}>John</span>
        <span> &amp; </span>
        <span className={styles.footerCreator}>Jade</span>
      </footer>

      <Dialog
        open={previewImage !== null}
        onClose={() => navigate(`/${activeTab}`)}
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
        hideBackdrop={mapPreviewMode}
        sx={{
          "& .MuiPaper-root": {
            outline: "none",
            height: { xs: "86vh", sm: "96vh" },
            maxHeight: { xs: "86vh", sm: "96vh" },
            display: "flex",
            flexDirection: "column",
            margin: "2vh 2vw",
            ...(mapPreviewMode && {
              background: "transparent",
              boxShadow: "none",
            }),
          },
          "& .MuiDialog-container": {
            alignItems: "center",
          },
        }}
      >
        <IconButton
          aria-label="Close image preview"
          onClick={() => navigate(`/${activeTab}`)}
          sx={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}
        >
          <CloseIcon />
        </IconButton>

        {sortedImages.length > 1 && (
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

        <DialogContent sx={{ p: 0, position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {previewImage && (
            <Box
              key={previewFadeKey}
              sx={{
                display: "flex", flexDirection: "column", flex: 1, minHeight: 0,
                bgcolor: "black",
                "@keyframes previewFadeIn": { from: { opacity: 0 }, to: { opacity: 1 } },
                opacity: previewFadeActiveRef.current ? 0 : 0.75,
                animation: previewFadeActiveRef.current ? "previewFadeIn 0.5s ease-in 1s forwards" : "none",
              }}
            >
              <Box
                sx={{ position: "relative", flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                onTouchStart={(e) => { swipeTouchStartXRef.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                  if (swipeTouchStartXRef.current === null) return;
                  const deltaX = e.changedTouches[0].clientX - swipeTouchStartXRef.current;
                  swipeTouchStartXRef.current = null;
                  if (Math.abs(deltaX) < 50) return;
                  handlePreviewStep(deltaX < 0 ? 1 : -1);
                }}
              >
                {previewImage.mediaType === "video" || previewImage.type?.startsWith("video/") ? (
                  <video
                    src={previewImage.dataUrl}
                    controls
                    autoPlay
                    playsInline
                    style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }}
                  />
                ) : (
                  <img
                    src={previewImage.previewUrl || previewImage.dataUrl}
                    alt={previewImage.name}
                    loading="eager"
                    decoding="async"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                )}
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
                  {previewImage.name} ({previewIndex + 1}/{sortedImages.length})
                </Box>
              </Box>

              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  bgcolor: "#1e1e1e",
                  color: "#f0f0f0",
                  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                  display: "grid",
                  gap: 0.5,
                  flexShrink: 0,
                }}
              >
                {previewImage.takenAt && (
                  <Box sx={{ fontSize: "0.86rem" }}>
                    <strong>{t.date}:</strong>{" "}
                    {previewImage.takenAt.getUTCFullYear()}
                  </Box>
                )}
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
            </Box>
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
        sx={{
          "& .MuiDialog-container": {
            alignItems: "center",
            justifyContent: "center",
          },
          "& .MuiDialog-paper": {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            m: 0,
          },
        }}
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
              type={showPassword ? "text" : "password"}
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
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((prev) => !prev)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
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
