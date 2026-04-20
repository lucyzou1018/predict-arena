import { useNavigate } from "react-router-dom";
import { useT } from "../context/LangContext";

export default function HowToPlay() {
  const nav = useNavigate();
  const t = useT();

  const timeline = [0, 1, 2, 3, 4];
  const steps = [
    { i: 0, icon: "🔗" },
    { i: 1, icon: "⚔️" },
    { i: 2, icon: "💰" },
    { i: 3, icon: "📈" },
    { i: 4, icon: "⏱️" },
    { i: 5, icon: "🏆" },
  ];
  const modes = [
    { key: "quick", icon: "⚡", tone: "from-violet-500/20 to-indigo-500/10" },
    { key: "arena", icon: "🛡️", tone: "from-sky-500/20 to-emerald-500/10" },
  ];
  const examples = [0, 1, 2];
  const controls = [0, 1, 2, 3];

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
      {/* ===== Hero ===== */}
      <section className="text-center mb-14">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-4 rounded-full border border-white/10 bg-white/[0.04]">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-[10px] text-white/55 font-semibold tracking-[0.22em] uppercase">
            {t("howto.kicker")}
          </span>
        </div>
        <h1 className="text-[32px] sm:text-[40px] font-black tracking-tight leading-[1.05] mb-3">
          {t("howto.title")}
        </h1>
        <p className="text-white/55 text-sm sm:text-[15px] max-w-xl mx-auto leading-relaxed">
          {t("howto.subtitleDetail")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["stake", "round", "onchain"].map((k) => (
            <span
              key={k}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-white/70 border border-white/10 bg-white/[0.03]"
            >
              {t(`howto.meta.${k}`)}
            </span>
          ))}
        </div>
      </section>

      {/* ===== Timeline ===== */}
      <section className="mb-14">
        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-1.5">
            {t("howto.timeline.title")}
          </h2>
          <p className="text-white/45 text-xs sm:text-sm">{t("howto.timeline.desc")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
          {timeline.map((i) => (
            <div
              key={i}
              className="relative rounded-xl p-3.5 border border-white/[0.07] bg-white/[0.015]"
            >
              <div className="text-[9px] font-mono text-violet-300/70 mb-1">
                0{i + 1}
              </div>
              <div className="text-[13px] font-bold mb-0.5">
                {t(`howto.timeline.${i}.label`)}
              </div>
              <div className="text-[10px] text-violet-200/60 font-semibold mb-1.5">
                {t(`howto.timeline.${i}.time`)}
              </div>
              <div className="text-[11px] text-white/45 leading-relaxed">
                {t(`howto.timeline.${i}.desc`)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Six Steps ===== */}
      <section className="mb-14">
        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            {t("howto.stepsTitle")}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {steps.map((s, idx) => (
            <div
              key={s.i}
              className="card flex gap-3 animate-slideUp"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <div className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-lg shrink-0">
                {s.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono text-violet-300/70">
                    0{idx + 1}
                  </span>
                  <h3 className="text-sm font-bold">{t(`howto.step.${s.i}.title`)}</h3>
                </div>
                <p className="text-white/50 text-[11.5px] leading-relaxed mb-2">
                  {t(`howto.step.${s.i}.desc`)}
                </p>
                <span className="inline-block text-[10px] text-violet-200/80 font-semibold px-2 py-0.5 rounded-full border border-violet-400/20 bg-violet-400/[0.06]">
                  {t(`howto.step.${s.i}.highlight`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Match Modes ===== */}
      <section className="mb-14">
        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-1.5">
            {t("howto.modesTitle")}
          </h2>
          <p className="text-white/45 text-xs sm:text-sm">{t("howto.modesDesc")}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {modes.map((m) => (
            <div
              key={m.key}
              className={`relative rounded-2xl p-5 border border-white/[0.08] bg-gradient-to-br ${m.tone}`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-lg">{m.icon}</span>
                <h3 className="text-base font-black">
                  {t(`howto.modes.${m.key}.name`)}
                </h3>
              </div>
              <p className="text-white/55 text-xs leading-relaxed mb-3">
                {t(`howto.modes.${m.key}.desc`)}
              </p>
              <ul className="space-y-1.5">
                {[0, 1, 2].map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[11.5px] text-white/65">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgb(170,155,255)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{t(`howto.modes.${m.key}.point${p}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Payout ===== */}
      <section className="mb-14">
        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-1.5">
            {t("howto.payoutTitle")}
          </h2>
          <p className="text-white/45 text-xs sm:text-sm max-w-xl mx-auto">
            {t("howto.payoutDesc")}
          </p>
        </div>
        <div className="card !p-5 mb-3">
          <div
            className="font-mono text-[13px] sm:text-sm text-center px-4 py-3 rounded-lg border border-violet-400/15 bg-violet-400/[0.04] mb-3"
            style={{ letterSpacing: "0.01em" }}
          >
            {t("howto.payoutFormula")}
          </div>
          <p className="text-[11px] text-white/45 text-center leading-relaxed">
            {t("howto.payoutLegend")}
          </p>
        </div>
        <div className="text-[11px] font-semibold text-white/50 uppercase tracking-widest mb-2 px-1">
          {t("howto.payoutExamplesTitle") || t("howto.examples")}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {examples.map((i) => (
            <div key={i} className="card !p-3.5">
              <div className="text-xs font-bold mb-1.5">
                {t(`howto.example.${i}.title`)}
              </div>
              <div className="text-[10.5px] text-white/45 mb-1">
                {t(`howto.example.${i}.players`)}
              </div>
              <div className="text-[10.5px] text-violet-200/85 font-semibold">
                {t(`howto.example.${i}.result`)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Trust ===== */}
      <section className="mb-14">
        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-1.5">
            {t("howto.trustTitle")}
          </h2>
          <p className="text-white/45 text-xs sm:text-sm">{t("howto.trustDesc")}</p>
        </div>
        <div className="card !p-5 mb-3">
          <div className="text-[11px] font-semibold text-white/55 uppercase tracking-wider mb-1.5">
            {t("howto.trust.oracle.label")}
          </div>
          <p className="text-[12px] text-white/60 leading-relaxed mb-3">
            {t("howto.trust.oracle.body")}
          </p>
          <div className="pt-3 border-t border-white/[0.06]">
            <div className="text-[11px] font-semibold text-white/45 uppercase tracking-wider mb-1">
              {t("howto.trust.oracle.roadmapLabel")}
            </div>
            <p className="text-[11.5px] text-white/50 leading-relaxed">
              {t("howto.trust.oracle.roadmap")}
            </p>
          </div>
        </div>
        <div className="text-[11px] font-semibold text-white/50 uppercase tracking-widest mb-2 px-1">
          {t("howto.trust.controlTitle")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {controls.map((i) => (
            <div key={i} className="card !p-3.5">
              <div className="text-xs font-bold mb-1">
                {t(`howto.trust.control.${i}.title`)}
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                {t(`howto.trust.control.${i}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Ready CTA ===== */}
      <section>
        <div className="card !p-6 text-center glow-orange">
          <h3 className="font-black text-base sm:text-lg mb-1.5">
            {t("howto.readyTitle")}
          </h3>
          <p className="text-white/50 text-xs mb-4 max-w-md mx-auto leading-relaxed">
            {t("howto.readyDesc")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              onClick={() => nav("/arena")}
              className="btn-primary !py-2 !px-6 !text-sm"
            >
              {t("howto.cta.primary")}
            </button>
            <button
              onClick={() => nav("/")}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white/70 border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:text-white transition"
            >
              {t("howto.cta.secondary")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
