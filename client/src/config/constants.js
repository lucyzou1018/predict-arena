const normalizeBaseUrl = (value, fallback) => {
  const url = `${value || fallback}`.trim();
  return url.replace(/\/+$/, "");
};

export const SERVER_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE, "http://localhost:3001");
export const LOCAL_CHAIN_MOCK = import.meta.env.VITE_LOCAL_CHAIN_MOCK === "1" || import.meta.env.VITE_LOCAL_CHAIN_MOCK === "true";

export const NETWORK = `${import.meta.env.VITE_NETWORK || "sepolia"}`.toLowerCase() === "mainnet" ? "mainnet" : "sepolia";

export const BASE_SEPOLIA_RPC_URL = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASE_SEPOLIA_RPC_FALLBACK_URLS = `${import.meta.env.VITE_BASE_SEPOLIA_RPC_FALLBACK_URLS || ""}`
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
export const BASE_SEPOLIA_FALLBACK_RPC_URLS = [
  BASE_SEPOLIA_RPC_URL,
  ...BASE_SEPOLIA_RPC_FALLBACK_URLS,
  "https://sepolia.base.org",
].filter((value, index, list) => value && list.indexOf(value) === index);

export const BASE_MAINNET_RPC_URL = import.meta.env.VITE_BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
const BASE_MAINNET_RPC_FALLBACK_URLS = `${import.meta.env.VITE_BASE_MAINNET_RPC_FALLBACK_URLS || ""}`
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
export const BASE_MAINNET_FALLBACK_RPC_URLS = [
  BASE_MAINNET_RPC_URL,
  ...BASE_MAINNET_RPC_FALLBACK_URLS,
  "https://mainnet.base.org",
].filter((value, index, list) => value && list.indexOf(value) === index);

export const BASE_SEPOLIA = { chainId: "0x14A34", chainName: "Base Sepolia", rpcUrls: BASE_SEPOLIA_FALLBACK_RPC_URLS, blockExplorerUrls: ["https://sepolia.basescan.org"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } };
export const BASE_MAINNET = { chainId: "0x2105", chainName: "Base", rpcUrls: BASE_MAINNET_FALLBACK_RPC_URLS, blockExplorerUrls: ["https://basescan.org"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } };
export const CHAIN = NETWORK === "mainnet" ? BASE_MAINNET : BASE_SEPOLIA;
export const CHAIN_ID = Number.parseInt(CHAIN.chainId, 16);
export const CHAIN_ID_BIGINT = BigInt(CHAIN_ID);
export const CHAIN_NETWORK_NAME = NETWORK === "mainnet" ? "base" : "base-sepolia";
export const READ_RPC_URLS = CHAIN.rpcUrls;
const DEFAULT_USDC_ADDRESS = NETWORK === "mainnet"
  ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  : "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS || DEFAULT_USDC_ADDRESS;
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
export const ENTRY_FEE = 1;
export const FEE_RATE = 0.05;
export const TEAM_SIZES = [2, 3, 4, 5];
export const MATCH_TIMEOUT = 60;
export const PREDICT_TIMEOUT = 60;
export const PREDICT_SAFE_BUFFER = 5;
export const SETTLE_DELAY = 30;
export const ROOM_EXPIRY = 300; // 5 minutes in seconds
export const PAYMENT_TIMEOUT = 90; // 90 seconds
