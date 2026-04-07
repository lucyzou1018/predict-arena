import{useNavigate,useLocation}from"react-router-dom";import{useWallet}from"../context/WalletContext";
import WalletMenu from"./WalletMenu";
export function Header(){
  const{wallet,connect,connecting,mockMode,balance,showWalletMenu,setShowWalletMenu}=useWallet();
  const nav=useNavigate();const loc=useLocation();
  const short=wallet?`${wallet.slice(0,6)}...${wallet.slice(-4)}`:"";
  return(
    <header className="sticky top-0 z-50 bg-[#0a0a14]/85 backdrop-blur-2xl border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center">
          <button onClick={()=>nav("/")} className="flex items-center gap-2.5 hover:opacity-80 transition">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20"><svg width="20" height="20" viewBox="0 0 64 64" fill="none"><path d="M2 26 C2 22 4 20 7 20 L7 16 C7 13.5 9 12 11 13 L11 20 L15 20 L15 15 C15 12.5 17 11.5 19 13 L19 20 L23 20 L23 16 C23 13.5 25 12.5 27 14 L27 20 C29 20 30 22 30 25 L30 38 C30 41 28 43 25 43 L7 43 C4 43 2 41 2 38Z" fill="white"/><path d="M62 26 C62 22 60 20 57 20 L57 16 C57 13.5 55 12 53 13 L53 20 L49 20 L49 15 C49 12.5 47 11.5 45 13 L45 20 L41 20 L41 16 C41 13.5 39 12.5 37 14 L37 20 C35 20 34 22 34 25 L34 38 C34 41 36 43 39 43 L57 43 C60 43 62 41 62 38Z" fill="white"/><line x1="32" y1="22" x2="32" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/><line x1="32" y1="42" x2="32" y2="52" stroke="white" strokeWidth="2.5" strokeLinecap="round"/><line x1="29" y1="15" x2="27" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/><line x1="35" y1="15" x2="37" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg></div>
            <span className="font-black text-sm tracking-tight">PREDICT<span className="text-gradient">ARENA</span></span>
          </button>
        </div>
        {/* Right: Battle + How to Play + Wallet in card */}
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-xl px-2 py-1.5">
          <button onClick={()=>nav("/arena")} className={`text-xs px-4 py-1.5 rounded-lg transition font-semibold ${loc.pathname==="/arena"?"bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/20":"text-white/40 hover:text-white/60 hover:bg-white/[0.06]"}`}>Battle</button>
          <button onClick={()=>nav("/how-to-play")} className={`text-xs px-4 py-1.5 rounded-lg transition font-semibold ${loc.pathname==="/how-to-play"?"bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/20":"text-white/40 hover:text-white/60 hover:bg-white/[0.06]"}`}>How to Play</button>
          <div className="relative">
            {wallet?(
              <button onClick={()=>setShowWalletMenu(!showWalletMenu)} className="text-xs px-4 py-1.5 rounded-lg transition font-semibold text-white/40 hover:text-white/60 hover:bg-white/[0.06] flex items-center gap-1.5">
                {mockMode&&<span className="text-[9px] bg-amber-500/10 border border-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full font-mono font-bold">{balance}</span>}
                {short}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-40"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            ):(
              <button onClick={connect} disabled={connecting} className="text-xs px-4 py-1.5 rounded-lg transition font-semibold text-white/40 hover:text-white/60 hover:bg-white/[0.06]">{connecting?"Connecting...":"Connect Wallet"}</button>
            )}
            <WalletMenu/>
          </div>
        </div>
      </div>
    </header>
  );
}
