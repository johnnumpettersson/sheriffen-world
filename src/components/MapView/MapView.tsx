import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GalleryImage } from "../../types";
import type { Locale } from "../../i18n";
import styles from "./MapView.module.css";
import { useEffect, useRef } from "react";

const WORLD_CENTER: [number, number] = [20, 0];
const WORLD_ZOOM = 2;
const WORLD_BOUNDS: L.LatLngBoundsExpression = [
  [-85, -180],
  [85, 180],
];
const BASEMAP_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Fix default Leaflet marker icons broken by bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function createImageIcon(dataUrl: string, isSelected: boolean) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 48px; height: 48px;
        border-radius: 50%;
        border: 3px solid ${isSelected ? "#4f46e5" : "#fff"};
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        overflow: hidden;
        background: #e5e7eb;
        transition: border-color 0.2s;
      ">
        <img src="${dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" />
      </div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

const markerIconCache = new Map<string, L.DivIcon>();

function getCachedImageIcon(dataUrl: string, isSelected: boolean): L.DivIcon {
  const cacheKey = `${dataUrl}|${isSelected ? "selected" : "default"}`;
  const cached = markerIconCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const icon = createImageIcon(dataUrl, isSelected);
  markerIconCache.set(cacheKey, icon);
  return icon;
}

const PROXIMITY_DEG = 0.3; // ~33 km — "same city" threshold

function FlyToSelected({ selectedImage, allImages }: { selectedImage: GalleryImage | null; allImages: GalleryImage[] }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedImage?.location) return;
    const { lat, lng } = selectedImage.location;
    const nearbyCount = allImages.filter(
      (img) =>
        img.id !== selectedImage.id &&
        img.location !== null &&
        Math.abs(img.location.lat - lat) <= PROXIMITY_DEG &&
        Math.abs(img.location.lng - lng) <= PROXIMITY_DEG,
    ).length;
    const targetZoom = nearbyCount >= 1 ? 13 : 8;
    const currentZoom = map.getZoom();
    // Never zoom out from where the user already is
    const zoom = Math.max(currentZoom, targetZoom);
    // If the point is already visible at a sufficient zoom, skip animation entirely
    if (map.getBounds().contains([lat, lng]) && currentZoom >= targetZoom) return;
    map.flyTo([lat, lng], zoom, { duration: 1.2 });
  }, [selectedImage, allImages, map]);
  return null;
}

