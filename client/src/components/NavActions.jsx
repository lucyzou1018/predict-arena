import { useEffect, useRef, useState } from "react";
import { useLang, LANGUAGES } from "../context/LangContext";

export function NavActions() {
  const { lang, setLang, t } = useLang();
  const [openMenu, setOpenMenu] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpenMenu(null);
    };
    const onKey = (e) => e.key === "Escape" && setOpenMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const openTelegram = () => {
    window.open("https://t.me/+aEQ-w-vlS845OWI1", "_blank", "noopener,noreferrer");
    setOpenMenu(null);
  };

  const btnCls =
    "w-8 h-8 rounded-full border border-white/[0.08] bg-[linear-gradient(180deg,rgba(19,17,31,0.82),rgba(10,10,18,0.86))] text-white/72 hover:text-white hover:border-fuchsia-200/[0.10] hover:bg-[linear-gradient(180deg,rgba(24,20,38,0.86),rgba(12,11,22,0.90))] transition flex items-center justify-center";

  return (
    <div ref={wrapRef} className="flex items-center gap-1.5">
      <div className="relative">
        <button
          onClick={() => setOpenMenu((v) => (v === "contact" ? null : "contact"))}
          aria-label={t("nav.contact")}
          title={t("nav.contact")}
          className={btnCls}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.3 1-1.3 1.9V14" />
            <circle cx="12" cy="17" r="0.6" fill="currentColor" />
          </svg>
        </button>

        {openMenu === "contact" && (
          <div className="absolute right-0 top-full mt-2 w-60 rounded-2xl border border-fuchsia-200/[0.10] bg-[linear-gradient(180deg,rgba(18,16,30,0.98),rgba(10,10,18,0.98))] p-2 shadow-2xl shadow-black/45 z-[80]">
            <button
              type="button"
              onClick={openTelegram}
              className="group flex w-full items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-left transition hover:border-fuchsia-200/[0.18] hover:bg-fuchsia-500/[0.07]"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-fuchsia-200/[0.10] bg-fuchsia-500/[0.08] text-fuchsia-100 group-hover:text-white">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 4.5 18 20.5c-.2.9-.9 1.1-1.6.7l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.6 13.7.7 12.2c-.9-.3-.9-1 .2-1.4L20.2 3.4c.8-.3 1.6.2 1.3 1.1Z" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-white/48">Telegram</span>
                <span className="block whitespace-nowrap text-xs font-semibold text-white/70 group-hover:text-white">@AlphaMatch Official</span>
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setOpenMenu((v) => (v === "language" ? null : "language"))}
          aria-label={t("nav.language")}
          title={t("nav.language")}
          className={btnCls}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a14 14 0 0 1 0 18" />
            <path d="M12 3a14 14 0 0 0 0 18" />
          </svg>
        </button>

        {openMenu === "language" && (
          <div
            className="absolute right-0 top-full mt-2 w-40 bg-[linear-gradient(180deg,rgba(18,16,30,0.98),rgba(10,10,18,0.98))] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-[80]"
          >
            <div className="px-3 py-2.5 border-b border-white/[0.06]">
              <div className="text-xs font-semibold text-white/70">
                {t("nav.language")}
              </div>
            </div>
            <div>
              {LANGUAGES.map((l) => {
                const selected = lang === l.code;
                return (
                  <button
                    key={l.code}
                    onClick={() => {
                      setLang(l.code);
                      setOpenMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 text-left text-xs px-3 py-2.5 font-semibold transition ${
                      selected
                        ? "bg-white/[0.04] text-white"
                        : "text-white/70 hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    <span
                      className={`inline-flex w-3 h-3 rounded-full items-center justify-center shrink-0 ${
                        selected ? "" : "border border-white/25"
                      }`}
                      style={
                        selected
                          ? {
                              background:
                                "radial-gradient(circle, #fff 30%, rgba(124,92,255,0.85) 100%)",
                              boxShadow: "0 0 10px rgba(139,120,255,0.55)",
                            }
                          : undefined
                      }
                    />
                    <span>{l.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
