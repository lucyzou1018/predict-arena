import { useState, useEffect } from "react";
import { useBtcPrice } from "../hooks/useBtcPrice";

const STEPS = [
  { id: "match", title: "JOIN", desc: "5 players enter the arena" },
  { id: "predict", title: "PREDICT", desc: "Each player picks Long or Short" },
  { id: "countdown", title: "SETTLE", desc: "30s countdown — BTC moves live" },
  { id: "result", title: "RESULT", desc: "Winners split the pool instantly" },
];

const PLAYERS = [
  { name: "0x7a3f...c2d1", avatar: "A1" },
  { name: "0x4b2e...91fa", avatar: "B2" },
  { name: "0xd81c...37e0", avatar: "C3" },
  { name: "0x92af...bb14", avatar: "D4" },
  { name: "0x1fe6...a5c8", avatar: "E5" },
];

// Result: BTC goes up → 1 LONG wins, 4 SHORT lose
const CHOICES = ["long", "short", "short", "short", "short"];
const WINNERS = [true, false, false, false, false];
const WIN_AMOUNT = "+4.75";
const LOSE_AMOUNT = "-1.00";

export default function BattlePreview() {
  const realPrice = useBtcPrice();
  const [step, setStep] = useState(0);
  const [priceJitter, setPriceJitter] = useState(0);
  const [joinedCount, setJoinedCount] = useState(0);

  const basePrice = realPrice > 0 ? realPrice : 68000;
  const endDelta = basePrice * 0.0012;
  const current = STEPS[step];

  // Simulate players joining in match phase
  useEffect(() => {
    if (current.id !== "match") { setJoinedCount(5); return; }
    setJoinedCount(0);
    const delays = [300, 800, 1400, 2200, 3000];
    const timers = delays.map((d, i) =>
      setTimeout(() => setJoinedCount(i + 1), d)
    );
    return () => timers.forEach(clearTimeout);
  }, [current.id]);

  // Jitter for countdown step
  useEffect(() => {
    if (current.id !== "countdown") return;
    const id = setInterval(() => setPriceJitter((Math.random() - 0.5) * 30), 250);
    return () => clearInterval(id);
  }, [current.id]);

  const animPrice = current.id === "countdown"
    ? basePrice + endDelta * 0.6 + priceJitter
    : current.id === "result"
    ? basePrice + endDelta
    : basePrice;

  const priceChange = animPrice - basePrice;
  const isGreen = priceChange >= 0;
  const pc = isGreen ? "#10b981" : "#f43f5e";

  const goTo = (i) => {
    setStep(i);
    setPriceJitter(0);
  };

  const longCount = CHOICES.filter(c => c === "long").length;
  const shortCount = CHOICES.filter(c => c === "short").length;
  const totalPool = 5;
  const winnerCount = WINNERS.filter(Boolean).length;

  return (
    <div className="battle-preview relative overflow-hidden">
      {/* Phase glow */}
      {current.id === "result" && (
        <div className="absolute inset-0 rounded-[1.25rem] pointer-events-none"
          style={{ boxShadow: "inset 0 0 60px rgba(251,191,36,0.06)" }} />
      )}
      {current.id === "countdown" && (
        <div className="absolute inset-0 rounded-[1.25rem] pointer-events-none"
          style={{ boxShadow: `inset 0 0 40px ${isGreen ? "rgba(16,185,129,0.05)" : "rgba(244,63,94,0.05)"}` }} />
      )}

      {/* Step tabs */}
      <div className="flex gap-1 mb-4">
        {STEPS.map((s, i) => {
          const active = step === i;
          const done = i < step;
          return (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              className="flex-1 cursor-pointer transition-all duration-300"
            >
              <div className={`h-1 rounded-full mb-2 transition-all duration-500 ${
                active ? "bg-orange-400" : done ? "bg-orange-400/30" : "bg-white/[0.06]"
              }`} />
              <p className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
                active ? "text-orange-400" : "text-white/20"
              }`}>
                {s.title}
              </p>
            </button>
          );
        })}
      </div>

      {/* Step description */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black ${
          current.id === "result" ? "bg-amber-400/20 text-amber-400" : "bg-orange-400/15 text-orange-400"
        }`}>
          {step + 1}
        </div>
        <p className="text-white/45 text-xs">{current.desc}</p>
      </div>

      {/* ===== MATCH PHASE ===== */}
      {current.id === "match" && (
        <div className="space-y-2.5 mb-3">
          {/* Lobby slots */}
          <div className="rounded-xl p-3 border border-white/[0.06]" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))" }}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider">Arena Lobby</span>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/15">#A7F2</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-orange-400">{joinedCount}/5</span>
            </div>
            <div className="flex gap-2">
              {PLAYERS.map((p, i) => {
                const joined = i < joinedCount;
                return (
                  <div key={i} className={`flex-1 h-10 rounded-lg border flex items-center justify-center transition-all duration-500 ${
                    joined
                      ? "bg-orange-500/10 border-orange-400/20"
                      : "bg-white/[0.02] border-white/[0.04] border-dashed"
                  }`}>
                    {joined ? (
                      <span className="text-[9px] font-mono text-orange-400/80 font-bold">{p.avatar}</span>
                    ) : (
                      <span className="text-white/10 text-lg">+</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2.5 h-1 rounded-full bg-white/[0.04] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700" style={{ width: `${(joinedCount / 5) * 100}%` }} />
            </div>
          </div>

          {/* Entry modes */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg p-2.5 border border-amber-500/10" style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))" }}>
              <p className="text-[10px] font-bold text-white/70">⚡ Quick Match</p>
              <p className="text-[8px] text-white/25 mt-0.5">Auto-matched instantly</p>
            </div>
            <div className="rounded-lg p-2.5 border border-violet-500/10" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(139,92,246,0.02))" }}>
              <p className="text-[10px] font-bold text-white/70">🔑 Room Code</p>
              <p className="text-[8px] text-white/25 mt-0.5">Invite friends to play</p>
            </div>
          </div>

          {/* Round rules */}
          <div className="rounded-xl p-3 border border-white/[0.06]" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.008))" }}>
            <p className="text-[9px] text-white/25 font-bold uppercase tracking-wider mb-2">Round Rules</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { val: "1 USDC", label: "Entry" },
                { val: "30s", label: "Duration" },
                { val: "5%", label: "Fee" },
                { val: "5", label: "Max Players" },
              ].map((r) => (
                <div key={r.label} className="text-center">
                  <p className="text-xs font-mono font-black text-white/80">{r.val}</p>
                  <p className="text-[8px] text-white/25 mt-0.5">{r.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== PREDICT PHASE ===== */}
      {current.id === "predict" && (
        <div className="space-y-2 mb-3">
          {PLAYERS.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-white/[0.06]" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))" }}>
              <div className="w-7 h-7 rounded-md bg-white/[0.06] flex items-center justify-center text-[9px] font-black text-white/40 shrink-0">
                {p.avatar}
              </div>
              <span className="text-[10px] font-mono text-white/35 flex-1 truncate">{p.name}</span>
              <div className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                CHOICES[i] === "long"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
              }`}>
                {CHOICES[i] === "long" ? "▲ LONG" : "▼ SHORT"}
              </div>
            </div>
          ))}
          {/* Prediction summary bar */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden flex">
              <div className="h-full bg-emerald-500/50 rounded-l-full" style={{ width: `${(longCount / 5) * 100}%` }} />
              <div className="h-full bg-rose-500/50 rounded-r-full" style={{ width: `${(shortCount / 5) * 100}%` }} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-emerald-400/70 text-[9px] font-bold">{longCount} Long</span>
              <span className="text-white/10">·</span>
              <span className="text-rose-400/70 text-[9px] font-bold">{shortCount} Short</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== COUNTDOWN PHASE ===== */}
      {current.id === "countdown" && (
        <div className="mb-3">
          {/* Timer + teams */}
          <div className="flex items-center gap-3 mb-3">
            {/* Long team */}
            <div className="flex-1 rounded-xl p-2.5 border border-emerald-500/10" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02))" }}>
              <p className="text-[9px] text-emerald-400/60 font-bold uppercase tracking-wider mb-1.5">Long Team</p>
              <div className="flex gap-1">
                {PLAYERS.filter((_, i) => CHOICES[i] === "long").map((p, i) => (
                  <div key={i} className="w-7 h-7 rounded-md bg-emerald-500/15 border border-emerald-500/15 flex items-center justify-center text-[8px] font-black text-emerald-400/70">
                    {p.avatar}
                  </div>
                ))}
              </div>
            </div>

            {/* Timer ring */}
            <div className="shrink-0">
              <div className="relative w-14 h-14">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2.5" />
                  <circle cx="24" cy="24" r="20" fill="none" stroke={pc} strokeWidth="2.5"
                    strokeLinecap="round" strokeDasharray="75 125.6" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono font-black text-base" style={{ color: pc }}>18</span>
                </div>
              </div>
            </div>

            {/* Short team */}
            <div className="flex-1 rounded-xl p-2.5 border border-rose-500/10" style={{ background: "linear-gradient(135deg, rgba(244,63,94,0.06), rgba(244,63,94,0.02))" }}>
              <p className="text-[9px] text-rose-400/60 font-bold uppercase tracking-wider mb-1.5">Short Team</p>
              <div className="flex gap-1">
                {PLAYERS.filter((_, i) => CHOICES[i] === "short").map((p, i) => (
                  <div key={i} className="w-7 h-7 rounded-md bg-rose-500/15 border border-rose-500/15 flex items-center justify-center text-[8px] font-black text-rose-400/70">
                    {p.avatar}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pool info */}
          <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-white/[0.05]" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.005))" }}>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[8px] text-white/25 uppercase tracking-wider">Pool</p>
                <p className="text-xs font-mono font-bold text-white/70">{totalPool} USDC</p>
              </div>
              <div className="w-px h-6 bg-white/[0.06]" />
              <div>
                <p className="text-[8px] text-white/25 uppercase tracking-wider">Players</p>
                <p className="text-xs font-mono font-bold text-white/70">{longCount}v{shortCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: pc }} />
              <span className="text-[9px] text-white/30">Live</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== RESULT PHASE ===== */}
      {current.id === "result" && (
        <div className="mb-3">
          {/* Winner banner */}
          <div className="rounded-xl p-3 mb-2 border border-amber-400/15" style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.06), rgba(245,158,11,0.02))" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🏆</span>
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Long Wins — BTC Went Up</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-emerald-400">+{(endDelta).toFixed(2)}</span>
            </div>
          </div>

          {/* Player results */}
          <div className="space-y-1.5">
            {PLAYERS.map((p, i) => {
              const isW = WINNERS[i];
              const choice = CHOICES[i];
              return (
                <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-all ${
                  isW
                    ? "border-emerald-500/15"
                    : "border-white/[0.04] opacity-50"
                }`} style={{
                  background: isW
                    ? "linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02))"
                    : "linear-gradient(135deg, rgba(255,255,255,0.015), rgba(255,255,255,0.005))"
                }}>
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-black ${
                    isW ? "bg-emerald-500/20 text-emerald-400" : "bg-white/[0.04] text-white/25"
                  }`}>
                    {p.avatar}
                  </div>
                  <span className="text-[9px] font-mono text-white/30 flex-1 truncate">{p.name}</span>
                  <span className={`text-[9px] font-bold ${choice === "long" ? "text-emerald-400/50" : "text-rose-400/50"}`}>
                    {choice === "long" ? "LONG" : "SHORT"}
                  </span>
                  <span className={`text-[10px] font-mono font-black ml-1 ${
                    isW ? "text-emerald-400" : "text-rose-400/40"
                  }`}>
                    {isW ? WIN_AMOUNT : LOSE_AMOUNT}
                  </span>
                  {isW && <span className="text-[8px]">✓</span>}
                </div>
              );
            })}
          </div>

          {/* Settlement summary */}
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.04]">
            <span className="text-[9px] text-white/25">Settlement complete</span>
            <div className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-emerald-400" />
              <span className="text-[9px] text-emerald-400/60 font-mono">On-chain verified</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== Price Panel (hide on match) ===== */}
      {current.id !== "match" && <div className={`rounded-xl p-3 transition-all duration-500 border ${
        current.id === "countdown"
          ? `${isGreen ? "border-emerald-500/10" : "border-rose-500/10"}`
          : current.id === "result"
          ? "border-amber-500/10"
          : "border-white/[0.06]"
      }`} style={{
        background: current.id === "countdown"
          ? `linear-gradient(135deg, ${isGreen ? "rgba(16,185,129,0.06)" : "rgba(244,63,94,0.06)"}, transparent)`
          : current.id === "result"
          ? "linear-gradient(135deg, rgba(251,191,36,0.04), transparent)"
          : "linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))"
      }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/25 text-[8px] uppercase tracking-wider mb-0.5">BTC / USD</p>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-mono font-black transition-colors duration-200 ${
                current.id === "countdown" || current.id === "result"
                  ? (isGreen ? "text-emerald-400" : "text-rose-400")
                  : "text-white/90"
              }`}>
                ${animPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
              {(current.id === "countdown" || current.id === "result") && (
                <span className="text-xs font-mono font-bold" style={{ color: pc }}>
                  {isGreen ? "+" : ""}{priceChange.toFixed(2)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: current.id === "countdown" ? pc : "#10b981" }} />
            <span className="text-white/25 text-[9px]">Live</span>
          </div>
        </div>
        <p className={`text-[9px] mt-2 pt-2 border-t border-white/[0.04] ${
          current.id === "predict" ? "text-white/30" : current.id === "countdown" ? "text-white/35" : "text-white/30"
        }`}>
          {current.id === "predict" && "📌 Base price — locked when game starts, all players share the same price"}
          {current.id === "countdown" && "⏱ Live price — 30s countdown, price moving in real-time"}
          {current.id === "result" && "✅ Final price — compared with base price to determine winners"}
        </p>
      </div>}
    </div>
  );
}
