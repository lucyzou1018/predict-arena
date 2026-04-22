import { useNavigate } from "react-router-dom";
import { useT } from "../context/LangContext";

const SECTION_TITLE = "text-2xl sm:text-[2rem] font-black tracking-tight text-white";
const SECTION_DESC = "mt-2 text-sm sm:text-base text-white/60 leading-7 max-w-2xl";
const SECTION_WRAP = "border-t border-white/[0.08] pt-8 sm:pt-10";
const BASE_CARD = "landing-step-card h-full";
const ACCENT_CARD = "landing-mode-card h-full";
const PANEL_CARD = "landing-story-card";
const SUB_CARD = "landing-faq-card px-4 py-4";

function StepIcon({ kind }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    className: "w-6 h-6",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  switch (kind) {
    case "wallet":
      return (
        <svg {...common}>
          <path d="M5.5 8.5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
          <path d="M7.5 8.5V7.5a2 2 0 0 1 2-2h7" />
          <circle cx="15.5" cy="13.5" r="0.75" fill="currentColor" stroke="none" />
        </svg>
      );
    case "grid":
      return (
        <svg {...common}>
          <rect x="4.5" y="4.5" width="6" height="6" rx="1.5" />
          <rect x="13.5" y="4.5" width="6" height="6" rx="1.5" />
          <rect x="4.5" y="13.5" width="6" height="6" rx="1.5" />
          <rect x="13.5" y="13.5" width="6" height="6" rx="1.5" />
        </svg>
      );
    case "coins":
      return (
        <svg {...common}>
          <ellipse cx="10" cy="8" rx="4" ry="2.25" />
          <path d="M6 8v4c0 1.25 1.8 2.25 4 2.25s4-1 4-2.25V8" />
          <ellipse cx="14" cy="15" rx="4" ry="2.25" />
          <path d="M10 15v2.5C10 18.75 11.8 20 14 20s4-1.25 4-2.5V15" />
        </svg>
      );
    case "trend":
      return (
        <svg {...common}>
          <path d="M4.5 18.5h15" />
          <path d="M4.5 18.5v-13" />
          <path d="M7 15l4-4 3 2.5 4-6.5" />
          <path d="M15.5 7h2.5v2.5" />
        </svg>
      );
    case "timer":
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="6.5" />
          <path d="M12 13V9.5" />
          <path d="M12 13l3 1.5" />
          <path d="M9.5 3.5h5" />
          <path d="M10.5 6.5V4" />
          <path d="M13.5 6.5V4" />
        </svg>
      );
    case "claim":
      return (
        <svg {...common}>
          <path d="M5.5 10h10a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2Z" />
          <path d="M7.5 10V8.5a2 2 0 0 1 2-2h6" />
          <path d="M12 4.5v7" />
          <path d="m9.5 9 2.5 2.5L14.5 9" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13.5 3.5 6.5 13h4l-1 7.5 7-9h-4l1-8Z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3.5 18 6v5.5c0 4.2-2.4 7.1-6 9-3.6-1.9-6-4.8-6-9V6l6-2.5Z" />
          <path d="m9.5 12 1.7 1.7 3.3-4" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="6" y="10" width="12" height="9" rx="2" />
          <path d="M8.5 10V7.8C8.5 5.7 10.07 4 12 4s3.5 1.7 3.5 3.8V10" />
          <circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M6 5.5h9a3 3 0 0 1 3 3v9.5H9a3 3 0 0 0-3 3V5.5Z" />
          <path d="M6 5.5v12.5c0 1.66 1.34 3 3 3" />
          <path d="M10 9h5" />
          <path d="M10 12.5h5" />
        </svg>
      );
    default:
      return null;
  }
}

