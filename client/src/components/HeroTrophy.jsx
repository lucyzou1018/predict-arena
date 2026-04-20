import { useMemo } from "react";

// Stylized SVG trophy gripped by two hands — representing the 1v1 AlphaMatch showdown.
// Chrome-blue gradients, animated float, sparkles, and halo glow.
export default function HeroTrophy() {
  const stars = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        key: i,
        left: `${8 + Math.random() * 84}%`,
        top: `${4 + Math.random() * 90}%`,
        size: 10 + Math.random() * 22,
        delay: `${Math.random() * 3}s`,
        duration: `${2.6 + Math.random() * 2.4}s`,
      })),
    []
  );

  return (
    <div className="relative w-full max-w-[400px] aspect-square mx-auto">
      {/* Soft halo behind the trophy */}
      <div
        className="absolute inset-0 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(77,140,255,0.55), rgba(124,92,255,0.22) 42%, transparent 72%)",
          opacity: 0.85,
        }}
      />

      {/* Sparkle bursts around trophy */}
      {stars.map((s) => (
        <span
          key={s.key}
          className="absolute sparkle"
          style={{
            left: s.left,
            top: s.top,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDelay: s.delay,
            animationDuration: s.duration,
            "--sparkle-max": 1,
          }}
        />
      ))}

      {/* Trophy + hands */}
      <div className="trophy-float relative w-full h-full">
        <svg
          viewBox="0 0 400 420"
          className="w-full h-full"
          style={{
            filter:
              "drop-shadow(0 18px 40px rgba(40,70,180,0.55)) drop-shadow(0 0 50px rgba(90,130,255,0.25))",
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="ht-cup" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f0f5ff" />
              <stop offset="22%" stopColor="#8fb4ff" />
              <stop offset="50%" stopColor="#355aa8" />
              <stop offset="72%" stopColor="#1a1f52" />
              <stop offset="88%" stopColor="#9170d9" />
              <stop offset="100%" stopColor="#f7bd97" />
            </linearGradient>
            <linearGradient id="ht-rim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbfcff" />
              <stop offset="60%" stopColor="#94ade0" />
              <stop offset="100%" stopColor="#3a4980" />
            </linearGradient>
            <linearGradient id="ht-handL" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a6bcff" />
              <stop offset="45%" stopColor="#4355c0" />
              <stop offset="100%" stopColor="#161844" />
            </linearGradient>
            <linearGradient id="ht-handR" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b0c4ff" />
              <stop offset="45%" stopColor="#4d5fd0" />
              <stop offset="100%" stopColor="#161a4e" />
            </linearGradient>
            <radialGradient id="ht-highlight" cx="0.35" cy="0.35" r="0.45">
              <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>

          {/* ===== LEFT arm + hand ===== */}
          <g>
            <path
              d="M 10 420 L 40 300 Q 55 255 115 245 L 165 252 L 170 310 Q 165 355 135 385 L 90 420 Z"
              fill="url(#ht-handL)"
            />
            {/* fist */}
            <path
              d="M 120 258 Q 175 252 182 290 L 178 320 Q 152 335 122 320 Z"
              fill="url(#ht-handL)"
            />
            {/* thumb */}
            <path
              d="M 170 254 Q 200 250 205 278 L 198 298 Q 180 302 170 285 Z"
              fill="url(#ht-handL)"
            />
            {/* arm highlight */}
            <path
              d="M 35 330 Q 55 285 110 275 L 115 290 Q 65 305 50 335 Z"
              fill="rgba(255,255,255,0.16)"
            />
          </g>

          {/* ===== RIGHT arm + hand ===== */}
          <g>
            <path
              d="M 390 420 L 360 300 Q 345 255 285 245 L 235 252 L 230 310 Q 235 355 265 385 L 310 420 Z"
              fill="url(#ht-handR)"
            />
            <path
              d="M 280 258 Q 225 252 218 290 L 222 320 Q 248 335 278 320 Z"
              fill="url(#ht-handR)"
            />
            <path
              d="M 230 254 Q 200 250 195 278 L 202 298 Q 220 302 230 285 Z"
              fill="url(#ht-handR)"
            />
            <path
              d="M 365 330 Q 345 285 290 275 L 285 290 Q 335 305 350 335 Z"
              fill="rgba(255,255,255,0.14)"
            />
          </g>

          {/* ===== Trophy base ===== */}
          <rect x="140" y="325" width="120" height="18" rx="3" fill="url(#ht-cup)" />
          <rect x="150" y="308" width="100" height="20" rx="4" fill="url(#ht-rim)" />

          {/* ===== Stem ===== */}
          <path
            d="M 180 250 L 180 312 L 220 312 L 220 250 Q 215 243 200 243 Q 185 243 180 250 Z"
            fill="url(#ht-cup)"
          />

          {/* ===== Cup body ===== */}
          <path
            d="M 120 75 Q 112 205 200 250 Q 288 205 280 75 Z"
            fill="url(#ht-cup)"
          />
          {/* cup curved reflection */}
          <path
            d="M 155 90 Q 145 180 200 225"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            opacity="0.6"
          />

          {/* ===== Handles ===== */}
          <path
            d="M 120 95 Q 68 110 72 170 Q 82 200 118 193"
            fill="none"
            stroke="url(#ht-cup)"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path
            d="M 280 95 Q 332 110 328 170 Q 318 200 282 193"
            fill="none"
            stroke="url(#ht-cup)"
            strokeWidth="18"
            strokeLinecap="round"
          />

          {/* ===== Rim ===== */}
          <ellipse cx="200" cy="75" rx="82" ry="14" fill="url(#ht-rim)" />
          <ellipse cx="200" cy="75" rx="70" ry="8" fill="rgba(8,15,40,0.6)" />
          <ellipse cx="200" cy="72" rx="65" ry="4" fill="rgba(255,255,255,0.22)" />

          {/* ===== Medallion with "C" logo ===== */}
          <circle
            cx="200"
            cy="150"
            r="40"
            fill="rgba(255,255,255,0.08)"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.5"
          />
          <path
            d="M 228 135 A 28 28 0 1 0 228 165 L 220 158 A 19 19 0 1 1 220 142 Z"
            fill="#f5f8ff"
          />

          {/* ===== Gloss highlight ===== */}
          <ellipse
            cx="168"
            cy="130"
            rx="34"
            ry="58"
            fill="url(#ht-highlight)"
            opacity="0.5"
          />
        </svg>
      </div>
    </div>
  );
}
