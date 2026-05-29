import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Autocomplete,
  Dialog,
  DialogContent,
  IconButton,
  TextField,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import type { Locale } from "../../i18n";
import styles from "./LocationPickerModal.module.css";

const WORLD_CENTER: [number, number] = [20, 0];
const WORLD_ZOOM = 2;
const BASEMAP_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function FlyTo({ position }: { position: [number, number] | null }) {
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
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const t =
    locale === "sv"
      ? { search: "Sök plats...", notFound: "Ingen plats hittades." }
      : { search: "Search place...", notFound: "No location found." };

  useEffect(() => {
    if (open) {
      const pos =
        initialLat != null && initialLng != null
          ? ([initialLat, initialLng] as [number, number])
          : null;
      setPicked(pos);
      setFlyTo(pos);
      setInputValue("");
      setOptions([]);
      setNotFound(false);
    }
  }, [open, initialLat, initialLng]);

  const fetchSuggestions = useCallback(
    (query: string) => {
      abortRef.current?.abort();
      if (!query.trim()) {
        setOptions([]);
        setLoading(false);
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setNotFound(false);
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`,
        {
          signal: controller.signal,
          headers: { "Accept-Language": locale === "sv" ? "sv" : "en" },
        },
      )
        .then((r) => r.json())
        .then((data: NominatimResult[]) => {
          setOptions(data);
          setLoading(false);
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setLoading(false);
        });
    },
    [locale],
  );

  const searchAndFly = useCallback(
    async (query: string) => {
      if (!query.trim()) return;
      abortRef.current?.abort();
      setLoading(true);
      setNotFound(false);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
          { headers: { "Accept-Language": locale === "sv" ? "sv" : "en" } },
        );
        const data: NominatimResult[] = await res.json();
        if (!data.length) { setNotFound(true); return; }
        const pos: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        setFlyTo(pos);
        setPicked(pos);
        onPick(pos[0], pos[1]);
        setOptions([]);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    },
    [locale, onPick],
  );

  const handleInputChange = (_: unknown, value: string) => {
    setInputValue(value);
    setNotFound(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 350);
  };

  const handleSelect = (_: unknown, option: NominatimResult | string | null) => {
    if (!option) return;
    if (typeof option === "string") {
      void searchAndFly(option);
      return;
    }
    const pos: [number, number] = [parseFloat(option.lat), parseFloat(option.lon)];
    setFlyTo(pos);
    setPicked(pos);
    onPick(pos[0], pos[1]);
    setOptions([]);
  };

  const handleMapPick = (lat: number, lng: number) => {
    const pos: [number, number] = [lat, lng];
    setPicked(pos);
    onPick(lat, lng);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogContent sx={{ p: 0, "&.MuiDialogContent-root": { paddingTop: 0 } }}>
        <div className={styles.mapWrap}>
          <MapContainer center={WORLD_CENTER} zoom={WORLD_ZOOM} className={styles.map} scrollWheelZoom>
            <TileLayer attribution={BASEMAP_ATTRIBUTION} url={BASEMAP_URL} />
            <ClickHandler onPick={handleMapPick} />
            <FlyTo position={flyTo} />
            {picked && <Marker position={picked} icon={pickerIcon} />}
          </MapContainer>
          <div className={styles.searchOverlay}>
            <SearchIcon fontSize="small" className={styles.searchIcon} />
            <Autocomplete
              fullWidth
              freeSolo
              filterOptions={(x) => x}
              options={options}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.display_name)}
              inputValue={inputValue}
              onInputChange={handleInputChange}
              onChange={handleSelect}
              loading={loading}
              noOptionsText={notFound ? t.notFound : (inputValue.trim() ? t.notFound : "")}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder={t.search}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      void searchAndFly(inputValue);
                    }
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      background: "#fff",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      color: "#1f2937",
                      paddingRight: "32px !important",
                      "& fieldset": { border: "none" },
                      "& input": { color: "#1f2937" },
                      "& input::placeholder": { color: "#9ca3af", opacity: 1 },
                    },
                  }}
                />
              )}
              renderOption={(props, option) => {
                const result = option as NominatimResult;
                return (
                  <li {...props} key={result.place_id}>
                    <span className={styles.suggestion}>{result.display_name}</span>
                  </li>
                );
              }}
            />
          </div>
          <IconButton
            onClick={onClose}
            size="small"
            className={styles.closeButton}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
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
