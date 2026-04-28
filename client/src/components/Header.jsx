import{useNavigate,useLocation}from"react-router-dom";import{useWallet}from"../context/WalletContext";
import{useT}from"../context/LangContext";
import WalletMenu from"./WalletMenu";
import{NavActions}from"./NavActions";
import{Logo}from"./Logo";
import{PrimaryNavMenu}from"./PrimaryNavMenu";

export function Header(){
  const{wallet,connecting,mockMode,chainOk,switchChain,balance,showWalletMenu,setShowWalletMenu}=useWallet();
  const t=useT();
  const nav=useNavigate();const loc=useLocation();
  const short=wallet?`${wallet.slice(0,6)}...${wallet.slice(-4)}`:"";
  const goDashboard=()=>{if(wallet)nav("/dashboard");else nav("/login?next=/dashboard")};
  const goFaq=()=>nav({pathname:"/",hash:"#faq"});
  const goLeaderboard=()=>nav("/leaderboard");
  const goGetStarted=()=>nav("/login?next=/dashboard");
  const navBtnBase="text-xs px-2.5 xl:px-4 py-1.5 min-h-8 rounded-xl transition font-semibold whitespace-nowrap";
  const navBtnIdle="text-white/58 hover:text-white/88 hover:bg-white/[0.04] border border-transparent hover:border-white/8";
  const navBtnActive="text-white font-bold";
  const navLabelActive="nav-active-label";
  const faqActive=loc.pathname==="/"&&loc.hash==="#faq";
  const primaryNavItems=[
    {key:"howToPlay",label:t("nav.howToPlay"),active:loc.pathname==="/how-to-play",onClick:()=>nav("/how-to-play")},
    {key:"faq",label:t("nav.faq"),active:faqActive,onClick:goFaq},
    {key:"dashboard",label:t("nav.dashboard"),active:loc.pathname==="/dashboard",onClick:goDashboard},
    {key:"leaderboard",label:t("nav.leaderboard"),active:loc.pathname==="/leaderboard",onClick:goLeaderboard},
  ];
  return(
    <header className="sticky top-0 z-50 border-b border-white/[0.05] bg-[linear-gradient(180deg,rgba(7,8,16,0.88),rgba(9,8,18,0.76))] backdrop-blur-2xl" style={{paddingTop:"var(--safe-top)"}}>
      <div className="w-full px-3 sm:px-5 lg:px-8 py-3 flex items-center justify-between gap-2">
        {/* Left: Logo + primary nav (matches Landing order) */}
        <div className="flex flex-1 items-center gap-2 lg:gap-4 xl:gap-6 min-w-0">
          <button onClick={()=>nav("/")} className="hover:opacity-85 transition shrink-0 text-white/95">
            <Logo className="h-4 sm:h-5 w-auto" active={loc.pathname==="/"} />
          </button>
          <PrimaryNavMenu items={primaryNavItems}/>
          <button onClick={()=>nav("/how-to-play")} className={`hidden lg:inline-flex ${navBtnBase} ${loc.pathname==="/how-to-play"?navBtnActive:navBtnIdle}`}>
            <span className={loc.pathname==="/how-to-play"?navLabelActive:""}>{t("nav.howToPlay")}</span>
          </button>
          <button onClick={goFaq} className={`hidden lg:inline-flex ${navBtnBase} ${faqActive?navBtnActive:navBtnIdle}`}>
            <span className={faqActive?navLabelActive:""}>{t("nav.faq")}</span>
          </button>
          <button onClick={goDashboard} className={`hidden lg:inline-flex ${navBtnBase} ${loc.pathname==="/dashboard"?navBtnActive:navBtnIdle}`}>
            <span className={loc.pathname==="/dashboard"?navLabelActive:""}>{t("nav.dashboard")}</span>
          </button>
          <button onClick={goLeaderboard} className={`hidden lg:inline-flex ${navBtnBase} ${loc.pathname==="/leaderboard"?navBtnActive:navBtnIdle}`}>
            <span className={loc.pathname==="/leaderboard"?navLabelActive:""}>{t("nav.leaderboard")}</span>
          </button>
        </div>
        {/* Right: chain switch + wallet action */}
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5">
          <NavActions/>
          {wallet&&!mockMode&&!chainOk&&(
            <button onClick={()=>switchChain()} className="text-xs px-4 py-1.5 rounded-xl transition font-semibold bg-[linear-gradient(180deg,rgba(54,18,32,0.72),rgba(32,12,20,0.82))] border border-rose-200/15 text-rose-100 hover:bg-[linear-gradient(180deg,rgba(72,22,40,0.78),rgba(40,14,26,0.88))]">
              {t("nav.switchChain")}
            </button>
          )}
          <div className="relative">
            {wallet?(
              <button onClick={()=>setShowWalletMenu(!showWalletMenu)} className="group text-xs pl-1.5 pr-3.5 py-1 rounded-2xl transition font-semibold bg-[linear-gradient(180deg,rgba(18,16,30,0.82),rgba(10,10,18,0.86))] border border-white/[0.08] text-white/78 hover:text-white hover:border-fuchsia-200/[0.10] hover:bg-[linear-gradient(180deg,rgba(24,20,38,0.84),rgba(12,11,22,0.88))] flex items-center gap-2 shadow-[0_10px_24px_rgba(4,4,12,0.30)]">
                {/* Person avatar chip — pulsing glow + outward ring wave */}
                <span className="avatar-pulse relative inline-flex items-center justify-center w-6 h-6 rounded-full overflow-visible" style={{background:"linear-gradient(135deg,#d946ef 0%,#ec4899 55%,#a855f7 100%)"}}>
                  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] -mb-[3px] relative z-[1]" fill="none">
                    <circle cx="12" cy="9" r="3.4" fill="rgba(255,255,255,0.95)"/>
                    <path d="M5 21c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" fill="rgba(255,255,255,0.95)"/>
                  </svg>
                </span>
                {mockMode&&<span className="hidden xl:inline text-[9px] bg-fuchsia-500/8 border border-fuchsia-200/10 text-fuchsia-100 px-1.5 py-0.5 rounded-full font-mono font-bold">{balance}</span>}
                <span className="font-mono hidden xl:inline">{short}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-40"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            ):(
              <button onClick={goGetStarted} disabled={connecting} className="text-xs px-4 py-1.5 rounded-xl font-semibold bg-[linear-gradient(90deg,rgba(92,40,132,0.92),rgba(162,49,120,0.92))] text-white shadow-[0_10px_24px_rgba(48,18,70,0.34)] hover:shadow-[0_10px_28px_rgba(88,24,110,0.38)] transition disabled:opacity-60">{connecting?t("nav.connecting"):t("nav.getStarted")}</button>
            )}
            <WalletMenu/>
          </div>
        </div>
      </div>
    </header>
  );
}
