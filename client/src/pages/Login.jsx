import { useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { useT } from "../context/LangContext";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const { wallet, connect, connecting, connectStep } = useWallet();
  const t = useT();

  const next = useMemo(() => {
    const params = new URLSearchParams(loc.search);
    const n = params.get("next");
    return n && n.startsWith("/") ? n : "/arena";
  }, [loc.search]);

  useEffect(() => {
    if (wallet) nav(next, { replace: true });
  }, [wallet, next, nav]);

  const handleConnect = () => {
    if (!wallet) connect();
  };

  return (
    <div className="relative flex items-center justify-center px-6 py-16 min-h-[calc(100vh-80px)]">
      <div className="landing-bg" aria-hidden="true">
        <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="landing-story-card p-8 sm:p-10">
          <div className="text-center mb-8">
            <span className="landing-kicker mb-4 block">{t("login.badge")}</span>
            <h1 className="text-[26px] sm:text-[28px] font-black tracking-tight mb-2 leading-tight">
              {t("login.title")}{" "}
              <span className="text-gradient-fuchsia">AlphaMatch</span>
            </h1>
            <p className="text-white/55 text-sm leading-relaxed">
              {t("login.desc")}
            </p>
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="relative w-full overflow-hidden flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span
              className="absolute inset-0 opacity-80"
              style={{
                background: "linear-gradient(110deg,rgba(113,96,255,0.0),rgba(191,241,255,0.22),rgba(113,96,255,0.0))",
                backgroundSize: "220% 100%",
                animation: "shimmer 2.8s linear infinite",
              }}
            />
            <span className="relative flex items-center gap-2.5">
              {connecting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                  {connectStep === "signing" ? t("login.signing") : t("login.connecting")}
                </>
              ) : (
                t("login.connect")
              )}
            </span>
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/[0.08]" />
            <span className="text-[10px] uppercase tracking-widest text-white/35 font-semibold">{t("login.divider")}</span>
            <div className="flex-1 h-px bg-white/[0.08]" />
          </div>

          <ul className="space-y-2.5">
            {[t("login.point1"), t("login.point2"), t("login.point3")].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-xs text-white/60">
                <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 bg-fuchsia-500/10 border border-fuchsia-500/30">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgb(240,180,255)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-center text-[10px] text-white/35 leading-relaxed">
            {t("login.foot")}
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          {t("login.newHere")}{" "}
          <button
            onClick={() => nav("/how-to-play")}
            className="font-semibold text-fuchsia-400/70 hover:text-fuchsia-300 transition"
          >
            {t("login.learn")}
          </button>
        </p>
      </div>
    </div>
  );
}
