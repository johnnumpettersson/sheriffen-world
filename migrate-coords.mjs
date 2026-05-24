import { Client as MinioClient } from "minio";

const MINIO_ENDPOINT = "minio-production-e7ba.up.railway.app";
const MINIO_ACCESS_KEY = "galleryminio";
const MINIO_SECRET_KEY = "AFpMss1uz0j1JsA3rFHBGgD_Re3O7buN";
const MINIO_BUCKET = "gallery-images";

const LIVE_URL = "https://sheriffen-world-production.up.railway.app";

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function main() {
  // 1. Fetch manifest from old MinIO
  console.log("Connecting to MinIO...");
  const minio = new MinioClient({
    endPoint: MINIO_ENDPOINT,
    useSSL: true,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY,
  });

  const stream = await minio.getObject(MINIO_BUCKET, "manifest.json");
  const buffer = await streamToBuffer(stream);
  const minioRecords = JSON.parse(buffer.toString("utf-8"));
  console.log(`MinIO manifest: ${minioRecords.length} records`);

  // 2. Fetch current manifest from live R2 app
  console.log("Fetching live R2 manifest...");
  const r2Records = await fetchJson(`${LIVE_URL}/api/images`);
  console.log(`R2 manifest: ${r2Records.length} records\n`);

  // Build lookup by image name for matching
  const minioByName = new Map(minioRecords.map((r) => [r.name, r]));

  // 3. Find R2 records missing coordinates that MinIO has
  const toMigrate = [];

  for (const r2 of r2Records) {
    if (r2.location?.lat && r2.location?.lng) continue; // already has coords

    const minioRecord = minioByName.get(r2.name);
    if (!minioRecord) continue;
    if (!minioRecord.location?.lat || !minioRecord.location?.lng) continue;

    toMigrate.push({ r2, minioLocation: minioRecord.location });
  }

  if (toMigrate.length === 0) {
    console.log("No missing coordinates found — everything is already up to date.");
    return;
  }

  console.log(`Found ${toMigrate.length} images with missing coordinates to migrate:\n`);

  // 4. Login to get auth token
  const loginRes = await fetch(`${LIVE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "sheriffen", password: "sheriffen123!" }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
  const { token } = await loginRes.json();
  console.log("Authenticated.\n");

  // 5. Patch each image with coordinates from MinIO
  let ok = 0;
  let fail = 0;

  for (const { r2, minioLocation } of toMigrate) {
    try {
      const res = await fetch(`${LIVE_URL}/api/images/${r2.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ location: minioLocation }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`✓ ${r2.name} → ${minioLocation.lat}, ${minioLocation.lng} (${minioLocation.country ?? "?"})`);
      ok++;
    } catch (err) {
      console.error(`✗ ${r2.name}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone. ${ok} migrated, ${fail} failed.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
