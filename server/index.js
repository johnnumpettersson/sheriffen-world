import cors from "cors";
import express from "express";
import piexif from "piexifjs";
import multer from "multer";
import { Client as MinioClient } from "minio";
import sanitize from "sanitize-filename";
import sharp from "sharp";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import ffmpeg from "fluent-ffmpeg";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const STORAGE_RETRY_MAX_ATTEMPTS = Number(
  process.env.STORAGE_RETRY_MAX_ATTEMPTS ?? 10,
);
const STORAGE_RETRY_INITIAL_DELAY = Number(
  process.env.STORAGE_RETRY_INITIAL_DELAY ?? 1000,
);
const STORAGE_STARTUP_BLOCKING =
  (process.env.STORAGE_STARTUP_BLOCKING ?? "false") === "true";

const PORT = Number(process.env.PORT ?? 8080);
const BUCKET = process.env.R2_BUCKET ?? "gallery-images";
const NOMINATIM_URL =
  process.env.NOMINATIM_URL ??
  "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&namedetails=1&zoom=18";
const GEOCODER_USER_AGENT =
  process.env.GEOCODER_USER_AGENT ?? "sheriffen-world/1.0 (self-hosted demo)";
const GEOCODER_ACCEPT_LANGUAGE = process.env.GEOCODER_ACCEPT_LANGUAGE ?? "en";
const UPLOAD_USERNAME = process.env.UPLOAD_USERNAME ?? "sheriffen";
const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD ?? "sheriffen123!";
const UPLOAD_AUTH_TTL_SECONDS = Number(
  process.env.UPLOAD_AUTH_TTL_SECONDS ?? 60 * 60 * 24,
);
const UPLOAD_AUTH_SECRET =
  process.env.UPLOAD_AUTH_SECRET ??
  process.env.UPLOAD_PASSWORD ??
  randomBytes(32).toString("hex");

