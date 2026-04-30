import "dotenv/config";

function normalizeOrigin(value) {
  const trimmed = `${value || ""}`.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

const clientUrls = `${process.env.CLIENT_URL || "http://localhost:5173"}`
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);
const inferredNetwork = `${process.env.RPC_URL || ""}`.toLowerCase().includes("mainnet")
  ? "mainnet"
  : "sepolia";
const network = `${process.env.NETWORK || process.env.VITE_NETWORK || inferredNetwork}`.toLowerCase() === "mainnet"
  ? "mainnet"
  : "sepolia";

export default {
  port: parseInt(process.env.PORT || "3001"),
  env: process.env.NODE_ENV || "development",
  network,
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
  client: {
    url: clientUrls[0] || "http://localhost:5173",
    urls: [...new Set(clientUrls)],
  },
  charts: {
    accessToken: process.env.CHARTS_ACCESS_TOKEN || "",
  },
  game: {
    matchTimeout: 60000,
    predictTimeout: 60000,
    predictSafeBuffer: 5000,
    settleDelay: 30000,
    roomExpiry: 300000,
    roomPrepareTimeout: parseInt(process.env.ROOM_PREPARE_TIMEOUT_MS || "180000", 10),
    paymentTimeout: 90000,
    entryFee: 1_000_000,
    feeRate: 0.05,
  },
};
