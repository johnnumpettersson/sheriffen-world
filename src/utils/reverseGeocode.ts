import type { GalleryImage } from "../types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);

const reverseLookupCache = new Map<string, Promise<Partial<LocationInfo>>>();

interface CountryInfo {
  name: string;
  code: string;
  continent: string;
  city?: string;
  site?: string;
  imageId: string;
  date: string;
  count: number;
}

interface CountryBounds {
  name: string;
  code: string;
  continent: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface CityLocation {
  name: string;
  country: string;
  lat: number;
  lng: number;
  radius: number; // km radius for detection
}

interface SiteLocation {
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  radius: number; // km radius for detection
}

// Major cities worldwide (lat, lng, radius in km)
const CITIES: CityLocation[] = [
  // North America
  {
    name: "New York",
    country: "United States",
    lat: 40.7128,
    lng: -74.006,
    radius: 25,
  },
  {
    name: "Los Angeles",
    country: "United States",
    lat: 34.0522,
    lng: -118.2437,
    radius: 25,
  },
  {
    name: "Chicago",
    country: "United States",
    lat: 41.8781,
    lng: -87.6298,
    radius: 25,
  },
  {
    name: "Houston",
    country: "United States",
    lat: 29.7604,
    lng: -95.3698,
    radius: 20,
  },
  {
    name: "Phoenix",
    country: "United States",
    lat: 33.4484,
    lng: -112.074,
    radius: 20,
  },
  {
    name: "Miami",
    country: "United States",
    lat: 25.7617,
    lng: -80.1918,
    radius: 20,
  },
  {
    name: "San Francisco",
    country: "United States",
    lat: 37.7749,
    lng: -122.4194,
    radius: 20,
  },
  {
    name: "Seattle",
    country: "United States",
    lat: 47.6062,
    lng: -122.3321,
    radius: 20,
  },
  {
    name: "Las Vegas",
    country: "United States",
    lat: 36.1699,
    lng: -115.1398,
    radius: 20,
  },
  {
    name: "Denver",
    country: "United States",
    lat: 39.7392,
    lng: -104.9903,
    radius: 20,
  },
  {
    name: "Toronto",
    country: "Canada",
    lat: 43.6532,
    lng: -79.3832,
    radius: 20,
  },
  {
    name: "Vancouver",
    country: "Canada",
    lat: 49.2827,
    lng: -123.1207,
    radius: 20,
  },
  {
    name: "Mexico City",
    country: "Mexico",
    lat: 19.4326,
    lng: -99.1332,
    radius: 25,
  },
  {
    name: "Cancún",
    country: "Mexico",
    lat: 21.1619,
    lng: -86.8515,
    radius: 15,
  },

  // Europe
  {
    name: "London",
    country: "United Kingdom",
    lat: 51.5074,
    lng: -0.1278,
    radius: 25,
  },
  { name: "Paris", country: "France", lat: 48.8566, lng: 2.3522, radius: 25 },
  { name: "Berlin", country: "Germany", lat: 52.52, lng: 13.405, radius: 25 },
  {
    name: "Amsterdam",
    country: "Netherlands",
    lat: 52.3676,
    lng: 4.9041,
    radius: 20,
  },
  { name: "Rome", country: "Italy", lat: 41.9028, lng: 12.4964, radius: 20 },
  { name: "Milan", country: "Italy", lat: 45.4642, lng: 9.19, radius: 20 },
  { name: "Venice", country: "Italy", lat: 45.4408, lng: 12.3155, radius: 15 },
  {
    name: "Barcelona",
    country: "Spain",
    lat: 41.3851,
    lng: 2.1734,
    radius: 20,
  },
  { name: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038, radius: 20 },
  { name: "Athens", country: "Greece", lat: 37.9838, lng: 23.7275, radius: 20 },
  {
    name: "Stockholm",
    country: "Sweden",
    lat: 59.3293,
    lng: 18.0686,
    radius: 20,
  },
  {
    name: "Prague",
    country: "Czech Republic",
    lat: 50.0755,
    lng: 14.4378,
    radius: 20,
  },
  {
    name: "Vienna",
    country: "Austria",
    lat: 48.2082,
    lng: 16.3738,
    radius: 20,
  },
  {
    name: "Budapest",
    country: "Hungary",
    lat: 47.4979,
    lng: 19.0402,
    radius: 20,
  },
  {
    name: "Lisbon",
    country: "Portugal",
    lat: 38.7223,
    lng: -9.1393,
    radius: 20,
  },
  {
    name: "Dublin",
    country: "Ireland",
    lat: 53.3498,
    lng: -6.2603,
    radius: 20,
  },
  {
    name: "Copenhagen",
    country: "Denmark",
    lat: 55.6761,
    lng: 12.5683,
    radius: 20,
  },

  // Middle East & North Africa
  {
    name: "Istanbul",
    country: "Turkey",
    lat: 41.0082,
    lng: 28.9784,
    radius: 20,
  },
  { name: "Cairo", country: "Egypt", lat: 30.0444, lng: 31.2357, radius: 25 },
  {
    name: "Dubai",
    country: "United Arab Emirates",
    lat: 25.2048,
    lng: 55.2708,
    radius: 20,
  },
  {
    name: "Tel Aviv",
    country: "Israel",
    lat: 32.0853,
    lng: 34.7818,
    radius: 20,
  },
  {
    name: "Jerusalem",
    country: "Israel",
    lat: 31.7683,
    lng: 35.2137,
    radius: 15,
  },
  {
    name: "Marrakech",
    country: "Morocco",
    lat: 31.6295,
    lng: -8.0088,
    radius: 15,
  },
  {
    name: "Casablanca",
    country: "Morocco",
    lat: 33.5731,
    lng: -7.5898,
    radius: 20,
  },

  // Asia
  { name: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503, radius: 30 },
  {
    name: "Bangkok",
    country: "Thailand",
    lat: 13.7563,
    lng: 100.5018,
    radius: 20,
  },
  {
    name: "Singapore",
    country: "Singapore",
    lat: 1.3521,
    lng: 103.8198,
    radius: 20,
  },
  {
    name: "Hong Kong",
    country: "China",
    lat: 22.3193,
    lng: 114.1694,
    radius: 20,
  },
  {
    name: "Shanghai",
    country: "China",
    lat: 31.2304,
    lng: 121.4737,
    radius: 25,
  },
  {
    name: "Beijing",
    country: "China",
    lat: 39.9042,
    lng: 116.4074,
    radius: 25,
  },
  {
    name: "Seoul",
    country: "South Korea",
    lat: 37.5665,
    lng: 126.978,
    radius: 25,
  },
  { name: "Mumbai", country: "India", lat: 19.076, lng: 72.8777, radius: 25 },
  { name: "Delhi", country: "India", lat: 28.7041, lng: 77.1025, radius: 25 },
  {
    name: "Bangalore",
    country: "India",
    lat: 12.9716,
    lng: 77.5946,
    radius: 20,
  },
  {
    name: "Dubai",
    country: "United Arab Emirates",
    lat: 25.2048,
    lng: 55.2708,
    radius: 20,
  },
  {
    name: "Bangkok",
    country: "Thailand",
    lat: 13.7563,
    lng: 100.5018,
    radius: 20,
  },

  // South America
  {
    name: "São Paulo",
    country: "Brazil",
    lat: -23.5505,
    lng: -46.6333,
    radius: 25,
  },
  {
    name: "Rio de Janeiro",
    country: "Brazil",
    lat: -22.9068,
    lng: -43.1729,
    radius: 25,
  },
  {
    name: "Buenos Aires",
    country: "Argentina",
    lat: -34.6037,
    lng: -58.3816,
    radius: 25,
  },
  { name: "Lima", country: "Peru", lat: -12.0464, lng: -77.0428, radius: 20 },
  {
    name: "Bogotá",
    country: "Colombia",
    lat: 4.711,
    lng: -74.0721,
    radius: 20,
  },
  {
    name: "Santiago",
    country: "Chile",
    lat: -33.8688,
    lng: -51.2093,
    radius: 25,
  },

  // Africa
  {
    name: "Cape Town",
    country: "South Africa",
    lat: -33.9249,
    lng: 18.4241,
    radius: 20,
  },
  {
    name: "Johannesburg",
    country: "South Africa",
    lat: -26.2044,
    lng: 28.0456,
    radius: 20,
  },
  { name: "Lagos", country: "Nigeria", lat: 6.5244, lng: 3.3792, radius: 20 },
  { name: "Nairobi", country: "Kenya", lat: -1.2865, lng: 36.8172, radius: 20 },
  {
    name: "Addis Ababa",
    country: "Ethiopia",
    lat: 9.032,
    lng: 38.7469,
    radius: 20,
  },

  // Oceania
  {
    name: "Sydney",
    country: "Australia",
    lat: -33.8688,
    lng: 151.2093,
    radius: 25,
  },
  {
    name: "Melbourne",
    country: "Australia",
    lat: -37.8136,
    lng: 144.9631,
    radius: 25,
  },
  {
    name: "Auckland",
    country: "New Zealand",
    lat: -37.787,
    lng: 174.7064,
    radius: 25,
  },
];

// Famous landmarks & sites
const SITES: SiteLocation[] = [
  // Wonders & Landmarks
  {
    name: "Eiffel Tower",
    city: "Paris",
    country: "France",
    lat: 48.8584,
    lng: 2.2945,
    radius: 2,
  },
  {
    name: "Statue of Liberty",
    city: "New York",
    country: "United States",
    lat: 40.6892,
    lng: -74.0445,
    radius: 2,
  },
  {
    name: "Big Ben",
    city: "London",
    country: "United Kingdom",
    lat: 51.4975,
    lng: -0.1357,
    radius: 2,
  },
  {
    name: "Colosseum",
    city: "Rome",
    country: "Italy",
    lat: 41.8902,
    lng: 12.4922,
    radius: 2,
  },
  {
    name: "Leaning Tower of Pisa",
    city: "Pisa",
    country: "Italy",
    lat: 43.3629,
    lng: 10.3957,
    radius: 1,
  },
  {
    name: "St. Peter's Basilica",
    city: "Vatican City",
    country: "Italy",
    lat: 41.9029,
    lng: 12.4534,
    radius: 2,
  },
  {
    name: "Sagrada Familia",
    city: "Barcelona",
    country: "Spain",
    lat: 41.4036,
    lng: 2.1744,
    radius: 2,
  },
  {
    name: "Taj Mahal",
    city: "Agra",
    country: "India",
    lat: 27.1751,
    lng: 78.0421,
    radius: 5,
  },
  {
    name: "Great Wall of China",
    city: "Beijing",
    country: "China",
    lat: 40.6769,
    lng: 117.2319,
    radius: 10,
  },
  {
    name: "Forbidden City",
    city: "Beijing",
    country: "China",
    lat: 39.9163,
    lng: 116.3972,
    radius: 3,
  },
  {
    name: "Mount Fuji",
    city: "Tokyo",
    country: "Japan",
    lat: 35.3606,
    lng: 138.7274,
    radius: 5,
  },
  {
    name: "Machu Picchu",
    city: "Cusco",
    country: "Peru",
    lat: -13.1631,
    lng: -72.5449,
    radius: 5,
  },
  {
    name: "Christ the Redeemer",
    city: "Rio de Janeiro",
    country: "Brazil",
    lat: -22.9519,
    lng: -43.2105,
    radius: 2,
  },
  {
    name: "Pyramids of Giza",
    city: "Cairo",
    country: "Egypt",
    lat: 29.9792,
    lng: 31.1342,
    radius: 5,
  },
  {
    name: "Sphinx",
    city: "Cairo",
    country: "Egypt",
    lat: 29.9755,
    lng: 31.1371,
    radius: 3,
  },
  {
    name: "Niagara Falls",
    city: "Niagara",
    country: "Canada",
    lat: 43.0896,
    lng: -79.0849,
    radius: 5,
  },
  {
    name: "Yellowstone",
    city: "Wyoming",
    country: "United States",
    lat: 44.428,
    lng: -110.5885,
    radius: 30,
  },
  {
    name: "Grand Canyon",
    city: "Arizona",
    country: "United States",
    lat: 36.107,
    lng: -112.113,
    radius: 30,
  },
  {
    name: "Statue of Christ",
    city: "Rio de Janeiro",
    country: "Brazil",
    lat: -22.9519,
    lng: -43.2105,
    radius: 2,
  },
  {
    name: "Table Mountain",
    city: "Cape Town",
    country: "South Africa",
    lat: -33.9626,
    lng: 18.4087,
    radius: 5,
  },
  {
    name: "Angkor Wat",
    city: "Siem Reap",
    country: "Cambodia",
    lat: 13.3667,
    lng: 103.8667,
    radius: 5,
  },
  {
    name: "Santorini",
    city: "Santorini",
    country: "Greece",
    lat: 36.3932,
    lng: 25.4615,
    radius: 10,
  },
  {
    name: "Tower of London",
    city: "London",
    country: "United Kingdom",
    lat: 51.5081,
    lng: -0.0759,
    radius: 2,
  },
  {
    name: "Buckingham Palace",
    city: "London",
    country: "United Kingdom",
    lat: 51.5014,
    lng: -0.1419,
    radius: 2,
  },
  {
    name: "Louvre Museum",
    city: "Paris",
    country: "France",
    lat: 48.8606,
    lng: 2.3352,
    radius: 2,
  },
  {
    name: "Venice Canals",
    city: "Venice",
    country: "Italy",
    lat: 45.4408,
    lng: 12.3155,
    radius: 5,
  },
  {
    name: "Alhambra",
    city: "Granada",
    country: "Spain",
    lat: 37.176,
    lng: -3.5881,
    radius: 2,
  },
];

function getDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const COUNTRIES: CountryBounds[] = [
  // North America
  {
    name: "United States",
    code: "US",
    continent: "North America",
    minLat: 24,
    maxLat: 50,
    minLng: -125,
    maxLng: -66,
  },
  {
    name: "Canada",
    code: "CA",
    continent: "North America",
    minLat: 42,
    maxLat: 84,
    minLng: -141,
    maxLng: -52,
  },
  {
    name: "Mexico",
    code: "MX",
    continent: "North America",
    minLat: 14,
    maxLat: 33,
    minLng: -118,
    maxLng: -86,
  },
  {
    name: "Guatemala",
    code: "GT",
    continent: "North America",
    minLat: 13,
    maxLat: 18,
    minLng: -92,
    maxLng: -88,
  },
  {
    name: "Costa Rica",
    code: "CR",
    continent: "North America",
    minLat: 8,
    maxLat: 11,
    minLng: -86,
    maxLng: -82,
  },

  // Central America & Caribbean
  {
    name: "Belize",
    code: "BZ",
    continent: "Central America",
    minLat: 15,
    maxLat: 19,
    minLng: -89,
    maxLng: -87,
  },
  {
    name: "Honduras",
    code: "HN",
    continent: "Central America",
    minLat: 13,
    maxLat: 18,
    minLng: -90,
    maxLng: -83,
  },
  {
    name: "Nicaragua",
    code: "NI",
    continent: "Central America",
    minLat: 10,
    maxLat: 16,
    minLng: -88,
    maxLng: -83,
  },
  {
    name: "Panama",
    code: "PA",
    continent: "Central America",
    minLat: 7,
    maxLat: 10,
    minLng: -83,
    maxLng: -77,
  },
  {
    name: "Jamaica",
    code: "JM",
    continent: "Caribbean",
    minLat: 17,
    maxLat: 19,
    minLng: -79,
    maxLng: -76,
  },
  {
    name: "Cuba",
    code: "CU",
    continent: "Caribbean",
    minLat: 19,
    maxLat: 21,
    minLng: -85,
    maxLng: -73,
  },
  {
    name: "Puerto Rico",
    code: "PR",
    continent: "Caribbean",
    minLat: 17,
    maxLat: 19,
    minLng: -68,
    maxLng: -65,
  },

  // South America
  {
    name: "Colombia",
    code: "CO",
    continent: "South America",
    minLat: -5,
    maxLat: 13,
    minLng: -76,
    maxLng: -66,
  },
  {
    name: "Venezuela",
    code: "VE",
    continent: "South America",
    minLat: 0,
    maxLat: 13,
    minLng: -74,
    maxLng: -59,
  },
  {
    name: "Guyana",
    code: "GY",
    continent: "South America",
    minLat: 1,
    maxLat: 9,
    minLng: -61,
    maxLng: -56,
  },
  {
    name: "Suriname",
    code: "SR",
    continent: "South America",
    minLat: 1,
    maxLat: 6,
    minLng: -58,
    maxLng: -54,
  },
  {
    name: "Ecuador",
    code: "EC",
    continent: "South America",
    minLat: -5,
    maxLat: 2,
    minLng: -82,
    maxLng: -75,
  },
  {
    name: "Peru",
    code: "PE",
    continent: "South America",
    minLat: -18,
    maxLat: 1,
    minLng: -82,
    maxLng: -68,
  },
  {
    name: "Brazil",
    code: "BR",
    continent: "South America",
    minLat: -34,
    maxLat: 5,
    minLng: -74,
    maxLng: -34,
  },
  {
    name: "Bolivia",
    code: "BO",
    continent: "South America",
    minLat: -23,
    maxLat: -10,
    minLng: -70,
    maxLng: -57,
  },
  {
    name: "Paraguay",
    code: "PY",
    continent: "South America",
    minLat: -28,
    maxLat: -19,
    minLng: -63,
    maxLng: -54,
  },
  {
    name: "Chile",
    code: "CL",
    continent: "South America",
    minLat: -56,
    maxLat: -17,
    minLng: -82,
    maxLng: -66,
  },
  {
    name: "Argentina",
    code: "AR",
    continent: "South America",
    minLat: -56,
    maxLat: -21,
    minLng: -74,
    maxLng: -53,
  },
  {
    name: "Uruguay",
    code: "UY",
    continent: "South America",
    minLat: -35,
    maxLat: -32,
    minLng: -59,
    maxLng: -53,
  },

  // Europe
  {
    name: "Portugal",
    code: "PT",
    continent: "Europe",
    minLat: 36,
    maxLat: 42,
    minLng: -10,
    maxLng: -6,
  },
  {
    name: "Spain",
    code: "ES",
    continent: "Europe",
    minLat: 36,
    maxLat: 44,
    minLng: -10,
    maxLng: 5,
  },
  {
    name: "France",
    code: "FR",
    continent: "Europe",
    minLat: 42,
    maxLat: 52,
    minLng: -6,
    maxLng: 9,
  },
  {
    name: "Germany",
    code: "DE",
    continent: "Europe",
    minLat: 47,
    maxLat: 56,
    minLng: 5,
    maxLng: 16,
  },
  {
    name: "Italy",
    code: "IT",
    continent: "Europe",
    minLat: 36,
    maxLat: 47,
    minLng: 6,
    maxLng: 19,
  },
  {
    name: "Greece",
    code: "GR",
    continent: "Europe",
    minLat: 35,
    maxLat: 42,
    minLng: 19,
    maxLng: 29,
  },
  {
    name: "United Kingdom",
    code: "GB",
    continent: "Europe",
    minLat: 50,
    maxLat: 59,
    minLng: -8,
    maxLng: 2,
  },
  {
    name: "Ireland",
    code: "IE",
    continent: "Europe",
    minLat: 51,
    maxLat: 56,
    minLng: -11,
    maxLng: -6,
  },
  {
    name: "Netherlands",
    code: "NL",
    continent: "Europe",
    minLat: 50,
    maxLat: 54,
    minLng: 3,
    maxLng: 8,
  },
  {
    name: "Belgium",
    code: "BE",
    continent: "Europe",
    minLat: 49,
    maxLat: 52,
    minLng: 2,
    maxLng: 7,
  },
  {
    name: "Switzerland",
    code: "CH",
    continent: "Europe",
    minLat: 45,
    maxLat: 48,
    minLng: 5,
    maxLng: 11,
  },
  {
    name: "Austria",
    code: "AT",
    continent: "Europe",
    minLat: 46,
    maxLat: 49,
    minLng: 9,
    maxLng: 17,
  },
  {
    name: "Poland",
    code: "PL",
    continent: "Europe",
    minLat: 49,
    maxLat: 55,
    minLng: 14,
    maxLng: 24,
  },
  {
    name: "Czech Republic",
    code: "CZ",
    continent: "Europe",
    minLat: 48,
    maxLat: 51,
    minLng: 12,
    maxLng: 19,
  },
  {
    name: "Hungary",
    code: "HU",
    continent: "Europe",
    minLat: 45,
    maxLat: 49,
    minLng: 16,
    maxLng: 23,
  },
  {
    name: "Romania",
    code: "RO",
    continent: "Europe",
    minLat: 43,
    maxLat: 49,
    minLng: 20,
    maxLng: 30,
  },
  {
    name: "Bulgaria",
    code: "BG",
    continent: "Europe",
    minLat: 41,
    maxLat: 45,
    minLng: 22,
    maxLng: 29,
  },
  {
    name: "Sweden",
    code: "SE",
    continent: "Europe",
    minLat: 55,
    maxLat: 70,
    minLng: 10,
    maxLng: 25,
  },
  {
    name: "Norway",
    code: "NO",
    continent: "Europe",
    minLat: 58,
    maxLat: 72,
    minLng: 4,
    maxLng: 31,
  },
  {
    name: "Denmark",
    code: "DK",
    continent: "Europe",
    minLat: 54,
    maxLat: 58,
    minLng: 7,
    maxLng: 16,
  },
  {
    name: "Finland",
    code: "FI",
    continent: "Europe",
    minLat: 60,
    maxLat: 71,
    minLng: 20,
    maxLng: 32,
  },
  {
    name: "Russia",
    code: "RU",
    continent: "Europe/Asia",
    minLat: 41,
    maxLat: 81,
    minLng: 19,
    maxLng: 180,
  },
  {
    name: "Ukraine",
    code: "UA",
    continent: "Europe",
    minLat: 42,
    maxLat: 53,
    minLng: 22,
    maxLng: 41,
  },

  // Africa
  {
    name: "Morocco",
    code: "MA",
    continent: "Africa",
    minLat: 27,
    maxLat: 36,
    minLng: -6,
    maxLng: 3,
  },
  {
    name: "Algeria",
    code: "DZ",
    continent: "Africa",
    minLat: 19,
    maxLat: 37,
    minLng: -9,
    maxLng: 12,
  },
  {
    name: "Tunisia",
    code: "TN",
    continent: "Africa",
    minLat: 30,
    maxLat: 37,
    minLng: 8,
    maxLng: 12,
  },
  {
    name: "Egypt",
    code: "EG",
    continent: "Africa",
    minLat: 22,
    maxLat: 32,
    minLng: 25,
    maxLng: 35,
  },
  {
    name: "Libya",
    code: "LY",
    continent: "Africa",
    minLat: 20,
    maxLat: 34,
    minLng: 9,
    maxLng: 26,
  },
  {
    name: "Sudan",
    code: "SD",
    continent: "Africa",
    minLat: 3,
    maxLat: 22,
    minLng: 22,
    maxLng: 39,
  },
  {
    name: "Kenya",
    code: "KE",
    continent: "Africa",
    minLat: -5,
    maxLat: 5,
    minLng: 34,
    maxLng: 42,
  },
  {
    name: "Tanzania",
    code: "TZ",
    continent: "Africa",
    minLat: -12,
    maxLat: -1,
    minLng: 29,
    maxLng: 41,
  },
  {
    name: "Uganda",
    code: "UG",
    continent: "Africa",
    minLat: -2,
    maxLat: 5,
    minLng: 30,
    maxLng: 36,
  },
  {
    name: "Ethiopia",
    code: "ET",
    continent: "Africa",
    minLat: 3,
    maxLat: 15,
    minLng: 33,
    maxLng: 48,
  },
  {
    name: "South Africa",
    code: "ZA",
    continent: "Africa",
    minLat: -47,
    maxLat: -22,
    minLng: 16,
    maxLng: 33,
  },
  {
    name: "Nigeria",
    code: "NG",
    continent: "Africa",
    minLat: 4,
    maxLat: 14,
    minLng: 2,
    maxLng: 15,
  },
  {
    name: "Ghana",
    code: "GH",
    continent: "Africa",
    minLat: 1,
    maxLat: 12,
    minLng: -4,
    maxLng: 2,
  },
  {
    name: "Ivory Coast",
    code: "CI",
    continent: "Africa",
    minLat: 4,
    maxLat: 11,
    minLng: -9,
    maxLng: -2,
  },

  // Middle East
  {
    name: "Turkey",
    code: "TR",
    continent: "Europe/Asia",
    minLat: 36,
    maxLat: 42,
    minLng: 26,
    maxLng: 45,
  },
  {
    name: "Israel",
    code: "IL",
    continent: "Asia",
    minLat: 31,
    maxLat: 34,
    minLng: 34,
    maxLng: 36,
  },
  {
    name: "Jordan",
    code: "JO",
    continent: "Asia",
    minLat: 29,
    maxLat: 33,
    minLng: 34,
    maxLng: 40,
  },
  {
    name: "Saudi Arabia",
    code: "SA",
    continent: "Asia",
    minLat: 16,
    maxLat: 33,
    minLng: 34,
    maxLng: 56,
  },
  {
    name: "United Arab Emirates",
    code: "AE",
    continent: "Asia",
    minLat: 22,
    maxLat: 27,
    minLng: 51,
    maxLng: 56,
  },
  {
    name: "Qatar",
    code: "QA",
    continent: "Asia",
    minLat: 24,
    maxLat: 27,
    minLng: 50,
    maxLng: 52,
  },
  {
    name: "Oman",
    code: "OM",
    continent: "Asia",
    minLat: 16,
    maxLat: 27,
    minLng: 52,
    maxLng: 60,
  },
  {
    name: "Yemen",
    code: "YE",
    continent: "Asia",
    minLat: 12,
    maxLat: 20,
    minLng: 42,
    maxLng: 54,
  },
  {
    name: "Iraq",
    code: "IQ",
    continent: "Asia",
    minLat: 29,
    maxLat: 38,
    minLng: 39,
    maxLng: 49,
  },
  {
    name: "Iran",
    code: "IR",
    continent: "Asia",
    minLat: 25,
    maxLat: 40,
    minLng: 44,
    maxLng: 61,
  },
  {
    name: "Afghanistan",
    code: "AF",
    continent: "Asia",
    minLat: 29,
    maxLat: 39,
    minLng: 60,
    maxLng: 75,
  },
  {
    name: "Pakistan",
    code: "PK",
    continent: "Asia",
    minLat: 24,
    maxLat: 37,
    minLng: 61,
    maxLng: 78,
  },

  // South Asia
  {
    name: "India",
    code: "IN",
    continent: "Asia",
    minLat: 8,
    maxLat: 36,
    minLng: 68,
    maxLng: 97,
  },
  {
    name: "Bangladesh",
    code: "BD",
    continent: "Asia",
    minLat: 21,
    maxLat: 27,
    minLng: 88,
    maxLng: 93,
  },
  {
    name: "Sri Lanka",
    code: "LK",
    continent: "Asia",
    minLat: 5,
    maxLat: 10,
    minLng: 80,
    maxLng: 82,
  },
  {
    name: "Nepal",
    code: "NP",
    continent: "Asia",
    minLat: 26,
    maxLat: 31,
    minLng: 80,
    maxLng: 88,
  },
  {
    name: "Bhutan",
    code: "BT",
    continent: "Asia",
    minLat: 26,
    maxLat: 28,
    minLng: 88,
    maxLng: 93,
  },

  // Southeast Asia
  {
    name: "Thailand",
    code: "TH",
    continent: "Asia",
    minLat: 5,
    maxLat: 21,
    minLng: 97,
    maxLng: 106,
  },
  {
    name: "Vietnam",
    code: "VN",
    continent: "Asia",
    minLat: 8,
    maxLat: 24,
    minLng: 102,
    maxLng: 110,
  },
  {
    name: "Cambodia",
    code: "KH",
    continent: "Asia",
    minLat: 10,
    maxLat: 15,
    minLng: 102,
    maxLng: 108,
  },
  {
    name: "Laos",
    code: "LA",
    continent: "Asia",
    minLat: 14,
    maxLat: 23,
    minLng: 100,
    maxLng: 108,
  },
  {
    name: "Malaysia",
    code: "MY",
    continent: "Asia",
    minLat: 1,
    maxLat: 7,
    minLng: 100,
    maxLng: 119,
  },
  {
    name: "Indonesia",
    code: "ID",
    continent: "Asia",
    minLat: -11,
    maxLat: 6,
    minLng: 95,
    maxLng: 141,
  },
  {
    name: "Philippines",
    code: "PH",
    continent: "Asia",
    minLat: 4,
    maxLat: 20,
    minLng: 117,
    maxLng: 127,
  },
  {
    name: "Singapore",
    code: "SG",
    continent: "Asia",
    minLat: 1,
    maxLat: 2,
    minLng: 103,
    maxLng: 104,
  },

  // East Asia
  {
    name: "China",
    code: "CN",
    continent: "Asia",
    minLat: 18,
    maxLat: 54,
    minLng: 73,
    maxLng: 135,
  },
  {
    name: "Japan",
    code: "JP",
    continent: "Asia",
    minLat: 30,
    maxLat: 45,
    minLng: 130,
    maxLng: 146,
  },
  {
    name: "South Korea",
    code: "KR",
    continent: "Asia",
    minLat: 33,
    maxLat: 39,
    minLng: 124,
    maxLng: 130,
  },
  {
    name: "North Korea",
    code: "KP",
    continent: "Asia",
    minLat: 37,
    maxLat: 43,
    minLng: 124,
    maxLng: 131,
  },
  {
    name: "Mongolia",
    code: "MN",
    continent: "Asia",
    minLat: 41,
    maxLat: 50,
    minLng: 88,
    maxLng: 120,
  },
  {
    name: "Taiwan",
    code: "TW",
    continent: "Asia",
    minLat: 21,
    maxLat: 25,
    minLng: 120,
    maxLng: 122,
  },

  // Oceania
  {
    name: "Australia",
    code: "AU",
    continent: "Oceania",
    minLat: -44,
    maxLat: -10,
    minLng: 113,
    maxLng: 154,
  },
  {
    name: "New Zealand",
    code: "NZ",
    continent: "Oceania",
    minLat: -47,
    maxLat: -34,
    minLng: 166,
    maxLng: 179,
  },
  {
    name: "Fiji",
    code: "FJ",
    continent: "Oceania",
    minLat: -20,
    maxLat: -16,
    minLng: 177,
    maxLng: 180,
  },
];

const getCountryFromCoords = (
  lat: number,
  lng: number,
): { name: string; code: string; continent: string } => {
  for (const country of COUNTRIES) {
    if (
      lat >= country.minLat &&
      lat <= country.maxLat &&
      lng >= country.minLng &&
      lng <= country.maxLng
    ) {
      return {
        name: country.name,
        code: country.code,
        continent: country.continent,
      };
    }
  }

  return { name: "Unknown", code: "XX", continent: "Unknown" };
};

interface LocationInfo {
  country: string;
  countryCode: string;
  continent: string;
  city?: string;
  landmark?: string;
}

interface ReverseLookupResponse {
  country?: string | null;
  countryCode?: string | null;
  continent?: string | null;
  city?: string | null;
  landmark?: string | null;
}

function getReverseLookupCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function normalizeCountryName(country: string, countryCode?: string): string {
  if (!countryCode || typeof Intl?.DisplayNames !== "function") {
    return country;
  }

  const displayNames = new Intl.DisplayNames(["en"], {
    type: "region",
  });
  const normalized = displayNames.of(countryCode.toUpperCase());

  if (typeof normalized !== "string" || normalized.trim() === "") {
    return country;
  }

  return normalized;
}

async function resolveWesternLocationNames(
  lat: number,
  lng: number,
): Promise<Partial<LocationInfo>> {
  const key = getReverseLookupCacheKey(lat, lng);
  const cached = reverseLookupCache.get(key);

  if (cached) {
    return cached;
  }

  const request = (async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      );

      if (!response.ok) {
        return {};
      }

      const payload = (await response.json()) as ReverseLookupResponse;

      return {
        country:
          typeof payload.country === "string" && payload.country.trim() !== ""
            ? payload.country
            : undefined,
        countryCode:
          typeof payload.countryCode === "string" &&
          payload.countryCode.trim() !== ""
            ? payload.countryCode.toUpperCase()
            : undefined,
        continent:
          typeof payload.continent === "string" &&
          payload.continent.trim() !== ""
            ? payload.continent
            : undefined,
        city:
          typeof payload.city === "string" && payload.city.trim() !== ""
            ? payload.city
            : undefined,
        landmark:
          typeof payload.landmark === "string" && payload.landmark.trim() !== ""
            ? payload.landmark
            : undefined,
      };
    } catch {
      return {};
    }
  })();

  reverseLookupCache.set(key, request);
  return request;
}

