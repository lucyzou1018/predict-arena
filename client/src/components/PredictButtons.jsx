export function PredictButtons({onPredict,disabled,myPrediction}){
  return<div className="flex gap-3 justify-center my-4">
    <button onClick={()=>onPredict("up")} disabled={disabled||!!myPrediction} className={`btn-up flex-1 max-w-[150px] ${myPrediction==="up"?"ring-2 ring-emerald-400/40 ring-offset-2 ring-offset-[#07070f] glow-green !scale-105":""} ${myPrediction&&myPrediction!=="up"?"!opacity-15 !scale-90":""}`}><span className="flex flex-col items-center gap-1"><span className="text-2xl">📈</span><span className="text-sm">LONG</span></span></button>
    <button onClick={()=>onPredict("down")} disabled={disabled||!!myPrediction} className={`btn-down flex-1 max-w-[150px] ${myPrediction==="down"?"ring-2 ring-rose-400/40 ring-offset-2 ring-offset-[#07070f] glow-red !scale-105":""} ${myPrediction&&myPrediction!=="down"?"!opacity-15 !scale-90":""}`}><span className="flex flex-col items-center gap-1"><span className="text-2xl">📉</span><span className="text-sm">SHORT</span></span></button>
  </div>;
}
