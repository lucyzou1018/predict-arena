import{TeamSlots}from"./TeamSlots";
export function MatchAnimation({teamSize,current,countdown}){
  const pct=((15-countdown)/15)*100;
  return<div className="text-center py-4">
    <div className="relative w-28 h-28 mx-auto mb-4"><div className="absolute inset-0 rounded-full border border-orange-500/15"/><div className="absolute inset-0 rounded-full" style={{background:"conic-gradient(from 0deg,transparent,rgba(245,158,11,0.3) 90deg,transparent 180deg)",animation:"radar 1.5s linear infinite"}}/><div className="absolute inset-0 flex items-center justify-center text-4xl">⚔️</div></div>
    <h3 className="text-lg font-black text-gradient mb-1">Finding Opponents</h3>
    <p className="text-white/20 text-xs mb-3">{current}/{teamSize} ready</p>
    <TeamSlots total={teamSize} current={current}/>
    <div className="w-48 mx-auto mt-4"><div className="h-1 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-300" style={{width:`${pct}%`}}/></div><p className="text-white/15 text-[10px] mt-1.5 font-mono">{countdown}s</p></div>
  </div>;
}
