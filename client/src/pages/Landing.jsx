import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { useBtcPrice } from "../hooks/useBtcPrice";
import BattlePreview from "../components/BattlePreview";
import WalletMenu from "../components/WalletMenu";

const FAQS = [
  {
    q: "What is Predict Arena?",
    a: "A real-time PvP prediction game on Base. Two or more players enter a round, each predicts whether BTC will go up (Long) or down (Short) during a 30-second prediction window. Winners split the pool.",
  },
  {
    q: "How much does it cost to play?",
    a: "Each prediction costs 1 USDC. A 5% platform fee is deducted from the winner's payout. No hidden fees.",
  },
  {
    q: "How are winners decided?",
    a: "After all players predict, the game locks the current BTC price. 30 seconds after predictions close, if BTC went up — Long players win. If BTC went down — Short players win. Settlement is fully automatic and on-chain.",
  },
  {
    q: "What wallet do I need?",
    a: "Any EVM-compatible wallet works — MetaMask, Coinbase Wallet, Rainbow, etc. You'll need a small amount of ETH on Base Sepolia for gas, and USDC for predictions.",
  },
  {
    q: "Is it safe? Where are my funds?",
    a: "All game logic runs through a verified smart contract on Base. Your funds are held in the contract only during a round, and winners can claim rewards directly to wallet. No custodial risk.",
  },
];

