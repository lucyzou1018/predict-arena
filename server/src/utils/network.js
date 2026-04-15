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
  if (!proxyAgent) return request;

  request.getUrlFunc = async (req, signal) => {
    const controller = new AbortController();
    const timeoutMs = req.timeout || 300000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    if (signal) {
      signal.addListener(() => controller.abort());
    }

    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body ? Buffer.from(req.body) : undefined,
        agent: proxyAgent,
        signal: controller.signal,
      });
      return {
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: headersToObject(response.headers),
        body: response.status === 204 ? null : new Uint8Array(await response.arrayBuffer()),
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("request timeout");
        timeoutError.code = signal?.cancelled ? "CANCELLED" : "TIMEOUT";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
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
