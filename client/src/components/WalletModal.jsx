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
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !connecting && setShowWalletModal(false)}
      />

      {/* Modal */}
      <div className="relative bg-[#12121f] border border-white/[0.08] rounded-2xl w-[400px] max-w-[90vw] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h3 className="text-sm font-bold text-white/90">Connect Wallet</h3>
          <button
            onClick={() => !connecting && setShowWalletModal(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        {connectStep && connectStep !== "error" && (
          <div className="mx-6 mb-4 px-4 py-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/[0.12]">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-amber-400/60 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <div>
                <div className="text-xs font-semibold text-amber-400/90">
                  {connectStep === "connecting" ? "Connecting to wallet..." : "Waiting for signature..."}
                </div>
                <div className="text-[10px] text-amber-400/50 mt-0.5">
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
          <div className="mx-6 mb-4 px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.12]">
            <div className="text-xs text-red-400/90">{connectError}</div>
          </div>
        )}

        {/* Wallet list */}
        <div className="px-4 pb-5 flex flex-col gap-1.5 max-h-[400px] overflow-y-auto">
          {providers.map((w) => {
            const iconSrc = getIcon(w);
            return (
              <button
                key={w.id}
                onClick={() => connectWithProvider(w)}
                disabled={connecting}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.07] hover:border-white/[0.1] transition text-left group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {/* Icon */}
                <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center bg-white/[0.04] group-hover:bg-white/[0.08] transition flex-shrink-0">
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
                  <div className="text-xs font-semibold text-white/80 group-hover:text-white transition">{w.name}</div>
                  {!w.installed && w.id !== "mock" && (
                    <div className="text-[10px] text-white/25 mt-0.5">Not installed</div>
                  )}
                </div>

                {/* Badge */}
                {w.installed && w.id !== "mock" && (
                  <span className="text-[9px] text-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">Detected</span>
                )}
                {!w.installed && w.id !== "mock" && (
                  <span className="text-[9px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded-full font-medium group-hover:text-white/50 transition">Install →</span>
                )}
                {w.id === "mock" && (
                  <span className="text-[9px] text-amber-400/60 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">Testnet</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/[0.05] bg-white/[0.02]">
          <p className="text-[10px] text-white/20 text-center">
            By connecting, you agree to sign a message to verify wallet ownership
          </p>
        </div>
      </div>
    </div>
  );
}