export function getLocationFromCoords(lat: number, lng: number): LocationInfo {
  // First, check for nearby landmarks (highest priority - smallest radius)
  for (const site of SITES) {
    const distance = getDistance(lat, lng, site.lat, site.lng);
    if (distance <= site.radius) {
      const country = getCountryFromCoords(lat, lng);
      return {
        country: country.name,
        countryCode: country.code,
        continent: country.continent,
        city: site.city,
        landmark: site.name,
      };
    }
  }

  // Second, check for nearby cities
  for (const city of CITIES) {
    const distance = getDistance(lat, lng, city.lat, city.lng);
    if (distance <= city.radius) {
      const country = getCountryFromCoords(lat, lng);
      return {
        country: country.name,
        countryCode: country.code,
        continent: country.continent,
        city: city.name,
      };
    }
  }

  // Finally, return just country info
  const country = getCountryFromCoords(lat, lng);
  return {
    country: country.name,
    countryCode: country.code,
    continent: country.continent,
  };
}

export async function extractCountriesFromImages(
  images: GalleryImage[],
): Promise<CountryInfo[]> {
  const imagesWithLocation = images.filter((img) => img.location !== null);

  interface CountryItem extends CountryInfo {
    sortTimestamp: number;
  }

  const countryItems = await Promise.all(
    imagesWithLocation.map(async (img): Promise<CountryItem | null> => {
      if (!img.location) return null;

      const resolvedLocation = await resolveWesternLocationNames(
        img.location.lat,
        img.location.lng,
      );

      const fallbackLocation = getLocationFromCoords(
        img.location.lat,
        img.location.lng,
      );

      const countryCode =
        resolvedLocation.countryCode ??
        img.location.countryCode ??
        fallbackLocation.countryCode;

      const countryName = normalizeCountryName(
        resolvedLocation.country ??
          img.location.country ??
          fallbackLocation.country,
        countryCode,
      );

      const location = {
        country: countryName,
        countryCode,
        continent:
          resolvedLocation.continent ??
          img.location.continent ??
          fallbackLocation.continent,
        city:
          resolvedLocation.city ?? img.location.city ?? fallbackLocation.city,
        landmark:
          resolvedLocation.landmark ??
          img.location.landmark ??
          fallbackLocation.landmark,
      };

      return {
        name: location.country,
        code: location.countryCode,
        continent: location.continent,
        city: location.city,
        site: location.landmark,
        imageId: img.id,
        date: (img.takenAt ?? img.uploadedAt).toISOString(),
        count: 1,
        sortTimestamp: (img.takenAt ?? img.uploadedAt).getTime(),
      };
    }),
  );

  return countryItems
    .filter((item): item is CountryItem => item !== null)
    .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
    .map(({ sortTimestamp: _sortTimestamp, ...country }) => country);
}
