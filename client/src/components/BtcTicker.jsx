export function BtcTicker({price,size="lg",label}){
  const cls=size==="lg"?"text-3xl sm:text-4xl":"text-xl";
  const loading=!price||price<=0;
  return<div className="flex flex-col items-center">
    {label&&<p className="text-white/30 text-[9px] uppercase tracking-[0.25em] mb-2">{label}</p>}
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm font-black shadow-lg shadow-violet-500/30">₿</div>
      {loading
        ?<span className={`font-mono font-bold text-white/20 ${cls} animate-pulse`}>Loading...</span>
        :<span className={`font-mono font-black text-gradient ${cls}`}>${price.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
      }
    </div>
  </div>;
}
