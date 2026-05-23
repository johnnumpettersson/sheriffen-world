import { useEffect, useRef, useState } from "react";
import { Box, Chip, CircularProgress, IconButton, Paper } from "@mui/material";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import * as Flags from "country-flag-icons/react/3x2";
import type { Locale } from "../../i18n";
import type { GalleryImage } from "../../types";
import { extractCountriesFromImages } from "../../utils/reverseGeocode";
import styles from "./CountriesList.module.css";

const ITEMS_PER_PAGE = 5;

interface CountriesListProps {
  images: GalleryImage[];
  onSelectLocation: (imageId: string) => void;
  locale: Locale;
  resetSignal?: number;
}

export default function CountriesList({
  images,
  onSelectLocation,
  locale,
  resetSignal,
}: CountriesListProps) {
  const [countries, setCountries] = useState<
    Array<{
      name: string;
      code: string;
      continent: string;
      city?: string;
      site?: string;
      imageId: string;
      date: string;
      count: number;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    extractCountriesFromImages(images)
      .then((result) => {
        result.sort((a, b) => {
          if (!a.date) return 1;
          if (!b.date) return -1;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        setCountries(result);
      })
      .catch(() => setCountries([]))
      .finally(() => setLoading(false));
  }, [images]);

  useEffect(() => {
    setCurrentPage((prev) => {
      const totalPages = Math.max(
        1,
        Math.ceil(countries.length / ITEMS_PER_PAGE),
      );
      return Math.min(prev, totalPages);
    });
  }, [countries]);

  useEffect(() => {
    if (resetSignal === undefined) return;
    setCurrentPage(1);
  }, [resetSignal]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const totalPages = Math.max(1, Math.ceil(countries.length / ITEMS_PER_PAGE));
      if (e.deltaY < 0) {
        setCurrentPage((prev) => prev >= totalPages ? 1 : prev + 1);
      } else {
        setCurrentPage((prev) => prev <= 1 ? totalPages : prev - 1);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [countries.length]);

  const imagesWithLocation = images.filter((img) => img.location !== null);

  if (imagesWithLocation.length === 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(countries.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedCountries = countries.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  const prevLabel = locale === "sv" ? "Föregående" : "Previous";
  const nextLabel = locale === "sv" ? "Nästa" : "Next";

  return (
    <Paper ref={containerRef} className={styles.container}>
      <IconButton
        size="small"
        className={styles.pagerButton}
        aria-label={prevLabel}
        title={prevLabel}
        onClick={() => setCurrentPage((prev) => prev <= 1 ? totalPages : prev - 1)}
      >
        <NavigateBeforeIcon fontSize="small" />
      </IconButton>

      {loading ? (
        <Box className={styles.loadingTrack}>
          <CircularProgress size={18} />
        </Box>
      ) : (
        <div className={styles.carouselTrack}>
          {paginatedCountries.map((country) => {
            const subtitle = country.city ?? country.continent;
            const year = country.date
              ? new Date(country.date).getUTCFullYear()
              : null;
            const subtitleLine = subtitle;
            return (
              <button
                key={country.imageId}
                className={styles.carouselItem}
                onClick={() => onSelectLocation(country.imageId)}
              >
                <CountryFlag countryCode={country.code} />
                <div className={styles.itemText}>
                  <span className={styles.countryRow}>
                    <span className={styles.countryName}>{country.name}</span>
                    {year && <span className={styles.yearBadge}>{year}</span>}
                  </span>
                  {subtitleLine && (
                    <span className={styles.cityName}>{subtitleLine}</span>
                  )}
                </div>
                {country.count > 1 && (
                  <Chip
                    label={country.count}
                    size="small"
                    variant="outlined"
                    className={styles.countBadge}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <IconButton
        size="small"
        className={styles.pagerButton}
        aria-label={nextLabel}
        title={nextLabel}
        onClick={() =>
          setCurrentPage((prev) => prev >= totalPages ? 1 : prev + 1)
        }
      >
        <NavigateNextIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
}

function CountryFlag({ countryCode }: { countryCode: string }) {
  const normalizedCode = countryCode.trim();

  if (!/^[A-Za-z]{2}$/.test(normalizedCode)) {
    return <span className={styles.flagFallback}>🌍</span>;
  }

  const codeUpper = normalizedCode.toUpperCase() as keyof typeof Flags;
  const FlagComponent = Flags[codeUpper];

  if (!FlagComponent) {
    return <span className={styles.flagFallback}>🌍</span>;
  }

  return <FlagComponent title={codeUpper} className={styles.flagIcon} />;
}
