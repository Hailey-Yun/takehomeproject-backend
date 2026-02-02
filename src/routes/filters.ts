import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";

const router = Router();

type SavedFilter = {
  minPrice?: number;
  maxPrice?: number;
  minSqft?: number;
  maxSqft?: number;
  updatedAt: string;
};

// data/filters/<userId>.json 형태로 저장
const filtersDir = path.join(process.cwd(), "data", "filters");

function ensureDir() {
  if (!fs.existsSync(filtersDir)) fs.mkdirSync(filtersDir, { recursive: true });
}

function safeUserId(raw: string) {
  // 파일명 안전하게 (특수문자 제거)
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function getUserId(req: Request) {
  // 지금은 임시: query 또는 header 중 하나로 받자
  const fromQuery = typeof req.query.userId === "string" ? req.query.userId : "";
  const fromHeader = (req.header("X-User-Id") || "").trim();
  return (fromHeader || fromQuery || "").trim();
}

function getFilePath(userId: string) {
  const safe = safeUserId(userId);
  return path.join(filtersDir, `${safe}.json`);
}

/**
 * POST /filters
 * - userId는 query(?userId=) 또는 헤더(X-User-Id)로 받음
 * Body: { minPrice?, maxPrice?, minSqft?, maxSqft? }
 */
router.post("/", (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(400).json({ error: "Missing userId (query or X-User-Id)" });

  const { minPrice, maxPrice, minSqft, maxSqft } = req.body ?? {};

  ensureDir();

  const payload: SavedFilter = {
    minPrice: minPrice ?? undefined,
    maxPrice: maxPrice ?? undefined,
    minSqft: minSqft ?? undefined,
    maxSqft: maxSqft ?? undefined,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(getFilePath(userId), JSON.stringify(payload, null, 2), "utf-8");
  return res.status(201).json({ userId, ...payload });
});

/**
 * GET /filters/latest
 * - userId는 query(?userId=) 또는 헤더(X-User-Id)로 받음
 * 결과: 저장된 필터 or null
 */
router.get("/latest", (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(400).json({ error: "Missing userId (query or X-User-Id)" });

  ensureDir();

  const file = getFilePath(userId);
  if (!fs.existsSync(file)) return res.json(null);

  const raw = fs.readFileSync(file, "utf-8");
  return res.json(JSON.parse(raw));
});

export default router;
