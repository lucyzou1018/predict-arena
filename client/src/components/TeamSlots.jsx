function hash32(s){let h=2166136261>>>0;for(let i=0;i<(s||"").length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function Avatar({seed}){
  const h=hash32(seed||"anon");
  const hue=h%360;
  const hue2=(hue+40)%360;
  return<div className="w-full h-full rounded-full flex items-center justify-center shadow-lg shadow-violet-500/30 ring-1 ring-white/10" style={{background:`linear-gradient(135deg,hsl(${hue} 75% 58%),hsl(${hue2} 70% 45%))`}}>
    <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7 fill-white/95" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z"/></svg>
  </div>;
}
export function TeamSlots({total,players=[],current=0}){
  const filled=players.length||current;
  return<div className="flex flex-wrap justify-center gap-2 sm:gap-2.5 my-3">{Array.from({length:total}).map((_,i)=>{const seat=i<filled;return<div key={i} className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-500 ${seat?"animate-slideUp":"bg-white/[0.02] border border-dashed border-white/[0.08] flex items-center justify-center"}`} style={seat?{animationDelay:`${i*100}ms`}:{}}>{seat?<Avatar seed={players[i]}/>:<span className="text-white/10 text-xs">?</span>}</div>;})}</div>;
}
