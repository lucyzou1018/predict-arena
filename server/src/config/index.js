import "dotenv/config";
export default {
  port: parseInt(process.env.PORT || "3001"),
  env: process.env.NODE_ENV || "development",
  db: { url: process.env.DATABASE_URL },
  redis: { url: process.env.REDIS_URL || "redis://localhost:6379" },
  outbound: { proxyUrl: process.env.OUTBOUND_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || "" },
  rpc: { url: process.env.RPC_URL },
  contract: {
    address: process.env.CONTRACT_ADDRESS,
    ownerKey: process.env.OWNER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY,
    executorKey: process.env.EXECUTOR_PRIVATE_KEY || process.env.OWNER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY,
    oracleKey: process.env.ORACLE_SIGNER_PRIVATE_KEY || process.env.OWNER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY,
    mockMode: process.env.LOCAL_CHAIN_MOCK === "1" || process.env.LOCAL_CHAIN_MOCK === "true",
  },
  usdc: { address: process.env.USDC_ADDRESS },
  binance: { wsUrl: process.env.BINANCE_WS_URL || "wss://stream.binance.com:9443/ws/btcusdt@ticker" },
  client: { url: process.env.CLIENT_URL || "http://localhost:5173" },
  game: { matchTimeout: 15000, predictTimeout: 30000, predictSafeBuffer: 5000, settleDelay: 30000, roomExpiry: 300000, paymentTimeout: 60000, entryFee: 1_000_000, feeRate: 0.05 },
};
