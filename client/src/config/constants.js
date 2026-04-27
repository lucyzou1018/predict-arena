export const SERVER_URL = import.meta.env.VITE_API_BASE || "http://localhost:3001";
export const LOCAL_CHAIN_MOCK = import.meta.env.VITE_LOCAL_CHAIN_MOCK === "1" || import.meta.env.VITE_LOCAL_CHAIN_MOCK === "true";
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
export const BASE_SEPOLIA = { chainId: "0x14A34", chainName: "Base Sepolia", rpcUrls: BASE_SEPOLIA_FALLBACK_RPC_URLS, blockExplorerUrls: ["https://sepolia.basescan.org"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } };
export const CHAIN = BASE_SEPOLIA;
export const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
export const ENTRY_FEE = 1;
export const FEE_RATE = 0.05;
export const TEAM_SIZES = [2, 3, 4, 5];
export const MATCH_TIMEOUT = 60;
export const PREDICT_TIMEOUT = 30;
export const PREDICT_SAFE_BUFFER = 5;
export const SETTLE_DELAY = 30;
export const ROOM_EXPIRY = 300; // 5 minutes in seconds
export const PAYMENT_TIMEOUT = 180; // 180 seconds
