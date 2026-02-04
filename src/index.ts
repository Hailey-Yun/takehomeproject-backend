import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import parcelsRouter from "./routes/parcels";
import filtersRouter from "./routes/filters";
import savedFiltersRouter from "./routes/savedFilters";


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/parcels", parcelsRouter);
app.use("/filters", filtersRouter);
app.use("/saved-filters", savedFiltersRouter);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
