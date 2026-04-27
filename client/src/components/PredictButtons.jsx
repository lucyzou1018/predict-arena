import{TrendingDown,TrendingUp}from"lucide-react";

export function PredictButtons({onPredict,disabled,myPrediction,attention=false}){
  const locked=!!myPrediction;
  return<div className="grid grid-cols-2 gap-3 justify-center my-1.5">
    <button
      type="button"
      aria-label="Choose LONG, BTC closes higher"
      onClick={()=>onPredict("up")}
      disabled={disabled||locked}
      className={`prediction-choice-btn prediction-choice-up group relative min-h-[122px] rounded-[22px] border text-white transition-all duration-300 ${
        myPrediction==="up"
          ?"is-selected border-emerald-300/70 bg-gradient-to-br from-emerald-400/28 via-emerald-500/16 to-teal-500/14 shadow-[0_22px_44px_rgba(16,185,129,0.22)] -translate-y-0.5"
          :"border-emerald-300/42 bg-[linear-gradient(180deg,rgba(16,185,129,0.12)_0%,rgba(7,9,20,0.94)_100%)] hover:border-emerald-200/78 hover:bg-[linear-gradient(180deg,rgba(16,185,129,0.22)_0%,rgba(7,9,20,0.92)_100%)] hover:-translate-y-1 hover:shadow-[0_22px_42px_rgba(16,185,129,0.2)]"
      } ${attention&&!locked?"prediction-attention-btn prediction-attention-btn-up":""} ${myPrediction&&myPrediction!=="up"?"is-muted-choice opacity-45 scale-[0.98]":""} disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none`}
    >
      <span className="absolute inset-x-7 top-9 h-px bg-gradient-to-r from-transparent via-emerald-200/45 to-transparent" />
      {!locked&&<span className="prediction-choice-cta">Choose</span>}
      {myPrediction==="up"&&<span className="prediction-choice-selected">Selected</span>}
      <span className={`flex h-full flex-col items-center justify-center gap-1.5 px-3.5 ${locked?"pt-8 pb-3":"pt-8 pb-3"}`}>
        <span className="prediction-choice-icon border-emerald-300/45 bg-emerald-400/14 text-emerald-100">
          <TrendingUp size={19} strokeWidth={2.7}/>
        </span>
        <span className={`text-[10px] font-mono uppercase tracking-[0.24em] ${myPrediction==="up"?"text-emerald-100/92":"text-emerald-100/78 group-hover:text-white"}`}>Above Base</span>
        <span className="text-[1.82rem] font-black tracking-[-0.05em] leading-none">LONG</span>
        <span className={`text-[11px] font-semibold ${myPrediction==="up"?"text-emerald-100/82":"text-white/58 group-hover:text-white/76"}`}>BTC closes higher</span>
      </span>
    </button>
    <button
      type="button"
      aria-label="Choose SHORT, BTC closes lower"
      onClick={()=>onPredict("down")}
      disabled={disabled||locked}
      className={`prediction-choice-btn prediction-choice-down group relative min-h-[122px] rounded-[22px] border text-white transition-all duration-300 ${
        myPrediction==="down"
          ?"is-selected border-rose-300/70 bg-gradient-to-br from-rose-400/28 via-rose-500/16 to-pink-500/14 shadow-[0_22px_44px_rgba(244,63,94,0.22)] -translate-y-0.5"
          :"border-rose-300/42 bg-[linear-gradient(180deg,rgba(244,63,94,0.12)_0%,rgba(7,9,20,0.94)_100%)] hover:border-rose-200/78 hover:bg-[linear-gradient(180deg,rgba(244,63,94,0.22)_0%,rgba(7,9,20,0.92)_100%)] hover:-translate-y-1 hover:shadow-[0_22px_42px_rgba(244,63,94,0.2)]"
      } ${attention&&!locked?"prediction-attention-btn prediction-attention-btn-down":""} ${myPrediction&&myPrediction!=="down"?"is-muted-choice opacity-45 scale-[0.98]":""} disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none`}
    >
      <span className="absolute inset-x-7 top-9 h-px bg-gradient-to-r from-transparent via-rose-200/45 to-transparent" />
      {!locked&&<span className="prediction-choice-cta">Choose</span>}
      {myPrediction==="down"&&<span className="prediction-choice-selected">Selected</span>}
      <span className={`flex h-full flex-col items-center justify-center gap-1.5 px-3.5 ${locked?"pt-8 pb-3":"pt-8 pb-3"}`}>
        <span className="prediction-choice-icon border-rose-300/45 bg-rose-400/14 text-rose-100">
          <TrendingDown size={19} strokeWidth={2.7}/>
        </span>
        <span className={`text-[10px] font-mono uppercase tracking-[0.24em] ${myPrediction==="down"?"text-rose-100/92":"text-rose-100/78 group-hover:text-white"}`}>Below Base</span>
        <span className="text-[1.82rem] font-black tracking-[-0.05em] leading-none">SHORT</span>
        <span className={`text-[11px] font-semibold ${myPrediction==="down"?"text-rose-100/82":"text-white/58 group-hover:text-white/76"}`}>BTC closes lower</span>
      </span>
    </button>
  </div>;
}
