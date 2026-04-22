import express from "express";
import http from "http";
import cors from "cors";
import config from "./config/index.js";
import { initDB } from "./config/database.js";
import { initSocket } from "./socket/index.js";
import priceService from "./services/price.js";
import contractService from "./services/contract.js";
import gameService from "./services/game.js";
import gameRoutes from "./routes/game.js";

async function main() {
  await initDB();
  await gameService.recoverInterruptedGames();
  await contractService.init();
  priceService.start();
  const app = express();
  const allowedOrigins = new Set(config.client.urls);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  }));
  app.use(express.json());
  app.get("/api/price", (_, res) => res.json({ price: priceService.getPrice() }));
  app.use("/api", gameRoutes);
  app.get("/health", (_, res) => res.json({ status: "ok", price: priceService.getPrice() }));
  const server = http.createServer(app);
  initSocket(server);
  server.listen(config.port, () => console.log(`[Server] Running on port ${config.port}`));
}
process.on("unhandledRejection", (err) => console.error("[Process] unhandled rejection:", err?.message || err));
process.on("uncaughtException", (err) => console.error("[Process] uncaught exception:", err?.message || err));
main().catch(console.error);
