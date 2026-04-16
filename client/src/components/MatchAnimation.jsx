import{TeamSlots}from"./TeamSlots";
export function MatchAnimation({teamSize,current,countdown,status="matching"}){
  const isPreparing=status==="preparing";
  const pct=isPreparing||countdown===null||countdown===undefined?100:((15-countdown)/15)*100;
  return<div className="text-center py-4">
    <div className="relative w-28 h-28 mx-auto mb-4"><div className="absolute inset-0 rounded-full border border-orange-500/15"/><div className="absolute inset-0 rounded-full" style={{background:"conic-gradient(from 0deg,transparent,rgba(245,158,11,0.3) 90deg,transparent 180deg)",animation:"radar 1.5s linear infinite"}}/><div className="absolute inset-0 flex items-center justify-center text-4xl">⚔️</div></div>
    <h3 className="text-lg font-black text-gradient mb-1">{isPreparing?"Match Found":"Finding Opponents"}</h3>
    <p className="text-white/20 text-xs mb-3">{isPreparing?`All ${teamSize} players are ready`:`${current}/${teamSize} ready`}</p>
    <TeamSlots total={teamSize} current={current}/>
    {isPreparing
      ?<div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/[0.03] border border-white/[0.06] px-3 py-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"/>
        <p className="text-white/30 text-[10px] font-mono">Preparing payment...</p>
      </div>
      :<div className="w-48 mx-auto mt-4"><div className="h-1 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-300" style={{width:`${pct}%`}}/></div><p className="text-white/15 text-[10px] mt-1.5 font-mono">{countdown}s</p></div>}
  </div>;
}
