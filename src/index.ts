import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import parcelsRouter from "./routes/parcels";
import adminRouter from "./routes/admin"; //삭제하기
import filtersRouter from "./routes/filters";


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/parcels", parcelsRouter);
app.use("/admin", adminRouter); //삭제하기
app.use("/filters", filtersRouter);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
