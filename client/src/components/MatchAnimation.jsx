import{TeamSlots}from"./TeamSlots";
export function MatchAnimation({teamSize,current,countdown,status="matching"}){
  const isPreparing=status==="preparing";
  const pct=isPreparing||countdown===null||countdown===undefined?100:((60-countdown)/60)*100;
  return<div className="text-center py-4">
    <div className="relative w-28 h-28 mx-auto mb-4"><div className="absolute inset-0 rounded-full border border-fuchsia-500/15"/><div className="absolute inset-0 rounded-full" style={{background:"conic-gradient(from 0deg,transparent,rgba(124,92,255,0.32) 90deg,transparent 180deg)",animation:"radar 1.5s linear infinite"}}/><div className="absolute inset-0 flex items-center justify-center"><svg viewBox="241 173 316 263" xmlns="http://www.w3.org/2000/svg" className="w-14 h-14" aria-hidden="true"><defs><linearGradient id="ma-logo" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#22d3ee"/><stop offset="55%" stopColor="#a855f7"/><stop offset="100%" stopColor="#ec4899"/></linearGradient></defs><g fill="url(#ma-logo)"><path d="M399.238 173L477.369 301.477L435.062 324.852L397.587 259.017L339.709 353.473L397.685 319.904L412.7 347.11L486.396 308.137L408.88 390.65L389.423 357.887L241 436L399.238 173Z"/><path d="M487.326 321.956L557 435.873L460.913 387.652L446.745 365.522L487.326 321.956Z"/></g></svg></div></div>
    <h3 className="text-lg font-black text-gradient mb-1">{isPreparing?"Match Found":"Finding Opponents"}</h3>
    <p className="text-white/20 text-xs mb-3">{isPreparing?`All ${teamSize} players are ready`:`${current}/${teamSize} ready`}</p>
    <TeamSlots total={teamSize} current={current}/>
    {isPreparing
      ?<div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/[0.03] border border-white/[0.06] px-3 py-1.5">
        <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse"/>
        <p className="text-white/30 text-[10px] font-mono">Preparing payment...</p>
      </div>
      :<div className="w-48 mx-auto mt-4"><div className="h-1 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-400 via-fuchsia-400 to-purple-400 rounded-full transition-all duration-300" style={{width:`${pct}%`}}/></div><p className="text-white/15 text-[10px] mt-1.5 font-mono">{countdown}s</p></div>}
  </div>;
}
