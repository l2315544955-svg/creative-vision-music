import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initializeDatabase } from "./lib/database.mjs";
import { seedSystemAdmin } from "./lib/userStore.mjs";
import { registerAssistantRoutes } from "./routes/assistant.mjs";
import { registerAuthRoutes } from "./routes/auth.mjs";
import { registerBootstrapRoutes } from "./routes/bootstrap.mjs";
import { registerBillingRoutes } from "./routes/billing.mjs";
import { registerConsoleRoutes } from "./routes/console.mjs";
import { registerMusicRoutes } from "./routes/music.mjs";
import { registerPaymentRoutes } from "./routes/payments.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, "../../..");
const envFile = process.env.NODE_ENV === "production" ? ".env" : ".env.local";

dotenv.config({
  path: path.join(projectRoot, envFile),
});
dotenv.config({
  path: path.join(projectRoot, ".env"),
});

initializeDatabase();
seedSystemAdmin();

const app = express();
const host = process.env.API_HOST || "0.0.0.0";
const port = Number(process.env.API_PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

registerAuthRoutes(app);
registerAssistantRoutes(app);
registerBootstrapRoutes(app);
registerBillingRoutes(app);
registerConsoleRoutes(app);
registerPaymentRoutes(app);
registerMusicRoutes(app);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `未找到路由: ${req.method} ${req.path}`,
  });
});

app.listen(port, host, () => {
  console.log(`[creative-vision-music-api] listening on http://${host}:${port}`);
});