function ResetWorldViewControl({
  locale,
  onReset,
}: {
  locale: Locale;
  onReset?: () => void;
}) {
  const map = useMap();
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  const t =
    locale === "sv"
      ? {
          world: "Världsvy",
          zoomOutWorld: "Zooma ut till världsvy",
        }
      : {
          world: "World view",
          zoomOutWorld: "Zoom out to world view",
        };

  useEffect(() => {
    const ResetControl = L.Control.extend({
      onAdd() {
        const container = L.DomUtil.create(
          "div",
          `leaflet-bar ${styles.controlContainer}`,
        );
        const button = L.DomUtil.create(
          "button",
          styles.controlButton,
          container,
        );

        button.type = "button";
        button.title = t.zoomOutWorld;
        button.setAttribute("aria-label", t.zoomOutWorld);
        button.innerText = t.world;

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(button, "click", (event) => {
          L.DomEvent.preventDefault(event);
          map.flyTo(WORLD_CENTER, WORLD_ZOOM, { duration: 1 });
          map.closePopup();
          onResetRef.current?.();
        });

        return container;
      },
    });

    const control = new ResetControl({ position: "topleft" });

    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [map, t.world, t.zoomOutWorld]);

  return null;
}

function PopupContent({
  img,
  unknownLocation,
  onOpenImage,
}: {
  img: GalleryImage;
  unknownLocation: string;
  onOpenImage: (id: string) => void;
}) {
  const map = useMap();
  return (
    <div className={styles.popup}>
      <button
        type="button"
        className={styles.popupImageButton}
        onClick={() => {
          map.closePopup();
          onOpenImage(img.id);
        }}
      >
        <img
          src={img.mapThumbnailUrl || img.thumbnailUrl || img.dataUrl}
          alt={img.name}
          className={styles.popupImage}
          loading="lazy"
          decoding="async"
        />
      </button>
      <p className={styles.popupName}>{getLocationName(img, unknownLocation)}</p>
      <p className={styles.popupCoords}>
        {img.location!.lat.toFixed(5)}, {img.location!.lng.toFixed(5)}
      </p>
    </div>
  );
}

interface MapViewProps {
  images: GalleryImage[];
  selectedId: string | null;
  onSelectMarker: (id: string) => void;
  onOpenImage: (id: string) => void;
  onResetView?: () => void;
  locale: Locale;
  isLoading?: boolean;
}

export default function MapView({
  images,
  selectedId,
  onSelectMarker,
  onOpenImage,
  onResetView,
  locale,
  isLoading = false,
}: MapViewProps) {
  const t =
    locale === "sv"
      ? {
          mapAria: "Världskarta som visar bildplatser",
          noLocation:
            "Ladda upp bilder med GPS-data för att visa dem på kartan",
          unknownLocation: "Okänd plats",
        }
      : {
          mapAria: "World map showing image locations",
          noLocation: "Upload images with GPS metadata to see them on the map",
          unknownLocation: "Unknown location",
        };

  const imagesWithLocation = images.filter((img) => img.location !== null);
  const selectedImage = images.find((img) => img.id === selectedId) ?? null;

  return (
    <div className={styles.mapContainer}>
      <MapContainer
        center={WORLD_CENTER}
        zoom={WORLD_ZOOM}
        minZoom={WORLD_ZOOM}
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1}
        className={styles.map}
        scrollWheelZoom
        aria-label={t.mapAria}
      >
        <TileLayer attribution={BASEMAP_ATTRIBUTION} url={BASEMAP_URL} />
        <ResetWorldViewControl locale={locale} onReset={onResetView} />
        <FlyToSelected selectedImage={selectedImage} allImages={imagesWithLocation} />
        {imagesWithLocation.map((img) => (
          <Marker
            key={img.id}
            position={[img.location!.lat, img.location!.lng]}
            icon={getCachedImageIcon(
              img.mapThumbnailUrl || img.thumbnailUrl || img.dataUrl,
              img.id === selectedId,
            )}
            eventHandlers={{ click: () => onSelectMarker(img.id) }}
          >
            <Popup>
              <PopupContent
                img={img}
                unknownLocation={t.unknownLocation}
                onOpenImage={onOpenImage}
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner} />
        </div>
      )}
      {!isLoading && imagesWithLocation.length === 0 && (
        <div className={styles.noLocationOverlay}>
          <p>{t.noLocation}</p>
        </div>
      )}
    </div>
  );
}

function getLocationName(image: GalleryImage, unknownLocation: string): string {
  const location = image.location;

  if (!location) {
    return unknownLocation;
  }

  const preferredLatin = pickPreferredLatinText([
    location.city,
    location.country,
    location.landmark,
  ]);

  return (
    preferredLatin ||
    location.city ||
    location.country ||
    location.landmark ||
    unknownLocation
  );
}

const LETTER_PATTERN = /\p{Letter}/u;
const LATIN_SCRIPT_PATTERN = /\p{Script=Latin}/u;

function isLatinScriptText(value: string): boolean {
  for (const char of value) {
    if (!LETTER_PATTERN.test(char)) {
      continue;
    }

    if (!LATIN_SCRIPT_PATTERN.test(char)) {
      return false;
    }
  }

  return true;
}

function pickPreferredLatinText(candidates: Array<string | undefined>): string {
  const normalized = candidates
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  if (normalized.length === 0) {
    return "";
  }

  const latin = normalized.find((value) => isLatinScriptText(value));
  return latin ?? normalized[0];
}
