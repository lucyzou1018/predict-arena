import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";

/**
 * Fallback icons only used when EIP-6963 doesn't provide one (i.e. wallet not installed).
 * Installed wallets always use their own icon from the extension.
 */
const FALLBACK_ICONS = {
  metamask: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%23f6851b'/%3E%3Ctext x='20' y='27' text-anchor='middle' font-size='20'%3E🦊%3C/text%3E%3C/svg%3E",
  coinbase: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%230052FF'/%3E%3Ccircle cx='20' cy='20' r='12' fill='white'/%3E%3Crect x='15' y='15' width='10' height='10' rx='2' fill='%230052FF'/%3E%3C/svg%3E",
  okx: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%23000'/%3E%3Crect x='8' y='8' width='8' height='8' rx='1.5' fill='white'/%3E%3Crect x='24' y='8' width='8' height='8' rx='1.5' fill='white'/%3E%3Crect x='16' y='16' width='8' height='8' rx='1.5' fill='white'/%3E%3Crect x='8' y='24' width='8' height='8' rx='1.5' fill='white'/%3E%3Crect x='24' y='24' width='8' height='8' rx='1.5' fill='white'/%3E%3C/svg%3E",
  phantom: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%23AB9FF2'/%3E%3Ctext x='20' y='27' text-anchor='middle' font-size='18'%3E👻%3C/text%3E%3C/svg%3E",
  rabby: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%237C82F2'/%3E%3Ctext x='20' y='27' text-anchor='middle' font-size='18'%3E🐰%3C/text%3E%3C/svg%3E",
};

