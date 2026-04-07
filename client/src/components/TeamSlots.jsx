export function TeamSlots({total,players=[],current=0}){
  const filled=players.length||current;
  return<div className="flex justify-center gap-2.5 my-3">{Array.from({length:total}).map((_,i)=><div key={i} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 ${i<filled?"bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-orange-500/20 animate-slideUp":"bg-white/[0.02] border border-dashed border-white/[0.08]"}`} style={i<filled?{animationDelay:`${i*100}ms`}:{}}>{i<filled?<span className="text-sm">⚔️</span>:<span className="text-white/10 text-xs">?</span>}</div>)}</div>;
}
