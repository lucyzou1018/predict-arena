import { useMemo } from "react";

// Animated four-point sparkle stars sprinkled across the background.
// Rendered once at the app root so it appears on every page.
export default function Sparkles({ count = 22 }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        key: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: 10 + Math.random() * 28,
        delay: `${Math.random() * 5}s`,
        duration: `${2.8 + Math.random() * 3.6}s`,
        opacity: 0.55 + Math.random() * 0.45,
      })),
    [count]
  );
  return (
    <div className="sparkle-field" aria-hidden="true">
      {stars.map((s) => (
        <span
          key={s.key}
          className="sparkle"
          style={{
            left: s.left,
            top: s.top,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDelay: s.delay,
            animationDuration: s.duration,
            ["--sparkle-max"]: s.opacity,
          }}
        />
      ))}
    </div>
  );
}
