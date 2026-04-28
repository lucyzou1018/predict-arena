import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Copy, HelpCircle, LayoutDashboard, LogOut, Trophy, User } from "lucide-react";
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
  const nav = useNavigate();
  const loc = useLocation();
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
  const faqActive = loc.pathname === "/" && loc.hash === "#faq";

  const goTo = (target) => {
    closeMenu();
    nav(target);
  };

  const mobileNavItems = [
    {
      label: t("nav.howToPlay"),
      icon: BookOpen,
      active: loc.pathname === "/how-to-play",
      action: () => goTo("/how-to-play"),
    },
    {
      label: t("nav.faq"),
      icon: HelpCircle,
      active: faqActive,
      action: () => goTo({ pathname: "/", hash: "#faq" }),
    },
    {
      label: t("nav.dashboard"),
      icon: LayoutDashboard,
      active: loc.pathname === "/dashboard",
      action: () => goTo("/dashboard"),
    },
    {
      label: t("nav.leaderboard"),
      icon: Trophy,
      active: loc.pathname === "/leaderboard",
      action: () => goTo("/leaderboard"),
    },
  ];

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
      <div className="lg:hidden border-b border-white/[0.06]">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.action}
              aria-current={item.active ? "page" : undefined}
              className={`w-full px-4 py-3 text-left text-xs font-semibold transition flex items-center gap-2 ${
                item.active
                  ? "bg-white/[0.05] text-white"
                  : "text-white/70 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Icon size={14} strokeWidth={2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={openProfile}
        className="w-full px-4 py-3 text-left text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.04] transition flex items-center gap-2"
      >
        <User size={14} strokeWidth={2} />
        {t("wallet.menu.profile")}
      </button>
      <button
        onClick={copyAddress}
        className="w-full px-4 py-3 text-left text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.04] transition flex items-center gap-2"
      >
        <Copy size={14} strokeWidth={2} />
        {copied ? t("wallet.menu.copied") : t("wallet.menu.copy")}
      </button>
      <button
        onClick={handleDisconnect}
        className="w-full px-4 py-3 text-left text-xs font-semibold text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.06] transition flex items-center gap-2"
      >
        <LogOut size={14} strokeWidth={2} />
        {t("wallet.menu.disconnect")}
      </button>
    </div>
  );
}
