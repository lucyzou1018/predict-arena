import WebSocket from "ws";
import config from "../config/index.js";
import { buildFetchOptions, buildWebSocketOptions, fetchWithProxyFallback, proxyUrl } from "../utils/network.js";

const BINANCE_WS_URL = config.binance.wsUrl;
const RECONNECT_DELAY = 3000;
const REGION_BLOCK_RECONNECT_DELAY = 60000;
const REST_POLL_MS = 5000;
const STALE_AFTER_MS = parseInt(process.env.PRICE_STALE_AFTER_MS || `${REST_POLL_MS * 3}`, 10);

const REST_SOURCES = [
  {
    name: "binance",
    url: process.env.BINANCE_REST_URL || "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
    parse: (data) => parseFloat(data?.price),
  },
  {
    name: "okx",
    url: process.env.OKX_REST_URL || "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
    parse: (data) => parseFloat(data?.data?.[0]?.last),
  },
  {
    name: "coinbase",
    url: process.env.COINBASE_REST_URL || "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    parse: (data) => parseFloat(data?.data?.amount),
  },
  {
    name: "bybit",
    url: process.env.BYBIT_REST_URL || "https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT",
    parse: (data) => parseFloat(data?.result?.list?.[0]?.lastPrice),
  },
];

class PriceService {
  constructor() {
    this.price = 0;
    this.listeners = new Set();
    this.ws = null;
    this._reconnectTimer = null;
    this._alive = false;
    this._restTimer = null;
    this._healthTimer = null;
    this._lastTickAt = 0;
    this._lastPriceChangeAt = 0;
    this._lastSource = null;
    this._staleWarned = false;
    this._nextReconnectDelay = RECONNECT_DELAY;
  }

  start() {
    if (proxyUrl) {
      console.log(`[Price] Using proxy ${proxyUrl}`);
    }
    this._connect();
    this._startRestFallback();
    this._startHealthMonitor();
  }

  _applyPrice(nextPrice, source) {
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) return false;
    const now = Date.now();
    const changed = nextPrice !== this.price;
    this._lastTickAt = now;
    this._lastSource = source;
    this._staleWarned = false;
    if (!changed) return false;
    this.price = nextPrice;
    this._lastPriceChangeAt = now;
    for (const cb of this.listeners) cb(this.price);
    return true;
  }

  _connect() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }

    console.log("[Price] Connecting to Binance WebSocket...");
    this.ws = new WebSocket(BINANCE_WS_URL, buildWebSocketOptions());

    this.ws.on("open", () => {
      console.log("[Price] Binance WebSocket connected");
      this._alive = true;
    });

    this.ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw);
        const newPrice = parseFloat(data.c || data.p);
        this._applyPrice(newPrice, "binance-ws");
      } catch (e) {
        console.error("[Price] Parse error:", e.message);
      }
    });

    this.ws.on("close", () => {
      console.warn("[Price] WebSocket closed, reconnecting in " + this._nextReconnectDelay + "ms...");
      this._alive = false;
      this._scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[Price] WebSocket error:", err.message);
      if (`${err.message || ""}`.includes("451")) {
        this._nextReconnectDelay = REGION_BLOCK_RECONNECT_DELAY;
        console.warn("[Price] Binance WebSocket is blocked in this environment, relying on REST price sources");
      } else {
        this._nextReconnectDelay = RECONNECT_DELAY;
      }
      this._alive = false;
      this.ws.close();
    });
  }

  _startRestFallback() {
    if (this._restTimer) return;
    const poll = async () => {
      let lastError = null;
      for (const source of REST_SOURCES) {
        try {
          const res = await fetchWithProxyFallback(source.url, buildFetchOptions({ timeout: 4000 }));
          if (!res.ok) {
            throw new Error(`${source.name} returned ${res.status}`);
          }
          const data = await res.json();
          const nextPrice = source.parse(data);
          if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
            throw new Error(`${source.name} returned invalid price`);
          }
          this._applyPrice(nextPrice, `${source.name}-rest`);
          return;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) {
        console.warn("[Price] REST fallback failed:", lastError.message);
      }
    };
    poll();
    this._restTimer = setInterval(poll, REST_POLL_MS);
  }

  _startHealthMonitor() {
    if (this._healthTimer) return;
    this._healthTimer = setInterval(() => {
      if (!this._lastTickAt) return;
      const staleForMs = Date.now() - this._lastTickAt;
      if (staleForMs <= STALE_AFTER_MS || this._staleWarned) return;
      this._staleWarned = true;
      console.warn(`[Price] Feed looks stale for ${Math.round(staleForMs / 1000)}s (last source: ${this._lastSource || "unknown"})`);
    }, REST_POLL_MS);
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._nextReconnectDelay = RECONNECT_DELAY;
      this._connect();
    }, this._nextReconnectDelay);
  }

  getPrice() {
    return this.price;
  }

  getStatus() {
    const staleForMs = this._lastTickAt ? Date.now() - this._lastTickAt : null;
    return {
      price: this.price,
      source: this._lastSource,
      lastUpdatedAt: this._lastTickAt || null,
      lastPriceChangeAt: this._lastPriceChangeAt || null,
      stale: !this._lastTickAt || staleForMs > STALE_AFTER_MS,
      staleForMs,
      wsConnected: this._alive,
    };
  }

  getPriceForContract() {
    return Math.round(this.price * 100);
  }

  onPrice(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  stop() {
    if (this._restTimer) {
      clearInterval(this._restTimer);
      this._restTimer = null;
    }
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export default new PriceService();
