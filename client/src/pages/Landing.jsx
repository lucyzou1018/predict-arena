import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  const loc = useLocation();
  const t = useT();
  const { wallet, connecting, mockMode, balance, showWalletMenu, setShowWalletMenu } = useWallet();
  const short = wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "";
  const [openFaq, setOpenFaq] = useState(0);
  const navBtnBase = "text-xs px-2.5 sm:px-4 py-1.5 min-h-8 rounded-xl transition font-semibold whitespace-nowrap";
  const navBtnIdle = "text-white/58 hover:text-white/88 hover:bg-white/[0.04] border border-transparent hover:border-white/8";
  const navBtnActive = "text-white font-bold";
  const navLabelActive = "nav-active-label";

  const handleEnter = () => {
    if (wallet) nav("/dashboard");
    else nav("/login?next=/dashboard");
  };

  const goDashboard = () => {
    if (wallet) nav("/dashboard");
    else nav("/login?next=/dashboard");
  };

  const goLeaderboard = () => nav("/leaderboard");
  const goFaq = () => nav({ pathname: "/", hash: "#faq" });
  const faqActive = loc.pathname === "/" && loc.hash === "#faq";

  useEffect(() => {
    if (loc.pathname !== "/" || loc.hash !== "#faq") return;
    const scrollToFaq = () => {
      const faqSection = document.getElementById("faq");
      if (!faqSection) return;
      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height || 0;
      const targetTop = faqSection.getBoundingClientRect().top + window.scrollY - headerHeight - 24;
      window.scrollTo({ top: Math.max(targetTop, 0), behavior: "smooth" });
    };
    const timer = window.setTimeout(scrollToFaq, 60);
    return () => window.clearTimeout(timer);
  }, [loc.hash, loc.pathname]);

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
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
            background: "radial-gradient(circle, rgba(53,28,92,0.18), transparent 72%)",
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
            background: "radial-gradient(circle, rgba(82,22,74,0.16), transparent 72%)",
            animationDuration: "14s",
            animationDelay: "-6s",
          }}
        />
      </div>
      <div className="landing-bottom-quiet-zone" aria-hidden="true" />

      <header
        className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(11,10,23,0.9),rgba(8,8,18,0.78))] backdrop-blur-2xl"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <button onClick={() => nav("/")} className="hover:opacity-80 transition text-white shrink-0">
              <Logo className="h-4 sm:h-6 w-auto" active={loc.pathname === "/"} />
            </button>
            <button
              onClick={() => nav("/how-to-play")}
              className={`hidden md:inline-flex ${navBtnBase} ${loc.pathname === "/how-to-play" ? navBtnActive : navBtnIdle} shrink-0`}
            >
              <span className={loc.pathname === "/how-to-play" ? navLabelActive : ""}>{t("nav.howToPlay")}</span>
            </button>
            <button
              onClick={goFaq}
              className={`hidden md:inline-flex ${navBtnBase} ${faqActive ? navBtnActive : navBtnIdle} shrink-0`}
            >
              <span className={faqActive ? navLabelActive : ""}>{t("nav.faq")}</span>
            </button>
            <button
              onClick={goDashboard}
              className={`hidden md:inline-flex ${navBtnBase} ${loc.pathname === "/dashboard" ? navBtnActive : navBtnIdle} shrink-0`}
            >
              <span className={loc.pathname === "/dashboard" ? navLabelActive : ""}>{t("nav.dashboard")}</span>
            </button>
            <button
              onClick={goLeaderboard}
              className={`hidden md:inline-flex ${navBtnBase} ${loc.pathname === "/leaderboard" ? navBtnActive : navBtnIdle} shrink-0`}
            >
              <span className={loc.pathname === "/leaderboard" ? navLabelActive : ""}>{t("nav.leaderboard")}</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <NavActions />
            <div className="relative">
              {wallet ? (
                <button
                  onClick={() => setShowWalletMenu(!showWalletMenu)}
                  className="dashboard-secondary-btn group text-xs pl-1.5 pr-3.5 py-1 transition font-semibold flex items-center gap-2 !rounded-[18px]"
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
                  onClick={() => nav("/login?next=/dashboard")}
                  disabled={connecting}
                  className="dashboard-primary-btn text-xs px-4 py-1.5 font-semibold disabled:opacity-60"
                >
                  {connecting ? t("nav.connecting") : t("nav.getStarted")}
                </button>
              )}
              <WalletMenu />
            </div>
          </div>
        </div>
      </header>

      <div
        aria-hidden="true"
        className="shrink-0"
        style={{ height: "calc(56px + var(--safe-top))" }}
      />

      <section className="relative z-10 pt-10 pb-12 lg:pt-14 lg:pb-16">
        <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-[1.02fr_0.98fr] gap-10 lg:gap-12 items-start">
          <div className="text-left">
            <div className="dashboard-kicker mb-6 animate-slideUp whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-[10px] font-semibold tracking-[0.18em] uppercase">
                {t("landing.badge.live")}
              </span>
              <span
                className="text-[10px] font-semibold tracking-[0.18em] uppercase"
                style={{
                  background: "linear-gradient(90deg,#f9a8d4,#c084fc)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {t("landing.badge.tag")}
              </span>
            </div>

            <h1 className="dashboard-title text-[2rem] sm:text-[2.6rem] lg:text-[3.2rem] mb-5 animate-slideUp max-w-4xl leading-[1.06]">
              {t("landing.hero.line1")}{" "}
              <span className="dashboard-title-highlight">{t("landing.hero.line2")}</span>{" "}
              {t("landing.hero.line3")}
            </h1>

            <p className="text-white/70 text-base sm:text-lg max-w-xl mb-8 animate-slideUp delay-100 leading-relaxed">
              {t("landing.hero.desc")}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 animate-slideUp delay-200">
              <button
                onClick={handleEnter}
                className="dashboard-primary-btn text-base sm:text-lg px-8 py-4 rounded-[22px] relative overflow-hidden group"
              >
                <span className="relative z-10 flex items-center justify-center">{t("landing.cta.primary")}</span>
              </button>
              <button
                onClick={() => nav("/how-to-play")}
                className="dashboard-secondary-btn px-6 py-4 rounded-[22px] font-semibold transition-all duration-300"
              >
                {t("landing.cta.secondary")}
              </button>
            </div>

            <div className="landing-proof-row animate-slideUp delay-300">
              {HERO_FACT_INDEXES.map((index) => (
                <div key={index} className="dashboard-room-chip landing-proof-inline px-3 py-1.5">
                  <span>{t(`landing.fact.${index}`)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-slideUp delay-100 relative flex items-center justify-center lg:px-4">
            <div className="landing-stage-glow" />
            <HeroTrophy />
          </div>
        </div>
      </section>

      <div
        className="relative z-10 py-6 border-y border-white/[0.06]"
        style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.01), rgba(236,72,153,0.04), rgba(255,255,255,0.01))" }}
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

      <section className="relative z-10 pt-12 pb-8 sm:pt-14 sm:pb-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10 sm:mb-12">
            <span className="dashboard-kicker">{t("landing.modes.kicker")}</span>
            <h2 className="dashboard-title text-3xl sm:text-4xl mt-2.5">
              {t("landing.modes.title")}
            </h2>
            <p className="text-white/45 text-sm sm:text-base mt-3 max-w-2xl mx-auto leading-relaxed">
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

      <section className="relative z-10 py-12 sm:py-14">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-9 sm:mb-10">
            <span className="dashboard-kicker">{t("landing.round.kicker")}</span>
            <h2 className="dashboard-title text-3xl sm:text-4xl mt-2.5">
              {t("landing.round.title")}
            </h2>
            <p className="text-white/45 text-sm sm:text-base mt-3 max-w-2xl mx-auto leading-relaxed">
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

      <section className="relative z-10 pt-8 pb-14 sm:pt-10 sm:pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10 sm:mb-12">
              <span className="dashboard-kicker">{t("landing.edge.kicker")}</span>
              <h2 className="dashboard-title text-3xl sm:text-4xl mt-2.5">
                {t("landing.edge.title")}
              </h2>
            <p className="text-white/45 text-sm sm:text-base mt-3 max-w-2xl mx-auto leading-relaxed">
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

      <section className="relative z-10 pt-8 pb-14 sm:pt-10 sm:pb-16">
        <div className="max-w-3xl mx-auto px-6">
          <div id="faq" className="text-center mb-8 sm:mb-9 scroll-mt-28">
            <span className="dashboard-kicker">{t("landing.faq.kicker")}</span>
            <h2 className="dashboard-title text-3xl sm:text-4xl mt-2.5">
              {t("landing.faq.title")}
            </h2>
            <p className="text-white/40 text-sm sm:text-base mt-3 leading-relaxed">
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
          <div className="text-center mb-10 sm:mb-12">
            <span className="dashboard-kicker">{t("landing.final.kicker")}</span>
            <h2 className="dashboard-title text-3xl sm:text-4xl mt-2.5 leading-tight">
              {t("landing.final.title")}
            </h2>
            <p className="text-white/45 text-sm sm:text-base mt-3 max-w-2xl mx-auto leading-relaxed">
              {t("landing.final.desc")}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={handleEnter} className="dashboard-primary-btn text-base px-8 py-4 rounded-[22px]">
              {t("landing.final.launch")}
            </button>
            <button
              onClick={() => nav("/how-to-play")}
              className="dashboard-secondary-btn px-7 py-4 rounded-[22px] font-semibold transition-all duration-300"
            >
              {t("landing.final.review")}
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
