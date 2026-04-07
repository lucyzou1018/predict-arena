export function CountdownRing({total,remaining,label,size="md"}){
  const pct=remaining/total;const off=283*(1-pct);
  const color=remaining<=5?"#f43f5e":remaining<=10?"#f59e0b":"#10b981";
  const w=size==="lg"?"w-28 h-28":"w-20 h-20";const txt=size==="lg"?"text-3xl":"text-xl";
  return<div className="flex flex-col items-center"><div className={`relative ${w}`}><svg viewBox="0 0 100 100" className="w-full h-full -rotate-90"><circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="4"/><circle cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray="283" strokeDashoffset={off} style={{transition:"stroke-dashoffset 0.5s,stroke 0.5s",filter:`drop-shadow(0 0 6px ${color}30)`}}/></svg><div className="absolute inset-0 flex items-center justify-center"><span className={`${txt} font-black font-mono`} style={{color}}>{remaining}</span></div></div>{label&&<p className="text-white/20 text-[9px] mt-1.5 uppercase tracking-widest">{label}</p>}</div>;
}