export default function Landing() {
  const nav = useNavigate();
  const { wallet, connect, connecting, mockMode, balance, showWalletMenu, setShowWalletMenu } = useWallet();
  const price = useBtcPrice();
  const short = wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "";
  const [openFaq, setOpenFaq] = useState(null);

  const handleEnter = () => {
    if (!wallet) connect();
    nav("/arena");
  };



  return (
    <div className="relative overflow-hidden flex flex-col" style={{ background: "linear-gradient(180deg, #0a0a14 0%, #0d0d1a 40%, #0a0b16 100%)" }}>
      {/* ===== Background ===== */}
      <div className="landing-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb" style={{
          width: 300, height: 300, top: "30%", left: "15%",
          background: "radial-gradient(circle, rgba(245,158,11,0.06), transparent 70%)",
          animationDuration: "12s", animationDelay: "-2s",
        }} />
        <div className="grid-overlay" />
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="particle" style={{
            left: `${8 + Math.random() * 84}%`, top: `${8 + Math.random() * 84}%`,
            animationDelay: `${Math.random() * 5}s`, animationDuration: `${4 + Math.random() * 4}s`,
            width: `${1.5 + Math.random() * 2}px`, height: `${1.5 + Math.random() * 2}px`,
          }} />
        ))}
      </div>

      {/* ===== Navbar ===== */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0a0a14]/85 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={() => nav("/")} className="flex items-center gap-2.5 hover:opacity-80 transition">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
                  <path d="M2 26 C2 22 4 20 7 20 L7 16 C7 13.5 9 12 11 13 L11 20 L15 20 L15 15 C15 12.5 17 11.5 19 13 L19 20 L23 20 L23 16 C23 13.5 25 12.5 27 14 L27 20 C29 20 30 22 30 25 L30 38 C30 41 28 43 25 43 L7 43 C4 43 2 41 2 38Z" fill="white"/>
                  <path d="M62 26 C62 22 60 20 57 20 L57 16 C57 13.5 55 12 53 13 L53 20 L49 20 L49 15 C49 12.5 47 11.5 45 13 L45 20 L41 20 L41 16 C41 13.5 39 12.5 37 14 L37 20 C35 20 34 22 34 25 L34 38 C34 41 36 43 39 43 L57 43 C60 43 62 41 62 38Z" fill="white"/>
                  <line x1="32" y1="22" x2="32" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="32" y1="42" x2="32" y2="52" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="29" y1="15" x2="27" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="35" y1="15" x2="37" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="font-black text-sm tracking-tight">PREDICT<span className="text-gradient">ARENA</span></span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-xl px-2 py-1.5">
            <button onClick={() => nav("/arena")} className="text-xs px-4 py-1.5 rounded-lg transition font-semibold text-white/40 hover:text-white/60 hover:bg-white/[0.06]">Battle</button>
            <button onClick={() => nav("/how-to-play")} className="text-xs px-4 py-1.5 rounded-lg transition font-semibold text-white/40 hover:text-white/60 hover:bg-white/[0.06]">How to Play</button>
            <div className="relative">
              {wallet ? (
                <button onClick={() => setShowWalletMenu(!showWalletMenu)} className="text-xs px-4 py-1.5 rounded-lg transition font-semibold text-white/40 hover:text-white/60 hover:bg-white/[0.06] flex items-center gap-1.5">
                  {mockMode&&<span className="text-[9px] bg-amber-500/10 border border-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full font-mono font-bold">{balance}</span>}
                  {short}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-40"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              ) : (
                <button onClick={connect} disabled={connecting} className="text-xs px-4 py-1.5 rounded-lg transition font-semibold text-white/40 hover:text-white/60 hover:bg-white/[0.06]">
                  {connecting ? "Connecting..." : "Connect Wallet"}
                </button>
              )}
              <WalletMenu/>
            </div>
          </div>
        </div>
      </header>

      {/* ===== Hero Section ===== */}
      <section className="relative z-10 pt-16 pb-12 lg:pt-24 lg:pb-16">
        <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
          {/* Left */}
          <div className="text-left">
            <div className="inline-flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.06] rounded-full px-2.5 py-1 mb-6 animate-slideUp">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white/40 text-[10px] font-medium">Testnet</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-black tracking-tight mb-5 animate-slideUp leading-[1.1]">
              Predict. Battle.<br />
              <span className="text-gradient">Win in 30 Seconds.</span>
            </h1>
            <p className="text-white/70 text-base sm:text-lg max-w-lg mb-8 animate-slideUp delay-100 leading-relaxed">
              Real-time PvP prediction game. Go Long or Short on BTC, beat your opponent, settle on-chain instantly. 1 USDC to play.
            </p>

            <div className="animate-slideUp delay-200">
              <button onClick={handleEnter} className="btn-primary text-lg px-10 py-4 rounded-2xl relative overflow-hidden group cta-glow">
                <span className="relative z-10 flex items-center justify-center gap-2.5">
                  Start Battling
                  <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </span>
              </button>
            </div>

            <div className="flex items-center gap-4 mt-10 animate-slideUp delay-300">
              {[
                { icon: "⚡", text: "30s Instant Rounds" },
                { icon: "🔗", text: "On-chain Settlement" },
                { icon: "💰", text: "Up to 4x Payout" },
              ].map((s) => (
                <div key={s.text} className="flex items-center gap-1.5">
                  <span className="text-xs">{s.icon}</span>
                  <span className="text-white/40 text-xs">{s.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right */}
          <div className="animate-slideUp delay-100">
            <BattlePreview />
          </div>
        </div>
      </section>

      {/* ===== Trust Banner ===== */}
      <div className="relative z-10 py-6 border-y border-white/[0.06]" style={{ background: "linear-gradient(90deg, rgba(245,158,11,0.03), rgba(139,92,246,0.03), rgba(6,182,212,0.03))" }}>
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-center gap-8 sm:gap-14 flex-wrap">
          {[
            { icon: "🔒", text: "Verified Smart Contract" },
            { icon: "⚡", text: "30s Instant Settlement" },
            { icon: "🏦", text: "Non-custodial" },
            { icon: "🔗", text: "Built on Base" },
          ].map((t) => (
            <div key={t.text} className="flex items-center gap-2">
              <span className="text-sm">{t.icon}</span>
              <span className="text-white/40 text-xs font-medium">{t.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ===== How It Works ===== */}
      <section className="relative z-10 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-black text-center mb-3">How It Works</h2>
          <p className="text-white/40 text-sm text-center mb-12 max-w-lg mx-auto">Three steps. No sign-up. Just connect, predict, and win.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                icon: "🔗",
                title: "Connect & Enter",
                desc: "Connect your wallet, choose Quick Match or create a room with friends. Stake 1 USDC to enter.",
                color: "from-amber-500/10 to-orange-500/10",
                border: "border-amber-500/10",
              },
              {
                step: "02",
                icon: "📊",
                title: "Pick Your Side",
                desc: "BTC going up? Go Long. Going down? Go Short. You have 30 seconds to lock in your prediction, with the final 5 seconds reserved for on-chain confirmation.",
                color: "from-emerald-500/10 to-cyan-500/10",
                border: "border-emerald-500/10",
              },
              {
                step: "03",
                icon: "🏆",
                title: "Win & Collect",
                desc: "After the prediction window closes, settlement follows. Correct prediction? Claim your USDC reward from the result screen or history.",
                color: "from-violet-500/10 to-purple-500/10",
                border: "border-violet-500/10",
              },
            ].map((s) => (
              <div key={s.step} className={`relative bg-gradient-to-br ${s.color} border ${s.border} rounded-2xl p-6 group hover:scale-[1.02] hover:border-white/[0.12] transition-all duration-300 backdrop-blur-sm`} style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
                <div className="absolute top-4 right-4 text-white/[0.05] text-5xl font-black">{s.step}</div>
                <span className="text-3xl">{s.icon}</span>
                <h3 className="text-lg font-bold mt-4 mb-2">{s.title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="relative z-10 py-20">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-black text-center mb-3">Frequently Asked Questions</h2>
          <p className="text-white/40 text-sm text-center mb-10">Everything you need to know before your first battle.</p>

          <div className="space-y-2">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} className={`border rounded-xl transition-all duration-300 ${isOpen ? "border-white/[0.10]" : "border-white/[0.06] hover:border-white/[0.09]"}`} style={{ background: isOpen ? "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))" : "linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))", boxShadow: isOpen ? "0 4px 24px rgba(0,0,0,0.2)" : "none" }}>
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer"
                  >
                    <span className={`text-sm font-semibold transition-colors ${isOpen ? "text-white/90" : "text-white/60"}`}>{faq.q}</span>
                    <span className={`text-white/30 text-lg transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}>+</span>
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}>
                    <p className="px-5 pb-4 text-white/45 text-sm leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>


      {/* ===== Footer ===== */}
      <footer className="relative z-10 pt-10 pb-8 border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <svg width="16" height="16" viewBox="0 0 64 64" fill="none">
                  <path d="M2 26 C2 22 4 20 7 20 L7 16 C7 13.5 9 12 11 13 L11 20 L15 20 L15 15 C15 12.5 17 11.5 19 13 L19 20 L23 20 L23 16 C23 13.5 25 12.5 27 14 L27 20 C29 20 30 22 30 25 L30 38 C30 41 28 43 25 43 L7 43 C4 43 2 41 2 38Z" fill="white"/>
                  <path d="M62 26 C62 22 60 20 57 20 L57 16 C57 13.5 55 12 53 13 L53 20 L49 20 L49 15 C49 12.5 47 11.5 45 13 L45 20 L41 20 L41 16 C41 13.5 39 12.5 37 14 L37 20 C35 20 34 22 34 25 L34 38 C34 41 36 43 39 43 L57 43 C60 43 62 41 62 38Z" fill="white"/>
                  <line x1="32" y1="22" x2="32" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="32" y1="42" x2="32" y2="52" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="29" y1="15" x2="27" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="35" y1="15" x2="37" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="font-black text-sm tracking-tight">PREDICT<span className="text-gradient">ARENA</span></span>
            </div>

            {/* Links */}
            <div className="flex items-center gap-6">
              <button onClick={() => nav("/how-to-play")} className="text-white/30 text-xs hover:text-white/50 transition">How to Play</button>
              <button onClick={() => nav("/arena")} className="text-white/30 text-xs hover:text-white/50 transition">Battle</button>
            </div>

            {/* Copyright */}
            <p className="text-white/15 text-[10px]">© 2025 Predict Arena. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
