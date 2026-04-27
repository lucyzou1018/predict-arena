export function CountdownRing({ total, remaining, label, size = "md" }) {
  const safeTotal = Math.max(1, Number(total || 1));
  const safeRemaining = Math.max(0, Number(remaining || 0));
  const isRevealing = label === "Reveal" && safeRemaining <= 0;
  const pct = Math.min(1, safeRemaining / safeTotal);
  const off = isRevealing ? 72 : 283 * (1 - pct);
  const color = isRevealing ? "#f472b6" : safeRemaining <= 5 ? "#f43f5e" : safeRemaining <= 10 ? "#f59e0b" : "#10b981";
  const w = size === "lg" ? "w-28 h-28" : size === "sm" ? "w-16 h-16" : "w-20 h-20";
  const txt = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-xl";
  const labelCls = size === "sm" ? "text-[8px] mt-1" : "text-[9px] mt-1.5";
  const labelText = isRevealing ? "Revealing" : label;

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${w} ${isRevealing ? "countdown-ring-revealing" : ""}`}>
        <svg viewBox="0 0 100 100" className={`w-full h-full -rotate-90 ${isRevealing ? "countdown-ring-loader" : ""}`}>
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="4" />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={isRevealing ? "168 115" : "283"}
            strokeDashoffset={off}
            style={{
              transition: isRevealing ? "stroke 0.5s" : "stroke-dashoffset 0.5s,stroke 0.5s",
              filter: `drop-shadow(0 0 6px ${color}30)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {isRevealing ? (
            <span className="countdown-ring-dots" aria-label="Revealing">
              <span />
              <span />
              <span />
            </span>
          ) : (
            <span className={`${txt} font-black font-mono`} style={{ color }}>{safeRemaining}</span>
          )}
        </div>
      </div>
      {labelText && <p className={`text-white/20 uppercase tracking-widest ${labelCls}`}>{labelText}</p>}
    </div>
  );
}
