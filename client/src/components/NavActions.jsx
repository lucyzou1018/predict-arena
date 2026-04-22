import { useEffect, useRef, useState } from "react";
import { useLang, LANGUAGES } from "../context/LangContext";

export function NavActions() {
  const { lang, setLang, t } = useLang();
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

  const openContact = () => {
    window.open("mailto:hello@alphamatch.xyz?subject=AlphaMatch%20Feedback", "_blank");
  };

  const btnCls =
    "w-8 h-8 rounded-full border border-white/10 text-white/60 hover:text-white/95 hover:bg-white/[0.05] hover:border-white/20 transition flex items-center justify-center";

  return (
    <div className="flex items-center gap-1.5">
      {/* Contact: inline on >=sm, merged into combined menu on <sm */}
      <button onClick={openContact} aria-label={t("nav.contact")} title={t("nav.contact")} className={`${btnCls} hidden sm:flex`}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.3 1-1.3 1.9V14" />
          <circle cx="12" cy="17" r="0.6" fill="currentColor" />
        </svg>
      </button>

      <div ref={wrapRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
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

        {open && (
          <div
            className="absolute right-0 mt-2 w-60 rounded-2xl z-50 overflow-hidden"
            style={{
              background: "linear-gradient(180deg, rgba(20,22,44,0.92), rgba(14,15,30,0.96))",
              border: "1px solid rgba(227,240,255,0.14)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 50px rgba(6,7,16,0.6), 0 0 0 1px rgba(124,92,255,0.08), 0 0 40px rgba(124,92,255,0.10)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div className="px-5 pt-4 pb-3 border-b border-white/[0.08]">
              <div className="text-white/95 font-black text-base tracking-tight">
                {t("nav.language")}
              </div>
            </div>
            <div className="p-2">
              {LANGUAGES.map((l) => {
                const selected = lang === l.code;
                return (
                  <button
                    key={l.code}
                    onClick={() => {
                      setLang(l.code);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl transition ${
                      selected
                        ? "bg-white/[0.06] text-white font-semibold"
                        : "text-white/75 hover:bg-white/[0.04] hover:text-white/95"
                    }`}
                  >
                    <span
                      className={`inline-flex w-3 h-3 rounded-full items-center justify-center ${
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
            {/* Contact entry — shown only on mobile since the standalone contact icon is hidden there */}
            <div className="sm:hidden border-t border-white/[0.08] p-2">
              <button
                onClick={() => { setOpen(false); openContact(); }}
                className="w-full flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl text-white/75 hover:bg-white/[0.04] hover:text-white/95 transition"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.3 1-1.3 1.9V14" />
                  <circle cx="12" cy="17" r="0.6" fill="currentColor" />
                </svg>
                <span>{t("nav.contact")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
