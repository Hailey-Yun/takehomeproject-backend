import { Router, Request, Response } from "express";
import { pool } from "../db/pool";

const router = Router();

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
    return res.json(rows);
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
  const isAuthenticated = req.query.isAuthenticated === "true";
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
