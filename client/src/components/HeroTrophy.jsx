import { useMemo } from "react";
import trophySrc from "../assets/hero-trophy.svg";

// Stylized trophy illustration — floats with sparkles + halo glow behind it.
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
    <div className="relative w-full max-w-[420px] mx-auto" style={{ aspectRatio: "420 / 512" }}>
      {/* Soft halo behind the trophy */}
      <div
        className="absolute inset-0 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(236,72,173,0.45), rgba(168,85,247,0.25) 42%, transparent 72%)",
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

      {/* Trophy image */}
      <div className="trophy-float relative w-full h-full flex items-center justify-center">
        <img
          src={trophySrc}
          alt="Trophy"
          className="w-full h-full object-contain"
          style={{
            filter:
              "drop-shadow(0 18px 40px rgba(180,40,130,0.45)) drop-shadow(0 0 50px rgba(217,70,239,0.25))",
          }}
        />
      </div>
    </div>
  );
}
