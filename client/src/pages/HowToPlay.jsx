import{useNavigate}from"react-router-dom";
export default function HowToPlay(){
  const nav=useNavigate();
  const steps=[
    {icon:"🔗",title:"Connect Wallet",desc:"Connect your wallet or try demo mode with virtual balance. No real funds needed to practice."},
    {icon:"⚔️",title:"Choose Your Battle",desc:"Pick Random Match for instant PvP, or Create Arena to challenge friends with an invite code."},
    {icon:"💰",title:"Pay Entry Fee",desc:"Each player pays 1 USDC to enter. The platform takes a 5% fee (0.05 USDC). The rest goes to the prize pool."},
    {icon:"📈",title:"Predict BTC Price",desc:"You have 20 seconds to predict: will BTC go UP or DOWN? Watch the live price feed and make your call."},
    {icon:"⏱️",title:"Wait for Settlement",desc:"After predictions lock, a 10-second countdown begins. The final BTC price determines the winner."},
    {icon:"🏆",title:"Collect Rewards",desc:"Winners split the losers' stakes! If everyone predicts the same direction, all players get their entry minus fee back."},
  ];
  const examples=[
    {title:"2 Players — Split Decision",players:"Player A: LONG ✅ | Player B: SHORT ❌",result:"A wins 1.90 USDC, B loses entry",emoji:"💰"},
    {title:"2 Players — Same Prediction",players:"Both predict LONG ✅",result:"Both get 0.95 USDC back (entry minus fee)",emoji:"🤝"},
    {title:"5 Players — 3 Win, 2 Lose",players:"3 correct, 2 wrong",result:"Winners get ~1.58 USDC each, Losers get nothing",emoji:"⚔️"},
  ];
  return(
    <div className="page-container">
      <button onClick={()=>nav("/")} className="text-white/20 hover:text-white/40 text-xs mb-4 transition">← Back</button>
      <div className="text-center mb-6"><span className="text-4xl">📖</span><h1 className="text-2xl font-black mt-2">How to Play</h1><p className="text-white/20 text-xs mt-1">Master the arena in 6 simple steps</p></div>
      <div className="space-y-2.5 mb-6">{steps.map((s,i)=><div key={i} className="card animate-slideUp flex gap-3" style={{animationDelay:`${i*80}ms`}}>
        <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center text-lg shrink-0">{s.icon}</div>
        <div><div className="flex items-center gap-2"><span className="text-[9px] font-mono text-orange-400/60">0{i+1}</span><h3 className="text-sm font-bold">{s.title}</h3></div><p className="text-white/25 text-[11px] mt-0.5 leading-relaxed">{s.desc}</p></div>
      </div>)}</div>
      <div className="mb-6"><h2 className="text-sm font-black mb-3 flex items-center gap-2"><span>💡</span>Payout Examples</h2>
        <div className="space-y-2">{examples.map((e,i)=><div key={i} className="card !p-3">
          <div className="flex items-center gap-2 mb-1.5"><span>{e.emoji}</span><span className="text-xs font-bold">{e.title}</span></div>
          <p className="text-[10px] text-white/25">{e.players}</p>
          <p className="text-[10px] text-amber-400/70 mt-0.5">{e.result}</p>
        </div>)}</div>
      </div>
      <div className="card !p-4 text-center glow-orange"><h3 className="font-bold text-sm mb-1">Ready to compete?</h3><p className="text-white/20 text-[10px] mb-3">Jump into the arena and test your prediction skills</p><button onClick={()=>nav("/")} className="btn-primary !py-2 !px-6 !text-sm">Enter Arena</button></div>
    </div>
  );
}
