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

const createRpcFetchRequest = (url) => {
  const request = new FetchRequest(url);
  request.timeout = parseInt(process.env.RPC_REQUEST_TIMEOUT_MS || "20000", 10);
  request.getUrlFunc = async (req) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeout);
    try {
      const response = await fetch(req.url, buildFetchOptions({
        method: req.method,
        headers: req.headers,
        body: req.body ? Buffer.from(req.body) : undefined,
        signal: controller.signal,
      }));
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
  createRpcFetchRequest,
};
