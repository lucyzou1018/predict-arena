import{useState,useEffect}from"react";import{useNavigate}from"react-router-dom";
import{useSocket}from"../hooks/useSocket";import{useGame}from"../context/GameContext";
import{PredictButtons,CountdownRing,SettlementReveal}from"../components";
import{PREDICT_TIMEOUT,SETTLE_DELAY}from"../config/constants";
export default function GamePlay(){
  const nav=useNavigate();const{on,emit}=useSocket();const{gameState}=useGame();
  const[phase,setPhase]=useState("waiting");const[cd,setCd]=useState(PREDICT_TIMEOUT);
  const[myPred,setMyPred]=useState(null);const[predCount,setPredCount]=useState(0);
  const[basePrice,setBasePrice]=useState(0);const[curPrice,setCurPrice]=useState(0);
  const[result,setResult]=useState(null);const[gid,setGid]=useState(gameState.gameId);
  const[total,setTotal]=useState(gameState.players?.length||0);

  useEffect(()=>{const u=[
    on("game:start",d=>{setGid(d.gameId||gameState.gameId);setBasePrice(d.basePrice);setCurPrice(d.basePrice);setTotal(d.players?.length||0);setPhase("predicting");setCd(Math.round((d.predictTimeout||20000)/1000));setMyPred(null);setPredCount(0)}),
    on("game:countdown",d=>{setCd(d.remaining);if(d.currentPrice)setCurPrice(d.currentPrice);if(d.phase==="settling"&&phase!=="settling"&&phase!=="result")setPhase("settling")}),
    on("game:prediction",d=>setPredCount(d.totalPredicted)),
    on("game:predicted",d=>setMyPred(d.prediction)),
    on("game:phase",d=>{if(d.phase==="settling"){setPhase("settling");setCd(Math.round((d.settleDelay||10000)/1000))}}),
    on("game:result",d=>{setPhase("result");setResult(d)}),
    on("game:error",d=>{alert(d.message);nav("/")}),
  ];return()=>u.forEach(f=>f())},[on,nav,gameState]);

  const predict=p=>{emit("game:predict",{gameId:gid||gameState.gameId,prediction:p});setMyPred(p)};
  const diff=curPrice&&basePrice?curPrice-basePrice:0;
  const pct=basePrice?((diff/basePrice)*100).toFixed(3):"0";
  const pc=diff>0?"text-emerald-400":diff<0?"text-rose-400":"text-white/30";

  return<div className="page-container flex flex-col items-center">
    {phase==="waiting"&&<div className="text-center pt-12 animate-slideUp"><div className="text-5xl mb-3 animate-float">⚔️</div><h3 className="text-xl font-black text-gradient mb-1">Preparing Battle</h3><p className="text-white/15 text-xs">Starting when all players are ready</p></div>}

    {phase==="predicting"&&<div className="w-full max-w-3xl animate-slideUp">
      <div className="card mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-white/20 text-[10px] uppercase tracking-[0.25em] mb-1">Battle In Progress</p>
            <h3 className="text-lg font-black">Make your prediction</h3>
            <p className="text-white/35 text-xs mt-1">Choose LONG if you think BTC will finish above the base price, or SHORT if you think it will finish below.</p>
          </div>
          <CountdownRing total={PREDICT_TIMEOUT} remaining={cd} label="Time Left" size="lg"/>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 text-center">
            <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-1">Base Price</p>
            <p className="text-2xl font-mono font-black text-gradient">${basePrice.toLocaleString("en-US",{minimumFractionDigits:2})}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 text-center">
            <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-1">Live Price</p>
            <p className={`text-2xl font-mono font-black ${pc}`}>${curPrice.toLocaleString("en-US",{minimumFractionDigits:2})}</p>
            <p className={`text-[11px] font-mono mt-1 ${pc}`}>{diff>=0?"+":""}{diff.toFixed(2)} ({pct}%)</p>
          </div>
        </div>
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/25 text-xs">Players ready</p>
            <p className="text-white/40 text-xs font-mono">{predCount}/{total}</p>
          </div>
          <PredictButtons onPredict={predict} myPrediction={myPred} disabled={false}/>
        </div>
        {myPred&&<div className={`rounded-2xl border p-4 text-center ${myPred==="up"?"bg-emerald-500/[0.06] border-emerald-500/20":"bg-rose-500/[0.06] border-rose-500/20"}`}>
          <p className="text-white/25 text-[10px] uppercase tracking-[0.2em] mb-1">Your Position</p>
          <p className={`text-2xl font-black ${myPred==="up"?"text-emerald-400":"text-rose-400"}`}>{myPred==="up"?"📈 LONG":"📉 SHORT"}</p>
        </div>}
      </div>
    </div>}

    {phase==="settling"&&<div className="w-full max-w-2xl animate-slideUp"><div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[#22160f] via-[#17110d] to-[#120d0a] shadow-2xl shadow-orange-900/20 p-6 text-center"><div className="text-4xl mb-3 animate-float">⏳</div><h3 className="text-lg font-black text-white/80 mb-4">Settling...</h3><div className="flex justify-center mb-4"><CountdownRing total={SETTLE_DELAY} remaining={cd} label="Reveal" size="lg"/></div><div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4 text-center"><p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-1">Live Price</p><p className={`text-2xl font-mono font-black ${pc}`}>${curPrice.toLocaleString("en-US",{minimumFractionDigits:2})}</p><p className={`text-[11px] font-mono mt-1 ${pc}`}>{diff>=0?"+":""}{diff.toFixed(2)} ({pct}%)</p></div>{myPred&&<div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-3"><p className="text-white/25 text-[10px] uppercase tracking-[0.2em] mb-1">Your Call</p><p className={myPred==="up"?"text-emerald-400 font-black":"text-rose-400 font-black"}>{myPred==="up"?"LONG":"SHORT"}</p></div>}</div></div>}

    {phase==="result"&&result&&<div className="w-full max-w-2xl animate-slideUp"><div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[#22160f] via-[#17110d] to-[#120d0a] shadow-2xl shadow-orange-900/20 p-6"><div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4 mb-4"><SettlementReveal basePrice={result.basePrice} settlementPrice={result.settlementPrice} direction={result.direction}/></div>{result.myResult&&<div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-5 text-center"><div className="text-4xl mb-2">{result.myResult.isCorrect?"🏆":"💀"}</div><h3 className={`text-xl font-black ${result.myResult.isCorrect?"text-emerald-400":"text-rose-400"}`}>{result.myResult.isCorrect?"Victory!":"Defeated"}</h3><p className="text-white/20 text-[10px] mt-1 mb-2">You predicted {result.myResult.prediction==="up"?"LONG":"SHORT"}</p><div className={`text-3xl font-black font-mono ${result.myResult.reward>0?"text-emerald-400":"text-rose-400"}`}>{result.myResult.reward>0?`+${result.myResult.reward.toFixed(4)}`:"-1.0000"} <span className="text-sm text-white/20">USDC</span></div></div>}<div className="flex gap-2 mt-4"><button onClick={()=>nav("/arena")} className="flex-1 py-2.5 rounded-xl bg-amber-500/[0.05] border border-amber-500/15 hover:bg-amber-500/[0.08] transition text-xs text-white/60">Battle</button><button onClick={()=>nav("/match")} className="flex-1 btn-primary !py-2.5 font-black !text-sm">Rematch</button></div></div></div>}
  </div>;
}
