import{useState,useEffect,useCallback,useRef}from"react";import{useNavigate}from"react-router-dom";
import{useSocket}from"../hooks/useSocket";import{useGame}from"../context/GameContext";import{useWallet}from"../context/WalletContext";import{useContract}from"../hooks/useContract";
import{MatchAnimation,PaymentModal}from"../components";import{TEAM_SIZES}from"../config/constants";
export default function RandomMatch(){
  const nav=useNavigate();const{emit,on}=useSocket();const{updateGame}=useGame();
  const{mockMode,wallet,connect}=useWallet();const{payForGame,mockPay,loading,shouldUseMockPayment}=useContract();
  const[phase,setPhase]=useState("select");const[sz,setSz]=useState(2);
  const[match,setMatch]=useState({current:0});const[cd,setCd]=useState(15);
  const[pending,setPending]=useState(null);const[err,setErr]=useState(null);
  const szRef=useRef(sz);szRef.current=sz;
  const phaseRef=useRef(phase);phaseRef.current=phase;

  const resetMatch=useCallback((message=null,{cancelQueue=false}={})=>{
    if(cancelQueue)emit("match:cancel");
    setPending(null);
    setMatch({current:0});
    setPhase("select");
    setErr(message);
  },[emit]);

  useEffect(()=>{if(phase!=="matching")return;setCd(15);const t=setInterval(()=>setCd(c=>{if(c<=1){clearInterval(t);return 0}return c-1}),1000);return()=>clearInterval(t)},[phase]);

  useEffect(()=>{const u=[
    on("match:update",d=>{setMatch({current:d.current});if(typeof d.remaining==="number")setCd(d.remaining)}),
    on("match:full",d=>{setErr(null);setMatch({current:d.current||d.total||szRef.current});setPhase("preparing")}),
    on("match:found",d=>{setPending(d);if(shouldUseMockPayment){mockPay().then(()=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId,mode:"random",teamSize:d.teamSize||szRef.current,players:d.players,phase:"predicting"});nav("/game");})}else setPhase("payment")}),
    on("match:failed",()=>resetMatch("No opponents found. Try again.")),
    on("match:error",d=>resetMatch(d.message)),
    on("disconnect",()=>{
      if(phaseRef.current==="matching"||phaseRef.current==="preparing"){
        resetMatch("Connection lost during matchmaking. Please try again.");
      }
    }),
  ];return()=>u.forEach(f=>f())},[on,shouldUseMockPayment,mockPay,updateGame,nav,resetMatch]);

  useEffect(()=>{
    if(phase!=="matching"||cd!==0)return;
    const timer=setTimeout(()=>{
      if(phaseRef.current==="matching"){
        resetMatch("No opponents found. Try again.",{cancelQueue:true});
      }
    },1200);
    return()=>clearTimeout(timer);
  },[phase,cd,resetMatch]);

  const start=()=>{if(!wallet){connect();return}setPending(null);setErr(null);setPhase("matching");setMatch({current:1});emit("match:join",{teamSize:sz})};
  const cancel=()=>resetMatch(null,{cancelQueue:true});
  const pay=useCallback(async()=>{if(!pending)return;try{await payForGame(pending.chainGameId);updateGame({gameId:pending.gameId,chainGameId:pending.chainGameId,mode:"random",teamSize:pending.teamSize||szRef.current,players:pending.players,phase:"predicting"});nav("/game")}catch(e){setErr(e?.message||"Payment failed");setPhase("select")}},[pending,payForGame,updateGame,nav]);

  return<div className="page-container">
    <button onClick={()=>{if(phase==="matching")emit("match:cancel");nav("/")}} className="text-white/15 hover:text-white/30 text-xs mb-4 transition">← Back</button>
    <h2 className="text-xl font-black mb-4 flex items-center gap-2"><span className="text-2xl">⚔️</span>Random Battle</h2>
    {err&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-xl mb-3 text-[11px]">{err}</div>}
    {phase==="select"&&<div><p className="text-white/20 text-xs mb-2">Team size</p><div className="grid grid-cols-4 gap-2 mb-4">{TEAM_SIZES.map(s=><button key={s} onClick={()=>setSz(s)} className={`py-3.5 rounded-xl font-black text-lg transition-all ${sz===s?"bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-orange-500/15 -translate-y-0.5":"bg-white/[0.02] border border-white/[0.05] text-white/20"}`}>{s}P</button>)}</div><button onClick={start} className="btn-primary w-full py-3.5 font-black">Find Match</button></div>}
    {phase==="matching"&&<div><div className="card"><MatchAnimation teamSize={sz} current={match.current} countdown={cd} status="matching"/></div><button onClick={cancel} className="w-full mt-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition text-[10px] text-white/20">Cancel</button></div>}
    {phase==="preparing"&&<div><div className="card"><MatchAnimation teamSize={sz} current={sz} status="preparing"/></div><p className="mt-3 text-center text-[10px] text-white/25">Players are locked in. Preparing the payment step now.</p></div>}
    <PaymentModal
      visible={phase==="payment"||phase==="preparing"}
      onConfirm={pay}
      onCancel={()=>{setPhase("select");setPending(null)}}
      loading={loading}
      mode={phase==="preparing"?"preparing":"confirm"}
      title={phase==="preparing"?"Match Found":"Enter Match"}
      subtitle={phase==="preparing"?`All ${match.current||sz} players are ready. We're preparing the payment step now.`:"Pay entry fee to enter this match"}
      actionLabel="Pay 1 USDC"
      amount="1 USDC"
      hint={phase==="preparing"?"Creating the on-chain match now. This dialog will switch to `Pay 1 USDC` automatically as soon as setup finishes.":shouldUseMockPayment?"Local mock payment enabled for this environment.":"You'll confirm this payment in your wallet."}
      totalCount={phase==="preparing"?(match.current||sz):(pending?.players?.length||0)}
    />
  </div>;
}
