import { Router, Request, Response } from "express";
import { pool } from "../db/pool";

const router = Router();


router.get("/", async (req: Request, res: Response) => {
  const isAuthenticated = req.query.isAuthenticated === "true";
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  try {
    const text = isAuthenticated
      ? `
        SELECT sl_uuid, address, county, sqft, total_value, geom
        FROM takehome.dallas_parcels
        LIMIT $1
      `
      : `
        SELECT sl_uuid, address, county, sqft, total_value, geom
        FROM takehome.dallas_parcels
        WHERE LOWER(county) = $2
        LIMIT $1
      `;

    const values = isAuthenticated ? [limit] : [limit, "dallas"];
    const { rows } = await pool.query(text, values);

    return res.json(rows);
  } catch (err: unknown) {
    console.error("DB ERROR (/parcels):", err);

    const detail = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      error: "Failed to fetch parcels",
      detail,
    });
  }
});

export default router;
