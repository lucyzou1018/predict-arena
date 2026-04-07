import "dotenv/config";
export default {
  port: parseInt(process.env.PORT || "3001"),
  env: process.env.NODE_ENV || "development",
  db: { url: process.env.DATABASE_URL },
  redis: { url: process.env.REDIS_URL || "redis://localhost:6379" },
  rpc: { url: process.env.RPC_URL },
  contract: { address: process.env.CONTRACT_ADDRESS, oracleKey: process.env.ORACLE_PRIVATE_KEY },
  usdc: { address: process.env.USDC_ADDRESS },
  binance: { wsUrl: process.env.BINANCE_WS_URL || "wss://stream.binance.com:9443/ws/btcusdt@ticker" },
  client: { url: process.env.CLIENT_URL || "http://localhost:5173" },
  game: { matchTimeout: 15000, predictTimeout: 20000, settleDelay: 10000, roomExpiry: 300000, paymentTimeout: 60000, entryFee: 1_000_000, feeRate: 0.05 },
};
