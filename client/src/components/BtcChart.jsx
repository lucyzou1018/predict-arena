import { useState, useEffect, useRef, useMemo } from "react";
import { useBtcPrice } from "../hooks/useBtcPrice";

const MAX_POINTS = 80;
const W = 500;
const H = 300;
const PAD = { top: 30, right: 60, bottom: 30, left: 10 };
const TICK_INTERVAL = 800; // ms between simulated ticks

// Generate realistic BTC-like price data immediately (tight around base)
function generateSeedData(basePrice) {
  const base = basePrice || 84500;
  const seed = [];
  const now = Date.now();
  let p = base;
  for (let i = 50; i >= 0; i--) {
    const noise = (Math.random() - 0.5) * base * 0.0003;
    const wave = Math.sin(i * 0.2) * base * 0.0002;
    p = base + noise + wave;
    seed.push({ price: p, time: now - i * TICK_INTERVAL });
  }
  return seed;
}

// Simulate micro price movement — stays very close to real price (±0.05%)
function simulateTick(lastPrice, basePrice) {
  const base = basePrice || lastPrice;
  // Strong mean-reversion keeps it near real price
  const reversion = (base - lastPrice) * 0.15;
  const noise = (Math.random() - 0.5) * base * 0.00008;
  const momentum = Math.sin(Date.now() * 0.002) * base * 0.00003;
  let next = lastPrice + reversion + noise + momentum;
  // Hard clamp within ±0.05% of real price
  const maxDrift = base * 0.0005;
  next = Math.max(base - maxDrift, Math.min(base + maxDrift, next));
  return next;
}

export default function BtcChart() {
  const realPrice = useBtcPrice();
  const [history, setHistory] = useState(() => generateSeedData(0));
  const seeded = useRef(false);
  const realPriceRef = useRef(0);

  // Track real price in a ref for the interval to access
  useEffect(() => {
    if (realPrice > 0) realPriceRef.current = realPrice;
  }, [realPrice]);

  // Once we get the first real price, re-seed with correct base
  useEffect(() => {
    if (realPrice > 0 && !seeded.current) {
      seeded.current = true;
      setHistory(generateSeedData(realPrice));
    }
  }, [realPrice]);

  // Continuous simulated ticks — keeps chart alive even when real price is flat
  useEffect(() => {
    const id = setInterval(() => {
      setHistory((h) => {
        const last = h[h.length - 1];
        if (!last) return h;
        const base = realPriceRef.current > 0 ? realPriceRef.current : last.price;
        const nextPrice = simulateTick(last.price, base);
        const next = [...h, { price: nextPrice, time: Date.now() }];
        return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
      });
    }, TICK_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const { path, areaPath, minP, maxP, points, isUp } = useMemo(() => {
    if (history.length < 2)
      return { path: "", areaPath: "", minP: 0, maxP: 0, points: [], isUp: true };

    const prices = history.map((h) => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const pts = history.map((h, i) => ({
      x: PAD.left + (i / (history.length - 1)) * chartW,
      y: PAD.top + chartH - ((h.price - min) / range) * chartH,
      price: h.price,
    }));

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const cpx = (prev.x + cur.x) / 2;
      d += ` C ${cpx} ${prev.y}, ${cpx} ${cur.y}, ${cur.x} ${cur.y}`;
    }

    const last = pts[pts.length - 1];
    const first = pts[0];
    const area = `${d} L ${last.x} ${H - PAD.bottom} L ${first.x} ${H - PAD.bottom} Z`;

    return {
      path: d,
      areaPath: area,
      minP: min,
      maxP: max,
      points: pts,
      isUp: prices[prices.length - 1] >= prices[0],
    };
  }, [history]);

  const color = isUp ? "#00c853" : "#ff1744";
  const lastPt = points[points.length - 1];
  // Display price: use the simulated chart price (close to real, with micro movement)
  const displayPrice = history.length > 0 ? history[history.length - 1].price : 0;
  const changePercent = history.length >= 2
    ? (((history[history.length - 1].price - history[0].price) / history[0].price) * 100).toFixed(2)
    : "0.00";

  const yLabels = useMemo(() => {
    if (minP === 0 && maxP === 0) return [];
    const chartH = H - PAD.top - PAD.bottom;
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const ratio = i / steps;
      const val = minP + (maxP - minP) * (1 - ratio);
      const y = PAD.top + ratio * chartH;
      return { y, label: val.toLocaleString("en-US", { maximumFractionDigits: 0 }) };
    });
  }, [minP, maxP]);

  return (
    <div className="btc-chart-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-violet-500/30 flex items-center justify-center">
            <span className="text-base font-bold text-white">₿</span>
          </div>
          <div>
            <span className="text-white/80 text-sm font-bold block">BTC / USD</span>
            <span className="text-white/25 text-[10px]">Real-time</span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1.5 justify-end">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
            <span className="text-lg font-mono font-black" style={{ color }}>
              ${displayPrice > 0 ? displayPrice.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color }}>
            {isUp ? "+" : ""}{changePercent}%
          </span>
        </div>
      </div>

      {/* SVG Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {yLabels.map((l, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={l.y} x2={W - PAD.right} y2={l.y}
              stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4"
            />
            <text
              x={W - PAD.right + 8} y={l.y + 4}
              fill="rgba(255,255,255,0.25)" fontSize="10" fontFamily="monospace"
            >
              {l.label}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#areaGrad)" />

        {/* Line */}
        <path
          d={path} fill="none" stroke="url(#lineGrad)"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          filter="url(#glow)"
        />

        {/* Current price dot */}
        {lastPt && (
          <g>
            <circle cx={lastPt.x} cy={lastPt.y} r="8" fill={color} opacity="0.15">
              <animate attributeName="r" values="8;16;8" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.2;0.05;0.2" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={lastPt.x} cy={lastPt.y} r="4.5" fill={color} filter="url(#glow)" />
            <circle cx={lastPt.x} cy={lastPt.y} r="2" fill="#fff" />
          </g>
        )}
      </svg>

      {/* Bottom stats row */}
      <div className="flex items-center justify-between mt-3 px-1 pt-3 border-t border-white/[0.04]">
        <div className="text-center flex-1">
          <p className="text-[9px] text-white/25 uppercase tracking-wider">24h Vol</p>
          <p className="text-xs font-mono font-bold text-white/50">$42.8B</p>
        </div>
        <div className="w-px h-6 bg-white/[0.06]" />
        <div className="text-center flex-1">
          <p className="text-[9px] text-white/25 uppercase tracking-wider">Dominance</p>
          <p className="text-xs font-mono font-bold text-white/50">61.2%</p>
        </div>
        <div className="w-px h-6 bg-white/[0.06]" />
        <div className="text-center flex-1">
          <p className="text-[9px] text-white/25 uppercase tracking-wider">Live Feed</p>
          <p className="text-xs font-mono font-bold text-emerald-400/70">{history.length} ticks</p>
        </div>
      </div>
    </div>
  );
}
