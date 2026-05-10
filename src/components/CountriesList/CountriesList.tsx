import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import * as Flags from "country-flag-icons/react/3x2";
import type { Locale } from "../../i18n";
import type { GalleryImage } from "../../types";
import { extractCountriesFromImages } from "../../utils/reverseGeocode";
import styles from "./CountriesList.module.css";

const ITEMS_PER_PAGE = 8;

interface CountriesListProps {
  images: GalleryImage[];
  onSelectLocation: (imageId: string) => void;
  locale: Locale;
  topContent?: ReactNode;
}

export default function CountriesList({
  images,
  onSelectLocation,
  locale,
  topContent,
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

  useEffect(() => {
    setLoading(true);
    extractCountriesFromImages(images)
      .then(setCountries)
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

  const t =
    locale === "sv"
      ? {
          locations: "Platsbilder",
          uploadGeotagged: "Ladda upp geotaggade bilder for att se platser",
          unableDetect: "Kunde inte identifiera platser",
          geotaggedImage: (count: number) =>
            `${count} geotaggad bild${count > 1 ? "er" : ""}`,
          listCount: (count: number) => `${count} poster`,
          unknownDate: "Okant datum",
          previousPage: "Forra",
          nextPage: "Nasta",
          pageLabel: (current: number, total: number) => `${current}/${total}`,
          pageSummary: (start: number, end: number, total: number) =>
            `${start}-${end} av ${total}`,
        }
      : {
          locations: "Location Photos",
          uploadGeotagged: "Upload geotagged images to see locations",
          unableDetect: "Unable to detect locations",
          geotaggedImage: (count: number) =>
            `${count} geotagged image${count > 1 ? "s" : ""}`,
          listCount: (count: number) => `${count} items`,
          unknownDate: "Unknown date",
          previousPage: "Previous",
          nextPage: "Next",
          pageLabel: (current: number, total: number) => `${current}/${total}`,
          pageSummary: (start: number, end: number, total: number) =>
            `${start}-${end} of ${total}`,
        };

  const imagesWithLocation = images.filter((img) => img.location !== null);
  const totalPages = Math.max(1, Math.ceil(countries.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedCountries = countries.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );
  const pageStart = countries.length === 0 ? 0 : startIndex + 1;
  const pageEnd = Math.min(startIndex + ITEMS_PER_PAGE, countries.length);

  if (imagesWithLocation.length === 0) {
    return (
      <Paper className={styles.container}>
        <Box className={styles.header}>
          <Typography variant="h6" component="h2">
            🌍 {t.locations}
          </Typography>
        </Box>
        {topContent ? (
          <Box className={styles.topContent}>{topContent}</Box>
        ) : null}
        <Box className={styles.empty}>
          <Typography variant="h4" sx={{ mb: 1, opacity: 0.4 }}>
            🌍
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {t.uploadGeotagged}
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper className={styles.container}>
      <Box className={styles.header}>
        <Typography variant="h6" component="h2">
          🌍 {t.locations} ({t.listCount(countries.length)})
        </Typography>
      </Box>
      {topContent ? (
        <Box className={styles.topContent}>{topContent}</Box>
      ) : null}

      {loading ? (
        <Box className={styles.loading}>
          <CircularProgress size={28} />
        </Box>
      ) : countries.length > 0 ? (
        <>
          <List className={styles.list}>
            {paginatedCountries.map((country) => {
              const locationDetails = country.site
                ? `${country.site} • ${country.city}`
                : country.city
                  ? country.city
                  : country.continent;
              const dateLabel = formatLocationDate(
                country.date,
                locale,
                t.unknownDate,
              );

              return (
                <ListItem key={country.imageId} disablePadding>
                  <ListItemButton
                    className={styles.listItem}
                    onClick={() => onSelectLocation(country.imageId)}
                  >
                    <ListItemIcon className={styles.flag}>
                      <CountryFlag countryCode={country.code} />
                    </ListItemIcon>
                    <ListItemText
                      primary={country.name}
                      secondary={
                        <Box className={styles.secondaryText}>
                          <span>{locationDetails}</span>
                          <span className={styles.dateRow}>{dateLabel}</span>
                        </Box>
                      }
                    />
                    {country.count > 1 ? (
                      <Chip
                        label={country.count}
                        size="small"
                        variant="outlined"
                      />
                    ) : null}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>

          <Box className={styles.paginationRow}>
            <IconButton
              size="small"
              className={styles.pagerButton}
              aria-label={t.previousPage}
              title={t.previousPage}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <NavigateBeforeIcon fontSize="small" />
            </IconButton>
            <Typography variant="caption" className={styles.pageLabel}>
              {t.pageLabel(currentPage, totalPages)}
            </Typography>
            <IconButton
              size="small"
              className={styles.pagerButton}
              aria-label={t.nextPage}
              title={t.nextPage}
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage >= totalPages}
            >
              <NavigateNextIcon fontSize="small" />
            </IconButton>
          </Box>
          <Typography variant="caption" className={styles.pageSummary}>
            {t.pageSummary(pageStart, pageEnd, countries.length)}
          </Typography>
        </>
      ) : (
        <Box className={styles.empty}>
          <Typography variant="body2" color="textSecondary">
            {t.unableDetect}
          </Typography>
        </Box>
      )}

      <Box className={styles.footer}>
        <Typography variant="caption" color="textSecondary">
          {t.geotaggedImage(imagesWithLocation.length)}
        </Typography>
      </Box>
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

function formatLocationDate(
  value: string,
  locale: Locale,
  unknownLabel: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return unknownLabel;
  }

  return new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
