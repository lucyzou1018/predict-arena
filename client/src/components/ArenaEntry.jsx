import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";

const DURATION = 2400;
const BURST_DELAY = 320;

export default function ArenaEntry({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState(false);
  const startRef = useRef(Date.now());
  const rafRef = useRef(null);

  useEffect(() => {
    const tick = () => {
      const p = Math.min(((Date.now() - startRef.current) / DURATION) * 100, 100);
      setProgress(p);
      if (p < 100) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setBurst(true);
        setTimeout(onComplete, BURST_DELAY);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [onComplete]);

  const label =
    progress < 35 ? "INITIALIZING..." :
    progress < 70 ? "SYNCING ARENA..." :
    "ENTERING ARENA";

  return (
    <div className={`arena-entry-overlay${burst ? " arena-entry-burst" : ""}`}>
      <div className="arena-speed-lines" />
      <div className="arena-glow arena-glow-cyan" />
      <div className="arena-glow arena-glow-pink" />

      <div className={`arena-entry-center${burst ? " arena-entry-center-burst" : ""}`}>
        <div className="arena-logo-halo">
          <Logo className="h-10 w-auto text-white" />
        </div>

        <p className="arena-status-text">{label}</p>

        <div className="arena-progress-track">
          <div className="arena-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <p className="arena-progress-pct">{Math.floor(progress)}%</p>
      </div>
    </div>
  );
}
