import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";

const router = Router();
const FILE_PATH = path.join(process.cwd(), "data", "saved_filters.json");

type Filters = {
  minPrice?: number;
  maxPrice?: number;
  minSqft?: number;
  maxSqft?: number;
  [key: string]: any;
};

type Store = Record<string, Filters>; // userId -> filters

async function readStore(): Promise<Store> {
  try {
    const txt = await fs.readFile(FILE_PATH, "utf-8");
    return JSON.parse(txt || "{}");
  } catch (e: any) {
    if (e?.code === "ENOENT") return {};
    throw e;
  }
}

async function writeStore(store: Store) {
  await fs.writeFile(FILE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

// GET /saved-filters?userId=xxx
router.get("/", async (req, res) => {
  const userId = String(req.query.userId || "").trim();
  if (!userId) return res.status(400).json({ message: "userId is required" });

  const store = await readStore();
  return res.json(store[userId] ?? {});
});

// POST /saved-filters
// body: { userId: string, filters: Filters }
router.post("/", async (req, res) => {
  const userId = String(req.body?.userId || "").trim();
  const filters = (req.body?.filters || {}) as Filters;

  if (!userId) return res.status(400).json({ message: "userId is required" });

  const store = await readStore();
  store[userId] = filters;
  await writeStore(store);

  return res.json({ ok: true });
});

export default router;
