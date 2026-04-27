import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useT } from "../context/LangContext";

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
  const t = useT();

  useEffect(() => {
    if (showWalletModal) {
      const t = setTimeout(() => setProviders(getWalletProviders()), 50);
      return () => clearTimeout(t);
    }
  }, [showWalletModal, getWalletProviders]);

  useEffect(() => {
    if (!showWalletModal) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !connecting) setShowWalletModal(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showWalletModal, connecting, setShowWalletModal]);

  if (!showWalletModal) return null;

  const getIcon = (w) => {
    if (w.id === "mock") return null;
    if (w.icon) return w.icon;
    return FALLBACK_ICONS[w.id] || null;
  };

  const installed = providers.filter((w) => w.installed && w.id !== "mock");
  const notInstalled = providers.filter((w) => !w.installed && w.id !== "mock");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6">
      <div
        className="dashboard-modal-backdrop absolute inset-0"
        onClick={() => !connecting && setShowWalletModal(false)}
      />

      <div
        className="dashboard-modal-card relative w-[430px] max-w-[94vw] max-h-[calc(100dvh-2.5rem)] overflow-hidden"
      >
        <div className="relative z-10">
          <div className="relative px-6 pt-6 pb-5 bg-[radial-gradient(circle_at_top,rgba(236,72,153,0.16),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-fuchsia-200/48">
                  {t("wallet.modal.kicker")}
                </p>
                <h3 className="mt-2 text-[1.95rem] font-black tracking-[-0.04em] leading-[0.98] text-white">
                  {t("wallet.modal.title")}
                </h3>
                <p className="mt-3 max-w-[20rem] text-[12px] leading-5 text-white/36">
                  {t("wallet.modal.subtitle")}
                </p>
              </div>
              <button
                onClick={() => !connecting && setShowWalletModal(false)}
                className="dashboard-ghost-btn flex h-9 w-9 items-center justify-center rounded-xl !bg-white/[0.035] !text-white/40 hover:!text-white/84"
                aria-label={t("wallet.menu.close")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {connectStep && connectStep !== "error" && (
          <div className="dashboard-room-subcard mx-5 mb-4 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-fuchsia-300/70 border-t-transparent animate-spin" />
              <div className="text-xs font-semibold text-fuchsia-100/90">
                {connectStep === "connecting" ? t("wallet.modal.connecting") : t("wallet.modal.signing")}
              </div>
            </div>
          </div>
        )}

        {connectStep === "error" && (
          <div className="mx-5 mb-4 rounded-[20px] border border-rose-500/18 bg-rose-500/[0.06] px-4 py-3">
            <div className="text-xs leading-5 text-rose-200/88">{connectError}</div>
          </div>
        )}

        <div className="px-5 pb-3 max-h-[58vh] overflow-y-auto hide-scrollbar">
          {installed.length > 0 && (
            <>
              <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.22em] text-fuchsia-200/48">
                {t("wallet.modal.installed")}
              </div>
              <div className="flex flex-col gap-2">
                {installed.map((w) => {
                  const iconSrc = getIcon(w);
                  return (
                    <button
                      key={w.id}
                      onClick={() => connectWithProvider(w)}
                      disabled={connecting}
                      className="dashboard-modal-row group flex w-full items-center gap-3 px-3.5 py-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[rgba(244,114,182,0.18)] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        {w.id === "mock" ? (
                          <span className="text-base">🎮</span>
                        ) : iconSrc ? (
                          <img src={iconSrc} alt={w.name} className="h-7 w-7 rounded-xl" />
                        ) : (
                          <span className="text-base">🌐</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold tracking-[-0.02em] text-white/90 transition group-hover:text-white">
                          {w.name}
                        </div>
                        <div className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-white/24">
                          {t("wallet.modal.available")}
                        </div>
                      </div>
                      <div className="dashboard-room-chip px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-100/82">
                        {t("wallet.modal.connectAction")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {notInstalled.length > 0 && (
            <>
              <div className="mb-2 mt-4 px-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/28">
                {t("wallet.modal.notInstalled")}
              </div>
              <div className="flex flex-col gap-2">
                {notInstalled.map((w) => {
                  const iconSrc = getIcon(w);
                  return (
                    <a
                      key={w.id}
                      href={w.installUrl || "https://ethereum.org/en/wallets/"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dashboard-modal-row is-muted group flex w-full items-center gap-3 px-3.5 py-3 text-left"
                    >
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[rgba(244,114,182,0.12)] bg-white/[0.025] opacity-70">
                        {iconSrc ? (
                          <img src={iconSrc} alt={w.name} className="h-7 w-7 rounded-xl" />
                        ) : (
                          <span className="text-base">🌐</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold tracking-[-0.02em] text-white/46 transition group-hover:text-white/72">
                          {w.name}
                        </div>
                        <div className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-white/18">
                          {t("wallet.modal.installHint")}
                        </div>
                      </div>
                      <div className="dashboard-room-chip px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/52">
                        {t("wallet.modal.install")}
                      </div>
                    </a>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div
          className="mt-2 flex items-center justify-between gap-4 border-t border-white/[0.06] px-6 py-4"
        >
          <span className="text-xs text-white/35">{t("wallet.modal.new")}</span>
          <a
            href="https://ethereum.org/en/wallets/"
            target="_blank"
            rel="noopener noreferrer"
            className="dashboard-secondary-btn inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold !text-fuchsia-100/78 hover:!text-white"
          >
            {t("wallet.modal.learnMore")}
          </a>
        </div>
      </div>
    </div>
  );
}
