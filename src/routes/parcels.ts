import { Router, Request, Response } from "express";
import { pool } from "../db/pool";
import wkx from "wkx";

const router = Router();

function addLatLngFromGeom(row: any) {
  try {
    if (!row?.geom) return row;

    // row.geom can be hex string or Buffer
    const buf = Buffer.isBuffer(row.geom) ? row.geom : Buffer.from(row.geom, "hex");
    const geom = wkx.Geometry.parse(buf);

    const gj: any = geom.toGeoJSON();

    const ll = extractLatLngFromGeoJSON(gj);
    if (!ll) return row;

    return {
      ...row,
      latitude: ll.lat,
      longitude: ll.lng,
    };
  } catch (e) {
    console.error("geom parse failed:", e);
    return row;
  }
}

function extractLatLngFromGeoJSON(gj: any): { lat: number; lng: number } | null {
  if (!gj) return null;

  // 1) Point
  if (gj.type === "Point" && Array.isArray(gj.coordinates)) {
    const [lng, lat] = gj.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  }

  // 2) GeometryCollection: find a Point first (best)
  if (gj.type === "GeometryCollection" && Array.isArray(gj.geometries)) {
    for (const g of gj.geometries) {
      const found = extractLatLngFromGeoJSON(g);
      if (found) return found;
    }
    return null;
  }

  // 3) Polygon / MultiPolygon / LineString ... : fallback to bbox center
  const coords: [number, number][] = [];
  collectLngLatPairs(gj.coordinates, coords);
  if (coords.length === 0) return null;

  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

// Recursively collects [lng,lat] pairs from nested coordinates arrays
function collectLngLatPairs(node: any, out: [number, number][]) {
  if (!node) return;

  // if it's a single coordinate pair [lng, lat]
  if (Array.isArray(node) && node.length === 2 &&
      typeof node[0] === "number" && typeof node[1] === "number") {
    out.push([node[0], node[1]]);
    return;
  }

  // otherwise recurse
  if (Array.isArray(node)) {
    for (const child of node) collectLngLatPairs(child, out);
  }
}


/**
 * GET /parcels
 * Query params:
 *  - isAuthenticated=true|false (임시)
 *  - limit (default 50, max 200)
 *  - minPrice, maxPrice  (total_value)
 *  - minSqft,  maxSqft   (sqft)
 */
router.get("/", async (req: Request, res: Response) => {
  const isAuthenticated = req.query.isAuthenticated === "true";
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  const minPrice = req.query.minPrice !== undefined ? Number(req.query.minPrice) : undefined;
  const maxPrice = req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : undefined;
  const minSqft = req.query.minSqft !== undefined ? Number(req.query.minSqft) : undefined;
  const maxSqft = req.query.maxSqft !== undefined ? Number(req.query.maxSqft) : undefined;

  try {
    const where: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // Guest restriction (ST-03)
    if (!isAuthenticated) {
      where.push(`LOWER(county) = $${idx++}`);
      values.push("dallas");
    }

    // Price filter (ST-04)
    if (Number.isFinite(minPrice)) {
      where.push(`total_value >= $${idx++}`);
      values.push(Math.floor(minPrice!));
    }
    if (Number.isFinite(maxPrice)) {
      where.push(`total_value <= $${idx++}`);
      values.push(Math.floor(maxPrice!));
    }

    // Size filter (ST-04)
    if (Number.isFinite(minSqft)) {
      where.push(`sqft IS NOT NULL AND sqft >= $${idx++}`);
      values.push(minSqft);
    }
    if (Number.isFinite(maxSqft)) {
      where.push(`sqft IS NOT NULL AND sqft <= $${idx++}`);
      values.push(maxSqft);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const text = `
      SELECT sl_uuid, address, county, sqft, total_value, geom
      FROM takehome.dallas_parcels
      ${whereClause}
      LIMIT $${idx}
    `;
    values.push(limit);

    const { rows } = await pool.query(text, values);
    const enrichedRows = rows.map(addLatLngFromGeom);
    return res.json(enrichedRows);
  } catch (err: unknown) {
    console.error("DB ERROR (/parcels):", err);
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "Failed to fetch parcels", detail });
  }
});

/* =========================
   ST-05: CSV EXPORT
   ========================= */

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * GET /parcels/export.csv
 * Same filters as /parcels
 */
router.get("/export.csv", async (req: Request, res: Response) => {
  const hasToken = typeof req.query.token === "string" && req.query.token.trim() !== "";

  const isAuthenticated =
    req.query.isAuthenticated === "true" || hasToken;
  const limit = Math.min(Number(req.query.limit ?? 5000), 5000);

  const minPrice = req.query.minPrice !== undefined ? Number(req.query.minPrice) : undefined;
  const maxPrice = req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : undefined;
  const minSqft = req.query.minSqft !== undefined ? Number(req.query.minSqft) : undefined;
  const maxSqft = req.query.maxSqft !== undefined ? Number(req.query.maxSqft) : undefined;

  try {
    const where: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (!isAuthenticated) {
      where.push(`LOWER(county) = $${idx++}`);
      values.push("dallas");
    }

    if (Number.isFinite(minPrice)) {
      where.push(`total_value >= $${idx++}`);
      values.push(Math.floor(minPrice!));
    }
    if (Number.isFinite(maxPrice)) {
      where.push(`total_value <= $${idx++}`);
      values.push(Math.floor(maxPrice!));
    }

    if (Number.isFinite(minSqft)) {
      where.push(`sqft IS NOT NULL AND sqft >= $${idx++}`);
      values.push(minSqft);
    }
    if (Number.isFinite(maxSqft)) {
      where.push(`sqft IS NOT NULL AND sqft <= $${idx++}`);
      values.push(maxSqft);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const text = `
      SELECT sl_uuid, address, county, sqft, total_value
      FROM takehome.dallas_parcels
      ${whereClause}
      LIMIT $${idx}
    `;
    values.push(limit);

    const { rows } = await pool.query(text, values);


    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="parcels.csv"'
    );

    const headers = ["sl_uuid", "address", "county", "sqft", "total_value"];
    res.write(headers.join(",") + "\n");

    for (const r of rows) {
      const line = [
        escapeCsv(r.sl_uuid),
        escapeCsv(r.address),
        escapeCsv(r.county),
        escapeCsv(r.sqft),
        escapeCsv(r.total_value),
      ].join(",");
      res.write(line + "\n");
    }

    return res.end();
  } catch (err: unknown) {
    console.error("DB ERROR (/parcels/export.csv):", err);
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "Failed to export parcels", detail });
  }
});

export default router;
