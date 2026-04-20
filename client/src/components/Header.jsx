import{useNavigate,useLocation}from"react-router-dom";import{useWallet}from"../context/WalletContext";
import{useT}from"../context/LangContext";
import WalletMenu from"./WalletMenu";
import{NavActions}from"./NavActions";

export function Header(){
  const{wallet,connecting,mockMode,chainOk,switchChain,balance,showWalletMenu,setShowWalletMenu}=useWallet();
  const t=useT();
  const nav=useNavigate();const loc=useLocation();
  const short=wallet?`${wallet.slice(0,6)}...${wallet.slice(-4)}`:"";
  const goDashboard=()=>{if(wallet)nav("/arena");else nav("/login?next=/arena")};
  const goGetStarted=()=>nav("/login?next=/arena");
  return(
    <header className="sticky top-0 z-50 bg-[#081432]/[0.01] backdrop-blur-2xl border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Left: Logo + primary nav (matches Landing order) */}
        <div className="flex items-center gap-6">
          <button onClick={()=>nav("/")} className="hover:opacity-80 transition">
            <span className="font-black text-sm tracking-tight">ALPHA<span className="text-gradient">MATCH</span></span>
          </button>
          <button onClick={()=>nav("/how-to-play")} className={`text-xs px-4 py-1.5 rounded-lg transition font-semibold ${loc.pathname==="/how-to-play"?"bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500 text-white shadow-lg shadow-violet-500/25":"text-white/40 hover:text-white/60 hover:bg-white/[0.06]"}`}>{t("nav.howToPlay")}</button>
          <button onClick={goDashboard} className={`text-xs px-4 py-1.5 rounded-lg transition font-semibold ${loc.pathname==="/arena"?"bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500 text-white shadow-lg shadow-violet-500/25":"text-white/40 hover:text-white/60 hover:bg-white/[0.06]"}`}>{t("nav.dashboard")}</button>
        </div>
        {/* Right: chain switch + wallet action */}
        <div className="flex items-center gap-1.5">
          <NavActions/>
          {wallet&&!mockMode&&!chainOk&&(
            <button onClick={()=>switchChain()} className="text-xs px-4 py-1.5 rounded-lg transition font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/15">
              {t("nav.switchChain")}
            </button>
          )}
          <div className="relative">
            {wallet?(
              <button onClick={()=>setShowWalletMenu(!showWalletMenu)} className="group text-xs pl-1.5 pr-3.5 py-1 rounded-xl transition font-semibold bg-white/[0.04] border border-white/[0.08] text-white/65 hover:text-white/90 hover:bg-white/[0.06] flex items-center gap-2">
                {/* Person avatar chip — pulsing glow + outward ring wave */}
                <span className="avatar-pulse relative inline-flex items-center justify-center w-6 h-6 rounded-full overflow-visible" style={{background:"linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#3b82f6 100%)"}}>
                  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] -mb-[3px] relative z-[1]" fill="none">
                    <circle cx="12" cy="9" r="3.4" fill="rgba(255,255,255,0.95)"/>
                    <path d="M5 21c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" fill="rgba(255,255,255,0.95)"/>
                  </svg>
                </span>
                {mockMode&&<span className="text-[9px] bg-violet-500/10 border border-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full font-mono font-bold">{balance}</span>}
                <span className="font-mono">{short}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-40"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            ):(
              <button onClick={goGetStarted} disabled={connecting} className="text-xs px-4 py-1.5 rounded-lg font-semibold bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition disabled:opacity-60">{connecting?t("nav.connecting"):t("nav.getStarted")}</button>
            )}
            <WalletMenu/>
          </div>
        </div>
      </div>
    </header>
  );
}
