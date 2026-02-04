import { Router, Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";

const router = Router();

// Render-friendly: /tmp is writable but ephemeral
const DATA_DIR = process.env.DATA_DIR || path.join("/tmp", "takehome-data");
const FILE_PATH = path.join(DATA_DIR, "saved_filters.json");

type Filters = {
  minPrice?: number;
  maxPrice?: number;
  minSqft?: number;
  maxSqft?: number;
  [key: string]: any;
};

type Store = Record<string, Filters>; // userId -> filters

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore(): Promise<Store> {
  await ensureDir();
  try {
    const txt = await fs.readFile(FILE_PATH, "utf-8");
    return JSON.parse(txt || "{}");
  } catch (e: any) {
    if (e?.code === "ENOENT") return {};
    throw e;
  }
}

async function writeStore(store: Store) {
  await ensureDir();
  // atomic write (optional but nice)
  const tmpPath = `${FILE_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
  await fs.rename(tmpPath, FILE_PATH);
}

// GET /saved-filters?userId=xxx
router.get("/", async (req: Request, res: Response) => {
  const userId = String(req.query.userId || "").trim();
  if (!userId) return res.status(400).json({ message: "userId is required" });

  const store = await readStore();
  return res.json(store[userId] ?? {});
});

// POST /saved-filters
router.post("/", async (req: Request, res: Response) => {
  console.log("[DEPLOY CHECK] NEW saved-filters code running");
  try {
    const userId = String(req.body?.userId || "").trim();
    const filters = (req.body?.filters || {}) as Filters;

    if (!userId) return res.status(400).json({ message: "userId is required" });

    const store = await readStore();
    store[userId] = filters;
    await writeStore(store);

    return res.json({ ok: true });
  } catch (err) {
    console.error("[saved-filters][POST] error:", err);
    return res.status(500).json({ message: "Failed to save filters" });
  }
});


export default router;
