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
  contractService.init();
  priceService.start();
  const app = express();
  app.use(cors({ origin: config.client.url }));
  app.use(express.json());
  app.get("/api/price", (_, res) => res.json({ price: priceService.getPrice() }));
  app.use("/api", gameRoutes);
  app.get("/health", (_, res) => res.json({ status: "ok", price: priceService.getPrice() }));
  const server = http.createServer(app);
  initSocket(server);
  server.listen(config.port, () => console.log(`[Server] Running on port ${config.port}`));
}
main().catch(console.error);