export default function HowToPlay() {
  const nav = useNavigate();
  const t = useT();

  const timeline = [0, 1, 2, 3, 4];
  const steps = [
    { i: 0, icon: "wallet" },
    { i: 1, icon: "grid" },
    { i: 2, icon: "coins" },
    { i: 3, icon: "trend" },
    { i: 4, icon: "timer" },
    { i: 5, icon: "claim" },
  ];
  const modes = [
    { key: "quick", icon: "bolt" },
    { key: "arena", icon: "shield" },
  ];
  const examples = [0, 1, 2];
  const controls = [0, 1, 2, 3];
  const rules = [0, 1, 2, 3, 4];
  const handbook = [
    { title: t("howto.timeline.title"), desc: t("howto.timeline.desc") },
    { title: t("howto.stepsTitle"), desc: t("howto.stepsDesc") },
    { title: t("howto.payoutTitle"), desc: t("howto.payoutDesc") },
    { title: t("howto.trustTitle"), desc: t("howto.trustDesc") },
  ];
  const controlLabels = ["01", "02", "03", "04"];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <section className="mb-10 sm:mb-12">
        <div className="space-y-5 sm:space-y-6">
          <div className="inline-flex items-center gap-1.5 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
            <span className="text-fuchsia-200/80 text-[10px] font-bold tracking-[0.22em] uppercase">
              {t("howto.kicker")}
            </span>
          </div>

          <div className="max-w-3xl">
            <h1 className="neon-title text-[1.75rem] sm:text-[2.15rem] lg:text-[2.7rem] leading-[1.24] uppercase max-w-[12ch] mb-4">
              {t("howto.title")}
            </h1>
            <p className="text-white/68 text-base sm:text-lg leading-7 sm:leading-8 max-w-2xl">
              {t("howto.subtitleDetail")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {["stake", "round", "onchain"].map((k) => (
              <div key={k} className={`${SUB_CARD} text-left`}>
                <p className="text-[10px] text-white/45 uppercase tracking-[0.18em] mb-2">Spec</p>
                <p className="text-sm sm:text-[15px] font-bold text-white/85 leading-6">
                  {t(`howto.meta.${k}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] mb-10 sm:mb-12">
        <div className={`${PANEL_CARD} !p-5`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-fuchsia-500/20 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-200/85 shrink-0">
              <StepIcon kind="book" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-white">{t("howto.kicker")}</h2>
              <p className="text-[13px] text-white/45 leading-6">{t("howto.subtitle")}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {handbook.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
                <div className="text-[15px] font-bold text-white mb-1.5">{item.title}</div>
                <p className="text-[13px] leading-6 text-white/52">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={`${PANEL_CARD} !p-5 flex flex-col`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white">{t("howto.rules")}</h2>
              <p className="text-[13px] text-white/45 leading-6 mt-1">
                {t("howto.stepsDesc")}
              </p>
            </div>
          </div>
          <div className="grid gap-2.5">
            {rules.map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/72 leading-6"
              >
                {t(`howto.rule.${i}`)}
              </div>
            ))}
          </div>
          <div className="pt-5 mt-5 border-t border-white/[0.06]">
            <button onClick={() => nav("/arena")} className="btn-primary w-full !py-3 !text-sm">
              {t("howto.cta.primary")}
            </button>
          </div>
        </div>
      </section>

      <section className={`${SECTION_WRAP} mb-10`}>
        <div className="mb-6">
          <h2 className={SECTION_TITLE}>{t("howto.timeline.title")}</h2>
          <p className={SECTION_DESC}>{t("howto.timeline.desc")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {timeline.map((i) => (
            <div key={i} className={`${BASE_CARD} flex flex-col gap-3`}>
              <div className="flex items-center justify-between gap-3">
                <div className="w-9 h-9 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/20 flex items-center justify-center text-[10px] font-mono text-fuchsia-200/80 shrink-0">
                  0{i + 1}
                </div>
                <div className="px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[10px] font-semibold text-white/55">
                  {t(`howto.timeline.${i}.time`)}
                </div>
              </div>
              <div className="text-[15px] font-bold text-white">{t(`howto.timeline.${i}.label`)}</div>
              <div className="text-[13px] text-white/58 leading-6">{t(`howto.timeline.${i}.desc`)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${SECTION_WRAP} mb-10`}>
        <div className="mb-6">
          <h2 className={SECTION_TITLE}>{t("howto.stepsTitle")}</h2>
          <p className={SECTION_DESC}>{t("howto.stepsDesc")}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {steps.map((s, idx) => (
            <div
              key={s.i}
              className={`${BASE_CARD} flex gap-3.5 animate-slideUp`}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <div className="w-11 h-11 rounded-xl bg-fuchsia-500/20 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-200/85 shrink-0">
                <StepIcon kind={s.icon} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-mono text-fuchsia-300/70">0{idx + 1}</span>
                  <h3 className="text-[15px] font-bold text-white">{t(`howto.step.${s.i}.title`)}</h3>
                </div>
                <p className="text-white/58 text-[13px] leading-6 mb-3">{t(`howto.step.${s.i}.desc`)}</p>
                <span className="inline-block text-[11px] text-fuchsia-200/85 font-semibold px-2.5 py-1 rounded-full border border-fuchsia-400/20 bg-fuchsia-400/[0.06]">
                  {t(`howto.step.${s.i}.highlight`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${SECTION_WRAP} mb-10`}>
        <div className="mb-6">
          <h2 className={SECTION_TITLE}>{t("howto.modesTitle")}</h2>
          <p className={SECTION_DESC}>{t("howto.modesDesc")}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modes.map((m) => (
            <div key={m.key} className={ACCENT_CARD}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-fuchsia-500/20 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-200/85 shrink-0">
                  <StepIcon kind={m.icon} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{t(`howto.modes.${m.key}.name`)}</h3>
                  <p className="text-[13px] text-white/45 leading-6">{t(`howto.modes.${m.key}.desc`)}</p>
                </div>
              </div>
              <ul className="space-y-2.5">
                {[0, 1, 2].map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[13px] text-white/68 leading-6">
                    <span className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-fuchsia-300 shrink-0 mt-0.5">
                      •
                    </span>
                    <span>{t(`howto.modes.${m.key}.point${p}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className={`${SECTION_WRAP} mb-10`}>
        <div>
          <div className="mb-6">
            <h2 className={SECTION_TITLE}>{t("howto.payoutTitle")}</h2>
            <p className={SECTION_DESC}>{t("howto.payoutDesc")}</p>
          </div>

          <div className={`${PANEL_CARD} !p-5 sm:!p-6 max-w-4xl mb-6`}>
            <div className="font-mono text-[15px] sm:text-lg leading-8 text-white/92 break-words">
              {t("howto.payoutFormula")}
            </div>
            <p className="mt-4 text-[13px] text-white/48 leading-6 max-w-3xl">
              {t("howto.payoutLegend")}
            </p>
          </div>

          <div className="text-[11px] font-semibold text-white/45 uppercase tracking-[0.22em] mb-3">
            {t("howto.payoutExamplesTitle") || t("howto.examples")}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {examples.map((i) => (
              <div key={i} className={`${BASE_CARD} !p-4`}>
                <div className="text-[14px] font-bold text-white mb-1.5 leading-snug">{t(`howto.example.${i}.title`)}</div>
                <div className="text-[12px] text-white/50 leading-5 mb-2">{t(`howto.example.${i}.players`)}</div>
                <div className="text-[13px] text-fuchsia-200/82 font-semibold leading-5">
                  {t(`howto.example.${i}.result`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${SECTION_WRAP} mb-10`}>
        <div className="mb-6">
          <h2 className={SECTION_TITLE}>{t("howto.trustTitle")}</h2>
          <p className={SECTION_DESC}>{t("howto.trustDesc")}</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] items-start">
          <div className={`${PANEL_CARD} !p-6`}>
            <div className="flex items-start gap-4 mb-5">
              <div className="w-14 h-14 rounded-[22px] bg-gradient-to-br from-fuchsia-400/25 to-violet-400/15 border border-fuchsia-400/20 flex items-center justify-center text-fuchsia-200/85 shrink-0">
                <StepIcon kind="lock" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.22em] mb-1">
                  {t("howto.trust.oracle.roadmapLabel")}
                </div>
                <div className="text-xl font-bold text-white">{t("howto.trust.oracle.label")}</div>
              </div>
            </div>

            <p className="text-[14px] text-white/68 leading-7 mb-5">{t("howto.trust.oracle.body")}</p>
            <div className="pt-4 border-t border-white/[0.06]">
              <p className="text-[13px] text-white/48 leading-6">{t("howto.trust.oracle.roadmap")}</p>
            </div>
          </div>

          <div className={`${PANEL_CARD} !p-0 overflow-hidden`}>
            <div className="px-6 pt-5 pb-4">
              <div className="text-[11px] font-semibold text-white/45 uppercase tracking-[0.22em] mb-2">
                {t("howto.trust.controlTitle")}
              </div>
            </div>
            <div className="px-6 pb-5 space-y-3">
              {controls.map((i, idx) => (
                <div
                  key={i}
                  className="grid gap-3 md:grid-cols-[48px_minmax(0,1fr)] items-start rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-4"
                >
                  <div className="w-10 h-10 rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/[0.07] flex items-center justify-center font-mono text-[11px] text-fuchsia-200/80">
                    {controlLabels[idx]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-white mb-1.5 leading-tight">{t(`howto.trust.control.${i}.title`)}</div>
                    <p className="text-[13px] text-white/54 leading-6">{t(`howto.trust.control.${i}.desc`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
