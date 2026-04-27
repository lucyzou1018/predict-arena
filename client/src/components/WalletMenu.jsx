import { useEffect, useRef, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useT } from "../context/LangContext";

export default function WalletMenu() {
  const {
    wallet,
    disconnect,
    showWalletMenu,
    setShowWalletMenu,
    setShowProfileModal,
  } = useWallet();
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);
  const t = useT();

  useEffect(() => {
    if (!showWalletMenu) return;
    const handler = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setShowWalletMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showWalletMenu, setShowWalletMenu]);

  if (!showWalletMenu || !wallet) return null;

  const closeMenu = () => setShowWalletMenu(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  };

  const openProfile = () => {
    closeMenu();
    setShowProfileModal(true);
  };

  const handleDisconnect = () => {
    closeMenu();
    disconnect();
  };

  return (
    <div ref={menuRef} className="absolute right-0 top-full mt-2 w-56 bg-[#12121f] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-[80]">
      <button
        onClick={openProfile}
        className="w-full px-4 py-3 text-left text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.04] transition flex items-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" />
          <path d="M20 21a8 8 0 0 0-16 0" />
        </svg>
        {t("wallet.menu.profile")}
      </button>
      <button
        onClick={copyAddress}
        className="w-full px-4 py-3 text-left text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.04] transition flex items-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {copied ? t("wallet.menu.copied") : t("wallet.menu.copy")}
      </button>
      <button
        onClick={handleDisconnect}
        className="w-full px-4 py-3 text-left text-xs font-semibold text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.06] transition flex items-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        {t("wallet.menu.disconnect")}
      </button>
    </div>
  );
}
