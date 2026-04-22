import { FetchRequest } from "ethers";
import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import config from "../config/index.js";

const proxyUrl = config.outbound.proxyUrl || "";
const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

const buildFetchOptions = (options = {}) => (
  proxyAgent ? { ...options, agent: proxyAgent } : options
);

const buildWebSocketOptions = (options = {}) => (
  proxyAgent ? { ...options, agent: proxyAgent } : options
);

const headersToObject = (headers) => {
  const normalized = {};
  if (!headers) return normalized;
  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = String(value);
  }
  return normalized;
};

const isProxyConnectionError = (error) => {
  const message = `${error?.message || error || ""}`.toLowerCase();
  return (
    message.includes("127.0.0.1:7890") ||
    message.includes("connect econnrefused") ||
    message.includes("proxy") ||
    message.includes("socket hang up") ||
    message.includes("client network socket disconnected") ||
    message.includes("packet length too long") ||
    message.includes("write eproto")
  );
};

const fetchWithProxyFallback = async (url, options = {}) => {
  if (!proxyAgent) return fetch(url, options);
  try {
    return await fetch(url, { ...options, agent: proxyAgent });
  } catch (error) {
    if (!isProxyConnectionError(error)) throw error;
    console.warn(`[Network] Proxy request failed for ${url}, retrying direct connection`);
    return fetch(url, options);
  }
};

const createRpcFetchRequest = (url) => {
  const request = new FetchRequest(url);
  request.timeout = parseInt(process.env.RPC_REQUEST_TIMEOUT_MS || "20000", 10);
  request.getUrlFunc = async (req) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeout);
    try {
      const response = await fetchWithProxyFallback(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body ? Buffer.from(req.body) : undefined,
        signal: controller.signal,
      });
      const arrayBuffer = await response.arrayBuffer();
      return {
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: headersToObject(response.headers),
        body: new Uint8Array(arrayBuffer),
      };
    } finally {
      clearTimeout(timer);
    }
  };
  return request;
};

export {
  proxyUrl,
  buildFetchOptions,
  buildWebSocketOptions,
  fetchWithProxyFallback,
  createRpcFetchRequest,
};