const minio = new MinioClient({
  endPoint: `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  useSSL: true,
  accessKey: process.env.R2_ACCESS_KEY_ID ?? "",
  secretKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
});

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? true,
  }),
);
app.use(express.json({ limit: "1mb" }));

const MANIFEST_OBJECT = "manifest.json";
const VALID_GALLERIES = new Set(["main", "kids", "resor"]);
const GEOCODE_CACHE_OBJECT = "geocode-cache.json";
const DEFAULT_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const CHUNK_SIZE_BYTES = Number.isFinite(
  Number(process.env.UPLOAD_CHUNK_SIZE_BYTES),
)
  ? Number(process.env.UPLOAD_CHUNK_SIZE_BYTES)
  : DEFAULT_CHUNK_SIZE_BYTES;
const UPLOAD_SESSION_TTL_MS = Number(
  process.env.UPLOAD_SESSION_TTL_MS ?? 1000 * 60 * 60 * 24,
);
const uploadSessions = new Map();
const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/mpeg",
  "video/x-matroska",
]);
const MAX_VIDEO_SIZE_BYTES = Number.isFinite(
  Number(process.env.MAX_VIDEO_SIZE_BYTES),
)
  ? Number(process.env.MAX_VIDEO_SIZE_BYTES)
  : 500 * 1024 * 1024;
const VIDEO_THUMB_SUFFIX = "derivatives/video-thumb.webp";

function isVideo(type) {
  return VIDEO_MIME_TYPES.has((type ?? "").toLowerCase());
}

const IMAGE_VARIANTS = {
  mapThumbnail: {
    objectSuffix: "map-thumb-240.webp",
    width: 240,
    quality: 60,
  },
  thumbnail: {
    objectSuffix: "thumb-480.webp",
    width: 480,
    quality: 72,
  },
  preview: {
    objectSuffix: "preview-1600.webp",
    width: 1600,
    quality: 82,
  },
};
const chunkUploadBodyParser = express.raw({
  type: "application/octet-stream",
  limit: Math.max(CHUNK_SIZE_BYTES + 1024, CHUNK_SIZE_BYTES * 2),
});

function isStorageConnectionError(error) {
  const code = error?.code;
  return (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function ensureBucket() {
  const exists = await minio.bucketExists(BUCKET);
  if (!exists) {
    await minio.makeBucket(BUCKET);
  }
}

async function ensureBucketWithRetry(
  maxAttempts = STORAGE_RETRY_MAX_ATTEMPTS,
  initialDelayMs = STORAGE_RETRY_INITIAL_DELAY,
) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await ensureBucket();
      console.log("[api] R2 connection established");
      return;
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[api] R2 connection failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`,
          error instanceof Error ? error.message : String(error),
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(
    `[api] Failed to connect to R2 after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function readManifest() {
  const parsed = await readJsonObject(MANIFEST_OBJECT, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeManifest(records) {
  await writeJsonObject(MANIFEST_OBJECT, records);
}

async function readJsonObject(objectName, fallbackValue) {
  try {
    const stream = await minio.getObject(BUCKET, objectName);
    const buffer = await streamToBuffer(stream);
    return JSON.parse(buffer.toString("utf-8"));
  } catch (error) {
    if (isStorageConnectionError(error)) {
      console.warn(
        `[api] storage unavailable while reading ${objectName}, using fallback`,
        error instanceof Error ? error.message : String(error),
      );
      return fallbackValue;
    }

    const code = error?.code;
    if (
      code === "NoSuchKey" ||
      code === "NoSuchObject" ||
      code === "NotFound"
    ) {
      return fallbackValue;
    }

    throw error;
  }
}

async function writeJsonObject(objectName, value) {
  const payload = Buffer.from(JSON.stringify(value, null, 2), "utf-8");

  await minio.putObject(BUCKET, objectName, payload, payload.length, {
    "Content-Type": "application/json",
  });
}

function toApiImageRecord(record) {
  return {
    ...record,
    dataUrl: `/api/images/${record.id}/file`,
    mapThumbnailUrl: `/api/images/${record.id}/map-thumbnail`,
    thumbnailUrl: `/api/images/${record.id}/thumbnail`,
    previewUrl: `/api/images/${record.id}/preview`,
  };
}

function parsePositiveInteger(value) {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getImageVariantObjectKey(record, variantName) {
  const variant = IMAGE_VARIANTS[variantName];
  return `${record.id}/derivatives/${variant.objectSuffix}`;
}

function isMissingObjectError(error) {
  const code = error?.code;
  return (
    code === "NoSuchKey" ||
    code === "NoSuchObject" ||
    code === "NotFound" ||
    code === "ENOENT"
  );
}

async function objectExists(objectKey) {
  try {
    await minio.statObject(BUCKET, objectKey);
    return true;
  } catch (error) {
    if (isMissingObjectError(error)) {
      return false;
    }

    throw error;
  }
}

async function pipeObjectToResponse(res, objectKey, contentType) {
  const objectStream = await minio.getObject(BUCKET, objectKey);

  res.setHeader("Content-Type", contentType || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  objectStream.pipe(res);
}

async function pipeVideoToResponse(req, res, record) {
  const stat = await minio.statObject(BUCKET, record.objectKey);
  const fileSize = stat.size;
  const contentType = record.type || "video/mp4";
  const range = req.headers.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Type", contentType);

  if (!range) {
    res.setHeader("Content-Length", fileSize);
    const stream = await minio.getObject(BUCKET, record.objectKey);
    stream.pipe(res);
    return;
  }

  const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

  if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
    res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
    return;
  }

  const chunkSize = end - start + 1;
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  res.setHeader("Content-Length", chunkSize);

  const stream = await minio.getPartialObject(BUCKET, record.objectKey, start, chunkSize);
  stream.pipe(res);
}

function decimalToGPSRational(decimal) {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesDecimal = (abs - degrees) * 60;
  const minutes = Math.floor(minutesDecimal);
  const secondsRaw = Math.round((minutesDecimal - minutes) * 60 * 1000);
  return [[degrees, 1], [minutes, 1], [secondsRaw, 1000]];
}

function formatExifDate(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

async function embedRecordMetadata(sourceBuffer, record) {
  const hasGPS =
    record.location?.lat != null && record.location?.lng != null;
  const hasDate = record.takenAt != null;

  if (!hasGPS && !hasDate) {
    return { buffer: sourceBuffer, contentType: null };
  }

  try {
    // Convert to JPEG. .rotate() with no args applies the EXIF orientation
    // so the pixels are physically correct and no Orientation tag is needed.
    const jpegBuffer = await sharp(sourceBuffer)
      .rotate()
      .jpeg({ quality: 92 })
      .toBuffer();

    const binaryStr = jpegBuffer.toString("binary");
    let exifObj;
    try {
      exifObj = piexif.load(binaryStr);
    } catch {
      exifObj = { "0th": {}, Exif: {}, GPS: {}, "1st": {} };
    }

    if (hasGPS) {
      const { lat, lng } = record.location;
      exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
      exifObj.GPS[piexif.GPSIFD.GPSLatitude] = decimalToGPSRational(lat);
      exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
      exifObj.GPS[piexif.GPSIFD.GPSLongitude] = decimalToGPSRational(lng);
    }

    if (hasDate) {
      exifObj.Exif[piexif.ExifIFD.DateTimeOriginal] = formatExifDate(
        record.takenAt,
      );
    }

    const exifBytes = piexif.dump(exifObj);
    const newBinaryStr = piexif.insert(exifBytes, binaryStr);
    const buffer = Buffer.from(newBinaryStr, "binary");

    return { buffer, contentType: "image/jpeg" };
  } catch (err) {
    console.warn(
      "[api] embedRecordMetadata failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { buffer: sourceBuffer, contentType: null };
  }
}

async function ensureImageVariant(record, variantName) {
  const variant = IMAGE_VARIANTS[variantName];
  const variantObjectKey = getImageVariantObjectKey(record, variantName);

  if (await objectExists(variantObjectKey)) {
    return variantObjectKey;
  }

  const sourceStream = await minio.getObject(BUCKET, record.objectKey);
  const sourceBuffer = await streamToBuffer(sourceStream);
  const transformed = await sharp(sourceBuffer)
    .rotate()
    .resize({
      width: variant.width,
      withoutEnlargement: true,
      fit: "inside",
    })
    .webp({ quality: variant.quality })
    .toBuffer();

  await minio.putObject(
    BUCKET,
    variantObjectKey,
    transformed,
    transformed.length,
    {
      "Content-Type": "image/webp",
    },
  );

  return variantObjectKey;
}

async function generateVideoThumbnailFromSession(session, id) {
  const tempVideoPath = path.join(session.tempDir, "concat.tmp");
  const tempThumbPath = path.join(session.tempDir, "thumb.jpg");

  // Concatenate chunks into a single temp file for ffmpeg
  const writeStream = fs.createWriteStream(tempVideoPath);
  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    (async () => {
      for await (const chunk of readUploadChunks(session)) {
        writeStream.write(chunk);
      }
      writeStream.end();
    })().catch(reject);
  });

  // Get duration via ffprobe
  const duration = await new Promise((resolve) => {
    ffmpeg.ffprobe(tempVideoPath, (err, metadata) => {
      resolve(err ? null : (metadata?.format?.duration ?? null));
    });
  });

  // Seek to 10% of duration (capped at 5s) for a representative frame
  const seekSec = duration ? Math.min(duration * 0.1, 5) : 0;

  // Extract a single frame using explicit output options (more reliable than .screenshots())
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(tempVideoPath)
      .inputOptions([`-ss ${seekSec}`])
      .outputOptions(["-vframes 1", "-q:v 2"])
      .output(tempThumbPath)
      .on("end", resolve)
      .on("error", (err) => reject(new Error(`ffmpeg frame extract: ${err.message}`)))
      .run();
  });

  const thumbBuffer = await fsp.readFile(tempThumbPath);
  const webpBuffer = await sharp(thumbBuffer)
    .resize({ width: 480, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  const objectKey = `${id}/${VIDEO_THUMB_SUFFIX}`;
  await minio.putObject(BUCKET, objectKey, webpBuffer, webpBuffer.length, {
    "Content-Type": "image/webp",
  });

  console.log(`[api] video thumbnail generated for ${id} (seek=${seekSec.toFixed(1)}s, duration=${duration?.toFixed(1) ?? "unknown"}s)`);
  return { objectKey, duration };
}

async function getImageRecordById(imageId) {
  const records = await readManifest();
  return records.find((item) => item.id === imageId) ?? null;
}

async function readGeocodeCache() {
  const parsed = await readJsonObject(GEOCODE_CACHE_OBJECT, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function parseLocation(body) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return null;
}

function isFiniteCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeEditableLocation(payload) {
  if (payload == null) {
    return null;
  }

  if (typeof payload !== "object") {
    throw new Error("Invalid location payload");
  }

  const lat = Number(payload.lat);
  const lng = Number(payload.lng);

  if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
    throw new Error("Location requires numeric lat and lng");
  }

  const normalizeText = (value) =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

  const countryCodeRaw = normalizeText(payload.countryCode);

  return {
    lat,
    lng,
    country: normalizeText(payload.country),
    countryCode:
      countryCodeRaw && /^[A-Za-z]{2}$/.test(countryCodeRaw)
        ? countryCodeRaw.toUpperCase()
        : undefined,
    continent: normalizeText(payload.continent),
    city: normalizeText(payload.city),
    landmark: normalizeText(payload.landmark),
  };
}

function parseTakenAtInput(value) {
  if (value == null || value === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid takenAt value");
  }

  return date.toISOString();
}

function purgeExpiredUploadSessions() {
  const now = Date.now();

  for (const [uploadId, session] of uploadSessions.entries()) {
    if (now - session.updatedAt <= UPLOAD_SESSION_TTL_MS) {
      continue;
    }

    uploadSessions.delete(uploadId);
    void cleanupUploadSession(session);
  }
}

function isValidUploadChunkIndex(value, totalChunks) {
  if (!/^\d+$/.test(String(value))) {
    return false;
  }

  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < totalChunks;
}

async function cleanupUploadSession(session) {
  if (!session?.tempDir) {
    return;
  }

  try {
    await fsp.rm(session.tempDir, { recursive: true, force: true });
  } catch (error) {
    console.warn("[api] failed to clean upload session temp files", {
      uploadId: session.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function getChunkPath(session, chunkIndex) {
  return path.join(
    session.tempDir,
    `chunk-${String(chunkIndex).padStart(6, "0")}.part`,
  );
}

async function* readUploadChunks(session) {
  for (let chunkIndex = 0; chunkIndex < session.totalChunks; chunkIndex += 1) {
    yield await fsp.readFile(getChunkPath(session, chunkIndex));
  }
}

async function createChunkedUploadRecord(session) {
  const id = randomUUID();
  const originalName = sanitize(session.name) || `${id}.bin`;
  const objectKey = `${id}/${originalName}`;
  const isVideoFile = isVideo(session.type);

  const stream = Readable.from(readUploadChunks(session));
  await minio.putObject(BUCKET, objectKey, stream, session.size, {
    "Content-Type": session.type || "application/octet-stream",
  });

  let duration = null;
  if (isVideoFile) {
    try {
      const result = await generateVideoThumbnailFromSession(session, id);
      duration = result.duration;
    } catch (err) {
      console.warn(
        "[api] video thumbnail generation failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const record = {
    id,
    name: session.name,
    dataUrl: `/api/images/${id}/file`,
    objectKey,
    location: isVideoFile ? null : await enrichLocation(session.location),
    comment: null,
    takenAt: session.takenAt,
    uploadedAt: new Date().toISOString(),
    size: session.size,
    type: session.type,
    mediaType: isVideoFile ? "video" : "image",
    gallery: session.gallery ?? "main",
    ...(duration !== null && { duration }),
  };

  const records = await readManifest();
  records.unshift(record);
  await writeManifest(records);

  return record;
}

function toUploadSessionStatus(session) {
  return {
    uploadId: session.id,
    chunkSize: CHUNK_SIZE_BYTES,
    totalChunks: session.totalChunks,
    receivedChunks: Array.from(session.receivedChunks).sort((a, b) => a - b),
  };
}

function parseCommentInput(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Invalid comment value");
  }

  const comment = value.trim();
  return comment === "" ? null : comment;
}

function getCacheKey(lat, lng) {
  return `${GEOCODER_ACCEPT_LANGUAGE}:${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function getCountryCode(address) {
  const countryCode = address?.country_code;
  return typeof countryCode === "string"
    ? countryCode.toUpperCase()
    : undefined;
}

function getCountryName(address, countryCode) {
  if (countryCode && typeof Intl?.DisplayNames === "function") {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    const label = displayNames.of(countryCode);

    if (typeof label === "string" && label.trim() !== "") {
      return label;
    }
  }

  return address?.country;
}

const LETTER_PATTERN = /\p{Letter}/u;
const LATIN_SCRIPT_PATTERN = /\p{Script=Latin}/u;

function isLatinScriptText(value) {
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

function pickPreferredWesternText(candidates) {
  const normalized = candidates
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  if (normalized.length === 0) {
    return undefined;
  }

  const latinPreferred = normalized.find((value) => isLatinScriptText(value));
  return latinPreferred ?? normalized[0];
}

function pickCity(address, payload) {
  return pickPreferredWesternText([
    payload?.namedetails?.["name:en"],
    payload?.namedetails?.int_name,
    payload?.namedetails?.["name:latin"],
    address?.["city:en"],
    address?.["town:en"],
    address?.["village:en"],
    address?.city,
    address?.town,
    address?.village,
    address?.municipality,
    address?.hamlet,
    address?.county,
  ]);
}

function pickLandmark(payload) {
  return pickPreferredWesternText([
    payload?.namedetails?.["name:en"],
    payload?.address?.["name:en"],
    payload?.namedetails?.int_name,
    payload?.namedetails?.["name:latin"],
    payload?.name,
    payload?.display_name?.split(",")[0],
    payload?.address?.attraction,
    payload?.address?.tourism,
    payload?.address?.amenity,
    payload?.address?.building,
    payload?.address?.historic,
    payload?.address?.leisure,
    payload?.address?.natural,
  ]);
}

function normalizeResolvedLocation(lat, lng, payload) {
  const address = payload?.address ?? {};
  const city = pickCity(address, payload);
  const landmark = pickLandmark(payload);
  const countryCode = getCountryCode(address);
  const country = getCountryName(address, countryCode);

  return {
    lat,
    lng,
    country,
    countryCode,
    city,
    landmark: landmark && landmark !== city ? landmark : undefined,
  };
}

async function resolveLocationWithNominatim(lat, lng) {
  const cache = await readGeocodeCache();
  const cacheKey = getCacheKey(lat, lng);

  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("accept-language", GEOCODER_ACCEPT_LANGUAGE);

  const response = await fetch(url, {
    headers: {
      "User-Agent": GEOCODER_USER_AGENT,
      Accept: "application/json",
      "Accept-Language": GEOCODER_ACCEPT_LANGUAGE,
    },
  });

  if (!response.ok) {
    throw new Error(`Reverse geocoding failed with status ${response.status}`);
  }

  const payload = await response.json();
  const resolved = normalizeResolvedLocation(lat, lng, payload);

  cache[cacheKey] = resolved;
  await writeJsonObject(GEOCODE_CACHE_OBJECT, cache);

  return resolved;
}

async function enrichLocation(location) {
  if (!location) {
    return null;
  }

  if (location.country && location.countryCode) {
    return location;
  }

  try {
    return await resolveLocationWithNominatim(location.lat, location.lng);
  } catch (error) {
    console.warn("[api] reverse geocoding failed", error);
    return location;
  }
}

async function enrichRecords(records) {
  let didChange = false;

  const nextRecords = await Promise.all(
    records.map(async (record) => {
      const nextLocation = await enrichLocation(record.location);
      if (JSON.stringify(nextLocation) !== JSON.stringify(record.location)) {
        didChange = true;
        return { ...record, location: nextLocation };
      }

      return record;
    }),
  );

  if (didChange) {
    try {
      await writeManifest(nextRecords);
    } catch (error) {
      if (isStorageConnectionError(error)) {
        console.warn(
          "[api] storage unavailable while persisting enriched records",
          error instanceof Error ? error.message : String(error),
        );
      } else {
        throw error;
      }
    }
  }

  return nextRecords;
}

function getBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function createUploadAuthToken() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "upload-auth",
    iat: nowSeconds,
    exp: nowSeconds + UPLOAD_AUTH_TTL_SECONDS,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf-8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", UPLOAD_AUTH_SECRET)
    .update(payloadBase64)
    .digest("base64url");

  return `${payloadBase64}.${signature}`;
}

function verifyUploadAuthToken(token) {
  if (typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payloadBase64, signature] = parts;
  if (!payloadBase64 || !signature) {
    return false;
  }

  const expectedSignature = createHmac("sha256", UPLOAD_AUTH_SECRET)
    .update(payloadBase64)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature, "utf-8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf-8");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const payloadRaw = Buffer.from(payloadBase64, "base64url").toString(
      "utf-8",
    );
    const payload = JSON.parse(payloadRaw);

    if (payload?.sub !== "upload-auth") {
      return false;
    }

    if (typeof payload?.exp !== "number") {
      return false;
    }

    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function requireUploadAuth(req, res, next) {
  const token = getBearerToken(req.headers.authorization);

  if (!token || !verifyUploadAuthToken(token)) {
    res.status(401).json({ error: "Unauthorized upload request" });
    return;
  }

  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  const username = req.body?.username;
  const password = req.body?.password;

  if (username !== UPLOAD_USERNAME || password !== UPLOAD_PASSWORD) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = createUploadAuthToken();
  res.json({ token });
});

app.get("/api/auth/validate", requireUploadAuth, (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/uploads/initiate", requireUploadAuth, async (req, res, next) => {
  try {
    purgeExpiredUploadSessions();

    const name =
      typeof req.body?.name === "string" && req.body.name.trim() !== ""
        ? req.body.name.trim()
        : null;
    const type =
      typeof req.body?.type === "string" && req.body.type.trim() !== ""
        ? req.body.type.trim()
        : "application/octet-stream";
    const size = Number(req.body?.size);

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    if (!Number.isFinite(size) || size <= 0) {
      res.status(400).json({ error: "size must be a positive number" });
      return;
    }

    const maxSize = isVideo(type) ? MAX_VIDEO_SIZE_BYTES : 20 * 1024 * 1024;
    if (size > maxSize) {
      res.status(413).json({
        error: `File exceeds the ${Math.round(maxSize / 1024 / 1024)} MB limit`,
      });
      return;
    }

    const takenAt = parseTakenAtInput(req.body?.takenAt);
    const location = req.body?.location
      ? normalizeEditableLocation(req.body.location)
      : null;
    const gallery =
      typeof req.body?.gallery === "string" && VALID_GALLERIES.has(req.body.gallery)
        ? req.body.gallery
        : "main";

    const uploadId = randomUUID();
    const totalChunks = Math.ceil(size / CHUNK_SIZE_BYTES);
    const tempDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), `sheriffen-world-upload-${uploadId}-`),
    );

    uploadSessions.set(uploadId, {
      id: uploadId,
      name,
      type,
      size,
      takenAt,
      location,
      gallery,
      totalChunks,
      tempDir,
      receivedChunks: new Set(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    res.status(201).json({
      uploadId,
      chunkSize: CHUNK_SIZE_BYTES,
      totalChunks,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Invalid location payload" ||
        error.message === "Location requires numeric lat and lng" ||
        error.message === "Invalid takenAt value")
    ) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
});

app.put(
  "/api/uploads/:uploadId/chunks/:chunkIndex",
  requireUploadAuth,
  chunkUploadBodyParser,
  async (req, res, next) => {
    try {
      const session = uploadSessions.get(req.params.uploadId);

      if (!session) {
        res.status(404).json({ error: "Upload session not found" });
        return;
      }

      if (
        !isValidUploadChunkIndex(req.params.chunkIndex, session.totalChunks)
      ) {
        res.status(400).json({ error: "Invalid chunk index" });
        return;
      }

      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "Chunk body must be binary data" });
        return;
      }

      const chunkIndex = Number(req.params.chunkIndex);
      const isLastChunk = chunkIndex === session.totalChunks - 1;
      const expectedSize = isLastChunk
        ? session.size - chunkIndex * CHUNK_SIZE_BYTES
        : CHUNK_SIZE_BYTES;

      if (req.body.length !== expectedSize) {
        res
          .status(400)
          .json({ error: "Chunk size does not match expected size" });
        return;
      }

      await fsp.writeFile(getChunkPath(session, chunkIndex), req.body);

      session.receivedChunks.add(chunkIndex);
      session.updatedAt = Date.now();

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/uploads/:uploadId/status",
  requireUploadAuth,
  async (req, res, next) => {
    try {
      const session = uploadSessions.get(req.params.uploadId);

      if (!session) {
        res.status(404).json({ error: "Upload session not found" });
        return;
      }

      session.updatedAt = Date.now();
      res.json(toUploadSessionStatus(session));
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/uploads/:uploadId/complete",
  requireUploadAuth,
  async (req, res, next) => {
    try {
      const session = uploadSessions.get(req.params.uploadId);

      if (!session) {
        res.status(404).json({ error: "Upload session not found" });
        return;
      }

      if (session.receivedChunks.size !== session.totalChunks) {
        res.status(400).json({ error: "Upload is incomplete" });
        return;
      }

      const record = await createChunkedUploadRecord(session);
      uploadSessions.delete(session.id);
      await cleanupUploadSession(session);

      res.status(201).json(toApiImageRecord(record));
    } catch (error) {
      next(error);
    }
  },
);

app.delete(
  "/api/uploads/:uploadId",
  requireUploadAuth,
  async (req, res, next) => {
    try {
      const session = uploadSessions.get(req.params.uploadId);

      if (!session) {
        res.status(204).send();
        return;
      }

      uploadSessions.delete(session.id);
      await cleanupUploadSession(session);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/images", async (req, res, next) => {
  try {
    const gallery =
      typeof req.query.gallery === "string" && VALID_GALLERIES.has(req.query.gallery)
        ? req.query.gallery
        : "main";
    const allRecords = await enrichRecords(await readManifest());
    const records = allRecords.filter((r) => (r.gallery ?? "main") === gallery);
    const page = parsePositiveInteger(req.query.page);
    const pageSize = parsePositiveInteger(req.query.pageSize);

    if (!page && !pageSize) {
      res.setHeader(
        "Cache-Control",
        "public, max-age=60, stale-while-revalidate=300",
      );
      res.json(records.map(toApiImageRecord));
      return;
    }

    if (!page || !pageSize) {
      res
        .status(400)
        .json({ error: "page and pageSize must be positive integers" });
      return;
    }

    const boundedPageSize = Math.min(pageSize, 100);
    const totalItems = records.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / boundedPageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * boundedPageSize;
    const items = records
      .slice(start, start + boundedPageSize)
      .map(toApiImageRecord);

    res.setHeader(
      "Cache-Control",
      "public, max-age=30, stale-while-revalidate=120",
    );
    res.json({
      items,
      page: safePage,
      pageSize: boundedPageSize,
      totalItems,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/geocode/reverse", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res
        .status(400)
        .json({ error: "lat and lng query parameters are required" });
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: "Coordinates are out of range" });
      return;
    }

    const resolved = await resolveLocationWithNominatim(lat, lng);
    res.json({
      country: resolved?.country ?? null,
      countryCode: resolved?.countryCode ?? null,
      city: resolved?.city ?? null,
      continent: resolved?.continent ?? null,
      landmark: resolved?.landmark ?? null,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/images/:id/file", async (req, res, next) => {
  try {
    const record = await getImageRecordById(req.params.id);

    if (!record) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    // Redirect videos to a pre-signed R2 URL so the browser streams directly
    // from R2 (range requests, seeking, full bandwidth — no server proxy).
    if (isVideo(record.type)) {
      const signedUrl = await minio.presignedGetObject(
        BUCKET,
        record.objectKey,
        60 * 60, // 1-hour expiry
      );
      res.redirect(302, signedUrl);
      return;
    }

    const hasMetadata =
      (record.location?.lat != null && record.location?.lng != null) ||
      record.takenAt != null;

    if (!hasMetadata) {
      await pipeObjectToResponse(
        res,
        record.objectKey,
        record.type || "application/octet-stream",
      );
      return;
    }

    const objectStream = await minio.getObject(BUCKET, record.objectKey);
    const sourceBuffer = await streamToBuffer(objectStream);
    const { buffer: outputBuffer, contentType: embeddedType } =
      await embedRecordMetadata(sourceBuffer, record);
    const contentType =
      embeddedType || record.type || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Length", outputBuffer.length);
    res.end(outputBuffer);
  } catch (error) {
    next(error);
  }
});

app.get("/api/images/:id/thumbnail", async (req, res, next) => {
  try {
    const record = await getImageRecordById(req.params.id);

    if (!record) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    if (isVideo(record.type)) {
      const thumbKey = `${record.id}/${VIDEO_THUMB_SUFFIX}`;
      if (await objectExists(thumbKey)) {
        await pipeObjectToResponse(res, thumbKey, "image/webp");
      } else {
        res.status(404).json({ error: "Video thumbnail not available" });
      }
      return;
    }

    try {
      const variantObjectKey = await ensureImageVariant(record, "thumbnail");
      await pipeObjectToResponse(res, variantObjectKey, "image/webp");
      return;
    } catch (error) {
      console.warn("[api] thumbnail generation failed, serving original", {
        id: record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await pipeObjectToResponse(
      res,
      record.objectKey,
      record.type || "application/octet-stream",
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/images/:id/map-thumbnail", async (req, res, next) => {
  try {
    const record = await getImageRecordById(req.params.id);

    if (!record) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    if (isVideo(record.type)) {
      const thumbKey = `${record.id}/${VIDEO_THUMB_SUFFIX}`;
      if (await objectExists(thumbKey)) {
        await pipeObjectToResponse(res, thumbKey, "image/webp");
      } else {
        res.status(404).json({ error: "Video thumbnail not available" });
      }
      return;
    }

    try {
      const variantObjectKey = await ensureImageVariant(record, "mapThumbnail");
      await pipeObjectToResponse(res, variantObjectKey, "image/webp");
      return;
    } catch (error) {
      console.warn("[api] map thumbnail generation failed, serving thumbnail", {
        id: record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const fallbackVariantKey = await ensureImageVariant(record, "thumbnail");
      await pipeObjectToResponse(res, fallbackVariantKey, "image/webp");
      return;
    } catch {
      // Fall back to original below.
    }

    await pipeObjectToResponse(
      res,
      record.objectKey,
      record.type || "application/octet-stream",
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/images/:id/preview", async (req, res, next) => {
  try {
    const record = await getImageRecordById(req.params.id);

    if (!record) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    if (isVideo(record.type)) {
      const thumbKey = `${record.id}/${VIDEO_THUMB_SUFFIX}`;
      if (await objectExists(thumbKey)) {
        await pipeObjectToResponse(res, thumbKey, "image/webp");
      } else {
        res.status(404).json({ error: "Video thumbnail not available" });
      }
      return;
    }

    try {
      const variantObjectKey = await ensureImageVariant(record, "preview");
      await pipeObjectToResponse(res, variantObjectKey, "image/webp");
      return;
    } catch (error) {
      console.warn("[api] preview generation failed, serving original", {
        id: record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await pipeObjectToResponse(
      res,
      record.objectKey,
      record.type || "application/octet-stream",
    );
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/upload",
  requireUploadAuth,
  upload.single("image"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No image file provided" });
        return;
      }

      const id = randomUUID();
      const originalName = sanitize(req.file.originalname) || `${id}.jpg`;
      const objectKey = `${id}/${originalName}`;

      await minio.putObject(BUCKET, objectKey, req.file.buffer, req.file.size, {
        "Content-Type": req.file.mimetype || "application/octet-stream",
      });

      const record = {
        id,
        name: req.body.name || req.file.originalname,
        dataUrl: `/api/images/${id}/file`,
        objectKey,
        location: await enrichLocation(parseLocation(req.body)),
        comment: null,
        takenAt: req.body.takenAt || null,
        uploadedAt: new Date().toISOString(),
        size: req.file.size,
        type: req.file.mimetype,
      };

      const records = await readManifest();
      records.unshift(record);
      await writeManifest(records);

      res.status(201).json(toApiImageRecord(record));
    } catch (error) {
      next(error);
    }
  },
);

app.delete("/api/images/:id", requireUploadAuth, async (req, res, next) => {
  try {
    const records = await readManifest();
    const index = records.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    const [record] = records.splice(index, 1);
    await minio.removeObject(BUCKET, record.objectKey);
    await Promise.allSettled([
      ...Object.keys(IMAGE_VARIANTS).map((variantName) =>
        minio.removeObject(BUCKET, getImageVariantObjectKey(record, variantName)),
      ),
      ...(isVideo(record.type)
        ? [minio.removeObject(BUCKET, `${record.id}/${VIDEO_THUMB_SUFFIX}`)]
        : []),
    ]);
    await writeManifest(records);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/images/:id", requireUploadAuth, async (req, res, next) => {
  try {
    const records = await readManifest();
    const index = records.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    const current = records[index];

    const hasLocation = Object.prototype.hasOwnProperty.call(
      req.body,
      "location",
    );
    const hasTakenAt = Object.prototype.hasOwnProperty.call(
      req.body,
      "takenAt",
    );
    const hasComment = Object.prototype.hasOwnProperty.call(
      req.body,
      "comment",
    );

    if (!hasLocation && !hasTakenAt && !hasComment) {
      res.status(400).json({ error: "No metadata fields provided" });
      return;
    }

    let nextLocation = current.location;
    if (hasLocation) {
      nextLocation = normalizeEditableLocation(req.body.location);
      nextLocation = await enrichLocation(nextLocation);
    }

    let nextTakenAt = current.takenAt;
    if (hasTakenAt) {
      nextTakenAt = parseTakenAtInput(req.body.takenAt);
    }

    let nextComment = current.comment ?? null;
    if (hasComment) {
      nextComment = parseCommentInput(req.body.comment);
    }

    const updated = {
      ...current,
      location: nextLocation,
      comment: nextComment,
      takenAt: nextTakenAt,
    };

    records[index] = updated;
    await writeManifest(records);

    res.json(toApiImageRecord(updated));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Invalid location payload" ||
        error.message === "Location requires numeric lat and lng" ||
        error.message === "Invalid takenAt value" ||
        error.message === "Invalid comment value")
    ) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error("[api]", error);

  if (isStorageConnectionError(error)) {
    res.status(503).json({ error: "Storage service unavailable" });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "..", "dist");

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));

  app.get("/{*spa}", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(path.join(distDir, "index.html"));
  });
}

async function start() {
  if (STORAGE_STARTUP_BLOCKING) {
    await ensureBucketWithRetry();
  } else {
    ensureBucketWithRetry().catch((error) => {
      console.warn(
        "[api]",
        error instanceof Error ? error.message : String(error),
      );
    });
  }

  app.listen(PORT, () => {
    console.log(`[api] listening on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error("[api] startup failed", error);
  process.exit(1);
});
