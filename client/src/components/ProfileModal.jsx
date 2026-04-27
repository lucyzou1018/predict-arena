import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useT } from "../context/LangContext";
import { SERVER_URL } from "../config/constants";

export default function ProfileModal() {
  const { wallet, walletName, mockMode, balance, showProfileModal, setShowProfileModal } = useWallet();
  const [stats, setStats] = useState({ wins: 0, losses: 0, total_earned: 0, total_lost: 0 });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = useT();

  const copyAddress = () => {
    if (!wallet) return;
    try { navigator.clipboard.writeText(wallet); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  useEffect(() => {
    if (!showProfileModal || !wallet) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${SERVER_URL}/api/users/${wallet}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setStats({
          wins: Number(data?.wins || 0),
          losses: Number(data?.losses || 0),
          total_earned: Number(data?.total_earned || 0),
          total_lost: Number(data?.total_lost || 0),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStats({ wins: 0, losses: 0, total_earned: 0, total_lost: 0 });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showProfileModal, wallet]);

  useEffect(() => {
    if (!showProfileModal) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setShowProfileModal(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showProfileModal, setShowProfileModal]);

  if (!showProfileModal || !wallet) return null;

  const short = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  const profit = Number(stats.total_earned || 0) - Number(stats.total_lost || 0);
  const profitPositive = profit >= 0;
  const statValueClass = "mt-2 text-xl font-black tracking-tight";
  const statLabelClass = "text-[10px] uppercase tracking-[0.18em] text-white/30";

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center px-4 py-4 sm:py-6">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{
          background:
            "radial-gradient(ellipse 95% 65% at 50% -5%, rgba(99,102,241,0.28), transparent 55%), radial-gradient(ellipse 70% 55% at 15% 100%, rgba(76,29,149,0.22), transparent 55%), radial-gradient(ellipse 60% 50% at 85% 100%, rgba(109,40,217,0.18), transparent 60%), rgba(6,10,31,0.82)",
        }}
        onClick={() => setShowProfileModal(false)}
      />
      <div
        className="landing-story-card wallet-modal-card relative w-[420px] max-w-[94vw] !p-0 max-h-[calc(100dvh-2rem)] overflow-y-auto hide-scrollbar"
        style={{ marginTop: "max(0px, env(safe-area-inset-top))", marginBottom: "max(0px, env(safe-area-inset-bottom))" }}
      >
        <div className="relative z-10">
          <div className="relative px-5 pt-5 pb-6 bg-[radial-gradient(circle_at_top,rgba(217,70,239,0.2),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-fuchsia-200/45">{t("wallet.menu.profile")}</p>
                <h3 className="mt-2 text-lg font-black text-white">{walletName || t("wallet.menu.wallet")}</h3>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-white/80 hover:bg-white/[0.08] transition"
                aria-label={t("wallet.menu.close")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-[22px] bg-gradient-to-br from-fuchsia-500 via-pink-500 to-violet-500 flex items-center justify-center shadow-[0_18px_45px_rgba(217,70,239,0.35)] shrink-0">
                <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none">
                  <circle cx="12" cy="9" r="3.4" fill="rgba(255,255,255,0.95)" />
                  <path d="M5 21c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" fill="rgba(255,255,255,0.95)" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xl font-black tracking-tight text-white">{short}</p>
                <p className="mt-1 text-[11px] text-white/35">{t("wallet.menu.address")}</p>
                <div className="mt-1 flex items-start gap-2">
                  <p className="flex-1 text-[12px] font-mono break-all text-white/72">{wallet}</p>
                  <button
                    type="button"
                    onClick={copyAddress}
                    aria-label={copied ? "Copied" : "Copy address"}
                    className={`shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded-md transition ${copied ? "text-emerald-300 bg-emerald-500/[0.12]" : "text-white/40 hover:text-white/90 hover:bg-white/[0.08]"}`}
                  >
                    {copied ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="px-5 py-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-[22px] border border-emerald-500/15 bg-emerald-500/[0.05] px-4 py-4">
                <p className={statLabelClass}>{t("home.stats.wins")}</p>
                <p className={`${statValueClass} text-emerald-300`}>{loading ? "--" : stats.wins}</p>
              </div>
              <div className="rounded-[22px] border border-rose-500/15 bg-rose-500/[0.05] px-4 py-4">
                <p className={statLabelClass}>{t("home.stats.losses")}</p>
                <p className={`${statValueClass} text-rose-300`}>{loading ? "--" : stats.losses}</p>
              </div>
              <div className={`rounded-[22px] border px-4 py-4 ${profitPositive ? "border-emerald-500/15 bg-emerald-500/[0.05]" : "border-rose-500/15 bg-rose-500/[0.05]"}`}>
                <p className={statLabelClass}>{t("home.stats.profit")}</p>
                <p className={`${statValueClass} ${profitPositive ? "text-emerald-300" : "text-rose-300"}`}>{loading ? "--" : `${profitPositive ? "+" : ""}${profit.toFixed(2)}`}</p>
              </div>
            </div>
            {mockMode && (
              <div className="mt-4 rounded-[22px] border border-fuchsia-500/18 bg-fuchsia-500/[0.06] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-200/55">{t("wallet.menu.balance")}</p>
                <p className="mt-1 text-sm font-mono font-bold text-fuchsia-200">{balance} USDC</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
