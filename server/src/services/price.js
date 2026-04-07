import WebSocket from "ws";
import fetch from "node-fetch";

const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@ticker";
const BINANCE_REST_URL = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";
const RECONNECT_DELAY = 3000;
const REST_POLL_MS = 5000;

class PriceService {
  constructor() {
    this.price = 0;
    this.listeners = new Set();
    this.ws = null;
    this._reconnectTimer = null;
    this._alive = false;
    this._restTimer = null;
  }

  start() {
    this._connect();
    this._startRestFallback();
  }

  _connect() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }

    console.log("[Price] Connecting to Binance WebSocket...");
    this.ws = new WebSocket(BINANCE_WS_URL);

    this.ws.on("open", () => {
      console.log("[Price] Binance WebSocket connected");
      this._alive = true;
    });

    this.ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw);
        const newPrice = parseFloat(data.c || data.p);
        if (newPrice && newPrice !== this.price) {
          this.price = newPrice;
          for (const cb of this.listeners) cb(this.price);
        }
      } catch (e) {
        console.error("[Price] Parse error:", e.message);
      }
    });

    this.ws.on("close", () => {
      console.warn("[Price] WebSocket closed, reconnecting in " + RECONNECT_DELAY + "ms...");
      this._alive = false;
      this._scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[Price] WebSocket error:", err.message);
      this._alive = false;
      this.ws.close();
    });
  }

  _startRestFallback() {
    if (this._restTimer) return;
    const poll = async () => {
      try {
        const res = await fetch(BINANCE_REST_URL, { timeout: 4000 });
        const data = await res.json();
        const newPrice = parseFloat(data.price);
        if (newPrice && newPrice !== this.price) {
          this.price = newPrice;
          for (const cb of this.listeners) cb(this.price);
        }
      } catch (e) {
        console.warn("[Price] REST fallback failed:", e.message);
      }
    };
    poll();
    this._restTimer = setInterval(poll, REST_POLL_MS);
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, RECONNECT_DELAY);
  }

  getPrice() {
    return this.price;
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
