import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { useT } from "../context/LangContext";
import HeroTrophy from "../components/HeroTrophy";
import WalletMenu from "../components/WalletMenu";
import { NavActions } from "../components/NavActions";
import { Logo } from "../components/Logo";
import { Users, Calculator, Zap, Layers, ShieldCheck, BarChart2 } from "lucide-react";

const ADV_ICONS = [Users, Calculator, Zap, Layers, ShieldCheck, BarChart2];

const FAQ_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const HERO_FACT_INDEXES = [0, 1, 2];
const ROUND_INDEXES = [0, 1, 2];
const MODE_INDEXES = [0, 1, 2];
const ADV_INDEXES = [0, 1, 2, 3, 4, 5];
const STRIP_INDEXES = [0, 1, 2, 3];

export default function Landing() {
  const nav = useNavigate();
  const t = useT();
  const { wallet, connecting, mockMode, balance, showWalletMenu, setShowWalletMenu } = useWallet();
  const short = wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "";
  const [openFaq, setOpenFaq] = useState(0);

  const particles = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        key: i,
        left: `${4 + Math.random() * 92}%`,
        top: `${4 + Math.random() * 92}%`,
        delay: `${Math.random() * 5}s`,
        duration: `${4 + Math.random() * 4}s`,
        width: `${1.5 + Math.random() * 2.5}px`,
        height: `${1.5 + Math.random() * 2.5}px`,
      })),
    []
  );

  const handleEnter = () => {
    if (wallet) nav("/arena");
    else nav("/login?next=/arena");
  };

  const goDashboard = () => {
    if (wallet) nav("/arena");
    else nav("/login?next=/arena");
  };

  return (
    <div className="relative flex flex-col">
      <div className="landing-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div
          className="orb"
          style={{
            width: 360,
            height: 360,
            top: "22%",
            left: "10%",
            background: "radial-gradient(circle, rgba(77,140,255,0.34), transparent 70%)",
            animationDuration: "12s",
            animationDelay: "-2s",
          }}
        />
        <div
          className="orb"
          style={{
            width: 320,
            height: 320,
            top: "45%",
            right: "8%",
            background: "radial-gradient(circle, rgba(110,170,255,0.28), transparent 70%)",
            animationDuration: "14s",
            animationDelay: "-6s",
          }}
        />
        <div className="grid-overlay" />
        {particles.map((particle) => (
          <div
            key={particle.key}
            className="particle"
            style={{
              left: particle.left,
              top: particle.top,
              animationDelay: particle.delay,
              animationDuration: particle.duration,
              width: particle.width,
              height: particle.height,
            }}
          />
        ))}
      </div>

      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#081432]/[0.01] backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <button onClick={() => nav("/")} className="hover:opacity-80 transition text-white shrink-0">
              <Logo className="h-4 sm:h-6 w-auto" />
            </button>
            <button
              onClick={() => nav("/how-to-play")}
              className="text-xs px-2.5 sm:px-4 py-1.5 rounded-lg transition font-semibold text-white/40 hover:text-white/60 hover:bg-white/[0.06] whitespace-nowrap shrink-0"
            >
              {t("nav.howToPlay")}
            </button>
            <button
              onClick={goDashboard}
              className="hidden sm:inline-flex text-xs px-4 py-1.5 rounded-lg transition font-semibold text-white/40 hover:text-white/60 hover:bg-white/[0.06] whitespace-nowrap shrink-0"
            >
              {t("nav.dashboard")}
            </button>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <NavActions />
            <div className="relative">
              {wallet ? (
                <button
                  onClick={() => setShowWalletMenu(!showWalletMenu)}
                  className="group text-xs pl-1.5 pr-3.5 py-1 rounded-xl transition font-semibold bg-white/[0.04] border border-white/[0.08] text-white/65 hover:text-white/90 hover:bg-white/[0.06] flex items-center gap-2"
                >
                  {/* Person avatar — pulsing glow + outward ring wave */}
                  <span
                    className="avatar-pulse relative inline-flex items-center justify-center w-6 h-6 rounded-full overflow-visible"
                    style={{
                      background:
                        "linear-gradient(135deg,#d946ef 0%,#ec4899 55%,#a855f7 100%)",
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] -mb-[3px] relative z-[1]" fill="none">
                      <circle cx="12" cy="9" r="3.4" fill="rgba(255,255,255,0.95)" />
                      <path d="M5 21c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" fill="rgba(255,255,255,0.95)" />
                    </svg>
                  </span>
                  {mockMode && (
                    <span className="text-[9px] bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-300 px-1.5 py-0.5 rounded-full font-mono font-bold">
                      {balance}
                    </span>
                  )}
                  <span className="font-mono">{short}</span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="opacity-40"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => nav("/login?next=/arena")}
                  disabled={connecting}
                  className="text-xs px-4 py-1.5 rounded-lg font-semibold bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition disabled:opacity-60"
                >
                  {connecting ? t("nav.connecting") : t("nav.getStarted")}
                </button>
              )}
              <WalletMenu />
            </div>
          </div>
        </div>
      </header>

      <section className="relative z-10 pt-10 pb-12 lg:pt-14 lg:pb-16">
        <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-[1.02fr_0.98fr] gap-10 lg:gap-12 items-start">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5 mb-6 animate-slideUp whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-white/55 text-[10px] font-semibold tracking-[0.18em] uppercase">
                {t("landing.badge.live")}
              </span>
              <span className="text-white/20 text-[10px]">·</span>
              <span
                className="text-[10px] font-semibold tracking-[0.18em] uppercase"
                style={{
                  background: "linear-gradient(90deg,#ec4899,#a855f7)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {t("landing.badge.tag")}
              </span>
            </div>

            <h1 className="neon-title text-gradient-fuchsia text-2xl sm:text-3xl lg:text-[2.5rem] mb-5 animate-slideUp max-w-3xl uppercase" style={{lineHeight:1.4}}>
              {t("landing.hero.line1")}
              <br />
              {t("landing.hero.line2")}
              <br />
              {t("landing.hero.line3")}
            </h1>

            <p className="text-white/70 text-base sm:text-lg max-w-xl mb-8 animate-slideUp delay-100 leading-relaxed">
              {t("landing.hero.desc")}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 animate-slideUp delay-200">
              <button
                onClick={handleEnter}
                className="btn-primary text-base sm:text-lg px-8 py-4 rounded-2xl relative overflow-hidden group cta-glow"
              >
                <span className="relative z-10 flex items-center justify-center">{t("landing.cta.primary")}</span>
              </button>
              <button
                onClick={() => nav("/how-to-play")}
                className="hero-secondary-cta px-6 py-4 rounded-2xl border border-white/[0.08] bg-transparent text-white/58 font-semibold hover:text-white/78 transition-all duration-300"
              >
                {t("landing.cta.secondary")}
              </button>
            </div>

            <div className="landing-proof-row animate-slideUp delay-300">
              {HERO_FACT_INDEXES.map((index) => (
                <div key={index} className="landing-proof-inline">
                  <span>{t(`landing.fact.${index}`)}</span>
                  {index < HERO_FACT_INDEXES.length - 1 ? <span className="landing-proof-separator">/</span> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="animate-slideUp delay-100 relative flex items-center justify-center">
            <div className="landing-stage-glow" />
            <HeroTrophy />
          </div>
        </div>
      </section>

      <div
        className="relative z-10 py-6 border-y border-white/[0.06]"
        style={{
          background:
            "linear-gradient(90deg, rgba(245,158,11,0.03), rgba(139,92,246,0.03), rgba(6,182,212,0.03))",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          {STRIP_INDEXES.map((i) => (
            <div key={i} className="flex items-center gap-2 justify-center md:justify-start">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300/70 flex-shrink-0" />
              <span className="text-white/45 text-xs font-medium">{t(`landing.strip.${i}`)}</span>
            </div>
          ))}
        </div>
      </div>

      <section className="relative z-10 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="landing-kicker">{t("landing.modes.kicker")}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3">
              {t("landing.modes.title")}
            </h2>
            <p className="text-white/45 text-sm sm:text-base mt-4 max-w-2xl mx-auto leading-relaxed">
              {t("landing.modes.desc")}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {MODE_INDEXES.map((i) => (
              <div key={i} className="landing-mode-card">
                <p className="landing-stage-label mb-3">{t(`landing.modes.${i}.eyebrow`)}</p>
                <h3 className="text-xl font-black text-white tracking-tight leading-tight mb-3">
                  {t(`landing.modes.${i}.title`)}
                </h3>
                <p className="text-sm text-white/55 leading-relaxed mb-5">{t(`landing.modes.${i}.desc`)}</p>
                <div className="pt-4 border-t border-white/[0.08] text-xs text-white/42 leading-relaxed">
                  {t(`landing.modes.${i}.detail`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="landing-kicker">{t("landing.round.kicker")}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3">
              {t("landing.round.title")}
            </h2>
            <p className="text-white/45 text-sm sm:text-base mt-4 max-w-2xl mx-auto leading-relaxed">
              {t("landing.round.desc")}
            </p>
          </div>

          {/* Legacy horizontal 3-card layout — hidden while new timeline is validated */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4" style={{display:"none"}}>
            {ROUND_INDEXES.map((i) => {
              const stepLabel = String(i + 1).padStart(2, "0");
              return (
                <div key={i} className="landing-chevron-wrap">
                  <div className="landing-chevron-tab landing-chevron-tab-stack">
                    <span className="tab-row tab-row-top">
                      <span className="tab-dot" />
                      <span>{t("landing.round.step")} {stepLabel}</span>
                    </span>
                    <span className="tab-title">{t(`landing.round.${i}.title`)}</span>
                  </div>
                  <div className="landing-step-card">
                    <p className="text-sm text-white/60 leading-relaxed">{t(`landing.round.${i}.desc`)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* New vertical zigzag timeline (hackathon poster style) */}
          <div className="landing-timeline">
            <span className="landing-timeline-rail" aria-hidden />
            {ROUND_INDEXES.map((i) => {
              const stepLabel = String(i + 1).padStart(2, "0");
              const side = i % 2 === 0 ? "left" : "right";
              return (
                <div key={i} className={`landing-timeline-row landing-timeline-row-${side}`}>
                  <div className="landing-timeline-content">
                    <div className="landing-timeline-step">{t("landing.round.step")} {stepLabel}</div>
                    <h3 className="landing-timeline-title">{t(`landing.round.${i}.title`)}</h3>
                    <p className="landing-timeline-desc">{t(`landing.round.${i}.desc`)}</p>
                  </div>
                  <span className="landing-timeline-node" aria-hidden />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
              <span className="landing-kicker">{t("landing.edge.kicker")}</span>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3">
                {t("landing.edge.title")}
              </h2>
            <p className="text-white/45 text-sm sm:text-base mt-4 max-w-2xl mx-auto leading-relaxed">
              {t("landing.edge.desc")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ADV_INDEXES.map((i) => {
              const Icon = ADV_ICONS[i];
              return (
              <div key={i} className="landing-advantage-card">
                <div className="w-10 h-10 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-200 mb-4">
                  <Icon size={20} />
                </div>
                <h3 className="text-base font-bold text-white/90 mb-2 tracking-tight">{t(`landing.adv.${i}.title`)}</h3>
                <p className="text-white/48 text-sm leading-relaxed">{t(`landing.adv.${i}.desc`)}</p>
              </div>
            );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="landing-kicker">{t("landing.faq.kicker")}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3">
              {t("landing.faq.title")}
            </h2>
            <p className="text-white/40 text-sm sm:text-base mt-4 leading-relaxed">
              {t("landing.faq.desc")}
            </p>
          </div>

          <div className="space-y-3">
            {FAQ_INDEXES.map((i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} className={`landing-faq-card ${isOpen ? "is-open" : ""}`}>
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
                  >
                    <span className={`text-sm sm:text-base font-semibold transition-colors ${isOpen ? "text-white/90" : "text-white/65"}`}>
                      {t(`landing.faq.${i}.q`)}
                    </span>
                    <span className={`text-white/30 text-lg transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}>
                      +
                    </span>
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-72 opacity-100" : "max-h-0 opacity-0"}`}>
                    <p className="px-5 pb-5 text-white/48 text-sm leading-relaxed">{t(`landing.faq.${i}.a`)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="landing-kicker">{t("landing.final.kicker")}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3 leading-tight">
              {t("landing.final.title")}
            </h2>
            <p className="text-white/45 text-sm sm:text-base mt-4 max-w-2xl mx-auto leading-relaxed">
              {t("landing.final.desc")}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={handleEnter} className="btn-primary text-base px-8 py-4 rounded-2xl">
              {t("landing.final.launch")}
            </button>
            <button
              onClick={() => nav("/how-to-play")}
              className="px-7 py-4 rounded-2xl border border-white/[0.1] bg-white/[0.03] text-white/75 font-semibold hover:bg-white/[0.05] hover:text-white transition-all duration-300"
            >
              {t("landing.final.review")}
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
