import { useNavigate } from "react-router-dom";
import { Logo } from "./Logo";

export function Footer() {
  const nav = useNavigate();

  return (
    <footer className="relative z-10 overflow-hidden border-t border-[rgba(244,114,182,0.18)] bg-[linear-gradient(180deg,rgba(60,20,42,0.22)_0%,rgba(18,14,28,0.94)_48%,rgba(10,9,18,0.96)_100%)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, rgba(236,72,153,0.13) 0%, transparent 45%), linear-gradient(180deg, rgba(255,255,255,0.03), transparent 18%)",
        }}
      />
      <div className="relative max-w-7xl mx-auto px-6 py-5 sm:py-6">
        <div className="flex flex-wrap items-center justify-center gap-2 text-center text-[11px] leading-6 text-white/28 sm:text-xs">
          <span>© 2026</span>
          <button onClick={() => nav("/")} className="transition hover:opacity-85">
            <Logo className="h-4 sm:h-[18px] w-auto text-white/80" />
          </button>
          <span>. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
