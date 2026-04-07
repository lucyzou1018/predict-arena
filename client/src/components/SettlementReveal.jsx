export function SettlementReveal({basePrice,settlementPrice,direction}){
  const isUp=direction==="up";const isFlat=direction==="flat";
  const diff=settlementPrice-basePrice;const pctChange=((diff/basePrice)*100).toFixed(3);
  return<div className="text-center py-4 animate-slideUp">
    <p className="text-white/15 text-[9px] uppercase tracking-widest mb-1">Base Price</p>
    <p className="text-base font-mono text-white/30 mb-4">${basePrice.toLocaleString("en-US",{minimumFractionDigits:2})}</p>
    <div className={`text-5xl mb-3 animate-priceReveal`}>{isFlat?"⚖️":isUp?"🚀":"💥"}</div>
    <p className="text-white/15 text-[9px] uppercase tracking-widest mb-1">Settlement Price</p>
    <p className={`text-3xl font-mono font-black animate-priceReveal ${isUp?"text-emerald-400":isFlat?"text-white/50":"text-rose-400"}`}>${settlementPrice.toLocaleString("en-US",{minimumFractionDigits:2})}</p>
    <div className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${isUp?"bg-emerald-500/10 text-emerald-400 border border-emerald-500/15":isFlat?"bg-white/[0.03] text-white/30 border border-white/[0.06]":"bg-rose-500/10 text-rose-400 border border-rose-500/15"}`}>{isFlat?"FLAT":`${isUp?"+":""}${pctChange}%`}</div>
  </div>;
}