export default function WalletModal() {
  const {
    showWalletModal, setShowWalletModal,
    connectWithProvider, connecting, getWalletProviders,
    connectStep, connectError,
  } = useWallet();
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    if (showWalletModal) {
      // Small delay to let EIP-6963 announcements arrive
      const t = setTimeout(() => setProviders(getWalletProviders()), 50);
      return () => clearTimeout(t);
    }
  }, [showWalletModal, getWalletProviders]);

  if (!showWalletModal) return null;

  const getIcon = (w) => {
    if (w.id === "mock") return null;
    // Prefer EIP-6963 icon (from the wallet extension itself — always correct)
    if (w.icon) return w.icon;
    // Fallback for uninstalled wallets
    return FALLBACK_ICONS[w.id] || null;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* Backdrop — nebula glow */}
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(124,92,255,0.18), rgba(9,10,22,0.85) 55%), rgba(6,7,16,0.78)",
        }}
        onClick={() => !connecting && setShowWalletModal(false)}
      />

      {/* Modal */}
      <div
        className="relative w-[420px] max-w-[94vw] rounded-2xl overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(20,22,44,0.92), rgba(14,15,30,0.96))",
          border: "1px solid rgba(227,240,255,0.14)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 60px rgba(6,7,16,0.65), 0 0 0 1px rgba(124,92,255,0.1), 0 0 70px rgba(124,92,255,0.18)",
          backdropFilter: "blur(18px)",
        }}
      >
        {/* Rotating glow ring */}
        <span className="login-ring" style={{ borderRadius: "1rem" }} />
        {/* Sheen shimmer */}
        <span className="login-card-sheen" style={{ borderRadius: "1rem" }} />

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <div className="flex items-center gap-2.5">
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(124,92,255,0.22), rgba(95,149,255,0.18))",
                  border: "1px solid rgba(124,92,255,0.35)",
                  boxShadow: "0 0 18px rgba(124,92,255,0.35)",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgb(191,195,255)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="14" rx="2.5" />
                  <path d="M16 14h2" />
                  <path d="M2 10h20" />
                </svg>
              </span>
              <div>
                <h3 className="text-sm font-bold text-white/95 tracking-tight">Connect Wallet</h3>
                <p className="text-[10px] text-white/40 mt-0.5 tracking-wide">Choose a provider to continue</p>
              </div>
            </div>
            <button
              onClick={() => !connecting && setShowWalletModal(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-white/80 hover:bg-white/[0.08] transition"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Step indicator */}
          {connectStep && connectStep !== "error" && (
            <div
              className="mx-6 mb-4 px-4 py-3 rounded-xl"
              style={{
                background:
                  "linear-gradient(90deg, rgba(124,92,255,0.14), rgba(95,149,255,0.08))",
                border: "1px solid rgba(124,92,255,0.22)",
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-violet-300/70 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-violet-200">
                    {connectStep === "connecting" ? "Connecting to wallet..." : "Waiting for signature..."}
                  </div>
                  <div className="text-[10px] text-violet-200/60 mt-0.5">
                    {connectStep === "connecting"
                      ? "Please approve the connection in your wallet"
                      : "Please sign the message to verify wallet ownership"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {connectStep === "error" && (
            <div
              className="mx-6 mb-4 px-4 py-3 rounded-xl"
              style={{
                background: "rgba(244,63,94,0.08)",
                border: "1px solid rgba(244,63,94,0.2)",
              }}
            >
              <div className="text-xs text-rose-300">{connectError}</div>
            </div>
          )}

          {/* Wallet list */}
          <div className="px-4 pb-4 flex flex-col gap-1.5 max-h-[420px] overflow-y-auto hide-scrollbar">
            {providers.map((w) => {
              const iconSrc = getIcon(w);
              return (
                <button
                  key={w.id}
                  onClick={() => connectWithProvider(w)}
                  disabled={connecting}
                  className="relative flex items-center gap-3 w-full px-4 py-3.5 rounded-xl transition text-left group disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "linear-gradient(180deg, rgba(124,92,255,0.12), rgba(95,149,255,0.06))";
                    e.currentTarget.style.borderColor = "rgba(124,92,255,0.32)";
                    e.currentTarget.style.boxShadow =
                      "0 0 24px rgba(124,92,255,0.18), inset 0 1px 0 rgba(255,255,255,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 transition"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {w.id === "mock" ? (
                      <span className="text-lg">🎮</span>
                    ) : iconSrc ? (
                      <img src={iconSrc} alt={w.name} className="w-7 h-7 rounded-lg" />
                    ) : (
                      <span className="text-lg">🌐</span>
                    )}
                  </div>

                  {/* Name + status */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white/85 group-hover:text-white transition">{w.name}</div>
                    {!w.installed && w.id !== "mock" && (
                      <div className="text-[10px] text-white/30 mt-0.5">Not installed</div>
                    )}
                    {w.installed && w.id !== "mock" && (
                      <div className="text-[10px] text-white/35 mt-0.5">Ready to connect</div>
                    )}
                    {w.id === "mock" && (
                      <div className="text-[10px] text-white/35 mt-0.5">Preview without signing</div>
                    )}
                  </div>

                  {/* Badge */}
                  {w.installed && w.id !== "mock" && (
                    <span
                      className="text-[9px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={{
                        background: "rgba(52,211,153,0.1)",
                        color: "rgb(110,231,183)",
                        border: "1px solid rgba(52,211,153,0.22)",
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Detected
                    </span>
                  )}
                  {!w.installed && w.id !== "mock" && (
                    <span
                      className="text-[9px] font-semibold px-2 py-0.5 rounded-full text-white/50 group-hover:text-white/80 transition"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      Install →
                    </span>
                  )}
                  {w.id === "mock" && (
                    <span
                      className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: "rgba(124,92,255,0.14)",
                        color: "rgb(196,181,253)",
                        border: "1px solid rgba(124,92,255,0.28)",
                      }}
                    >
                      Testnet
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t text-center"
            style={{
              borderColor: "rgba(255,255,255,0.06)",
              background: "rgba(124,92,255,0.04)",
            }}
          >
            <p className="text-[10px] text-white/35 leading-relaxed">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1 -mt-0.5 opacity-60">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Non-custodial — you&apos;ll sign a message to verify ownership. No gas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
