import { useEffect, useRef, useState } from "react";
import { BookOpen, HelpCircle, LayoutDashboard, Menu, Trophy } from "lucide-react";

const ICONS = {
  howToPlay: BookOpen,
  faq: HelpCircle,
  dashboard: LayoutDashboard,
  leaderboard: Trophy,
};

export function PrimaryNavMenu({ items }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectItem = (item) => {
    setOpen(false);
    item.onClick();
  };

  return (
    <div ref={wrapRef} className="relative lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Navigation"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-[linear-gradient(180deg,rgba(19,17,31,0.82),rgba(10,10,18,0.86))] text-white/72 transition hover:border-fuchsia-200/[0.10] hover:bg-[linear-gradient(180deg,rgba(24,20,38,0.86),rgba(12,11,22,0.90))] hover:text-white"
      >
        <Menu size={16} strokeWidth={1.9} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[80] mt-2 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,16,30,0.98),rgba(10,10,18,0.98))] shadow-2xl shadow-black/45">
          {items.map((item) => {
            const Icon = ICONS[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => selectItem(item)}
                aria-current={item.active ? "page" : undefined}
                className={`flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-semibold transition ${
                  item.active
                    ? "bg-white/[0.05] text-white"
                    : "text-white/70 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {Icon && <Icon size={14} strokeWidth={2} />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
