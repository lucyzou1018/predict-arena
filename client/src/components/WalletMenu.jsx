import { useEffect, useRef } from "react";
import { useWallet } from "../context/WalletContext";

export default function WalletMenu() {
  const { wallet, disconnect, walletName, mockMode, balance, showWalletMenu, setShowWalletMenu } = useWallet();
  const ref = useRef(null);

  useEffect(() => {
    if (!showWalletMenu) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setShowWalletMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showWalletMenu, setShowWalletMenu]);

  if (!showWalletMenu || !wallet) return null;

  const short = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 w-56 bg-[#12121f] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-[80]">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="text-[10px] text-white/30 mb-1">{walletName || "Wallet"}</div>
        <div className="text-xs font-mono text-white/60">{short}</div>
        {mockMode && (
          <div className="mt-1.5 text-[10px] text-amber-400/70">
            Balance: <span className="font-mono font-bold">{balance} USDC</span>
          </div>
        )}
      </div>
      <button
        onClick={disconnect}
        className="w-full px-4 py-3 text-left text-xs font-semibold text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.06] transition flex items-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Disconnect
      </button>
    </div>
  );
}
