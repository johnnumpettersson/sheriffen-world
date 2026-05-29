import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog, DialogTitle, DialogContent, IconButton, InputAdornment, TextField, CircularProgress } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import type { Locale } from "../../i18n";
import styles from "./LocationPickerModal.module.css";

const WORLD_CENTER: [number, number] = [20, 0];
const WORLD_ZOOM = 2;
const BASEMAP_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const BASEMAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const pickerIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:22px;height:22px;border-radius:50%;
    background:#4f46e5;border:3px solid #fff;
    box-shadow:0 2px 8px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

interface ClickHandlerProps {
  onPick: (lat: number, lng: number) => void;
}

function ClickHandler({ onPick }: ClickHandlerProps) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface FlyToProps {
  position: [number, number] | null;
}

function FlyTo({ position }: FlyToProps) {
  const map = useMapEvents({});
  const prev = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (!position) return;
    if (prev.current?.[0] === position[0] && prev.current?.[1] === position[1]) return;
    prev.current = position;
    map.flyTo(position, Math.max(map.getZoom(), 10), { duration: 1 });
  }, [position, map]);
  return null;
}

interface LocationPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (lat: number, lng: number) => void;
  initialLat?: number | null;
  initialLng?: number | null;
  locale: Locale;
}

export default function LocationPickerModal({
  open,
  onClose,
  onPick,
  initialLat,
  initialLng,
  locale,
}: LocationPickerModalProps) {
  const [picked, setPicked] = useState<[number, number] | null>(
    initialLat != null && initialLng != null ? [initialLat, initialLng] : null,
  );
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const t = locale === "sv"
    ? { title: "Välj plats på kartan", search: "Sök plats...", notFound: "Ingen plats hittades.", close: "Stäng", coords: "Valda koordinater" }
    : { title: "Pick location on map", search: "Search place...", notFound: "No location found.", close: "Close", coords: "Selected coordinates" };

  useEffect(() => {
    if (open) {
      const pos = initialLat != null && initialLng != null ? [initialLat, initialLng] as [number, number] : null;
      setPicked(pos);
      setFlyTo(pos);
      setSearch("");
      setSearchError(null);
    }
  }, [open, initialLat, initialLng]);

  const handlePick = (lat: number, lng: number) => {
    const pos: [number, number] = [lat, lng];
    setPicked(pos);
    onPick(lat, lng);
  };

  const handleSearch = async () => {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { "Accept-Language": locale === "sv" ? "sv" : "en" } },
      );
      const data = await res.json();
      if (!data.length) {
        setSearchError(t.notFound);
        return;
      }
      const { lat, lon } = data[0];
      const pos: [number, number] = [parseFloat(lat), parseFloat(lon)];
      setFlyTo(pos);
    } catch {
      setSearchError(t.notFound);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {t.title}
        <IconButton onClick={onClose} size="small" sx={{ position: "absolute", top: 8, right: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <div className={styles.searchRow}>
          <TextField
            size="small"
            fullWidth
            placeholder={t.search}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSearchError(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            error={!!searchError}
            helperText={searchError ?? " "}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {searching
                      ? <CircularProgress size={18} />
                      : <IconButton size="small" onClick={handleSearch}><SearchIcon fontSize="small" /></IconButton>
                    }
                  </InputAdornment>
                ),
              },
            }}
          />
        </div>
        <div className={styles.mapWrap}>
          <MapContainer
            center={WORLD_CENTER}
            zoom={WORLD_ZOOM}
            className={styles.map}
            scrollWheelZoom
          >
            <TileLayer attribution={BASEMAP_ATTRIBUTION} url={BASEMAP_URL} />
            <ClickHandler onPick={handlePick} />
            <FlyTo position={flyTo} />
            {picked && <Marker position={picked} icon={pickerIcon} />}
          </MapContainer>
        </div>
        {picked && (
          <p className={styles.coordsDisplay}>
            {picked[0].toFixed(6)}, {picked[1].toFixed(6)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
