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

  useEffect(()=>{if(phase!=="matching")return;setCd(15);const t=setInterval(()=>setCd(c=>{if(c<=1){clearInterval(t);return 0}return c-1}),1000);return()=>clearInterval(t)},[phase]);

  useEffect(()=>{const u=[
    on("match:update",d=>setMatch({current:d.current})),
    on("match:full",d=>{setErr(null);setMatch({current:d.current||d.total||szRef.current});setPhase("preparing")}),
    on("match:found",d=>{setPending(d);if(shouldUseMockPayment){mockPay().then(()=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId,mode:"random",teamSize:d.teamSize||szRef.current,players:d.players,phase:"predicting"});nav("/game");})}else setPhase("payment")}),
    on("match:failed",()=>{setErr("No opponents found. Try again.");setPending(null);setMatch({current:0});setPhase("select")}),
    on("match:error",d=>{setErr(d.message);setPending(null);setMatch({current:0});setPhase("select")}),
  ];return()=>u.forEach(f=>f())},[on,shouldUseMockPayment,mockPay,updateGame,nav]);

  const start=()=>{if(!wallet){connect();return}setPending(null);setErr(null);setPhase("matching");setMatch({current:1});emit("match:join",{teamSize:sz})};
  const cancel=()=>{emit("match:cancel");setPending(null);setMatch({current:0});setPhase("select")};
  const pay=useCallback(async()=>{if(!pending)return;try{await payForGame(pending.chainGameId);updateGame({gameId:pending.gameId,chainGameId:pending.chainGameId,mode:"random",teamSize:pending.teamSize||szRef.current,players:pending.players,phase:"predicting"});nav("/game")}catch(e){setErr(e?.message||"Payment failed");setPhase("select")}},[pending,payForGame,updateGame,nav]);

  return<div className="page-container">
    <button onClick={()=>{if(phase==="matching")emit("match:cancel");nav("/")}} className="text-white/15 hover:text-white/30 text-xs mb-4 transition">← Back</button>
    <h2 className="text-xl font-black mb-4 flex items-center gap-2"><span className="text-2xl">⚔️</span>Random Battle</h2>
    {err&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-xl mb-3 text-[11px]">{err}</div>}
    {phase==="select"&&<div><p className="text-white/20 text-xs mb-2">Team size</p><div className="grid grid-cols-4 gap-2 mb-4">{TEAM_SIZES.map(s=><button key={s} onClick={()=>setSz(s)} className={`py-3.5 rounded-xl font-black text-lg transition-all ${sz===s?"bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-orange-500/15 -translate-y-0.5":"bg-white/[0.02] border border-white/[0.05] text-white/20"}`}>{s}P</button>)}</div><button onClick={start} className="btn-primary w-full py-3.5 font-black">Find Match</button></div>}
    {phase==="matching"&&<div><div className="card"><MatchAnimation teamSize={sz} current={match.current} countdown={cd} status="matching"/></div><button onClick={cancel} className="w-full mt-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition text-[10px] text-white/20">Cancel</button></div>}
    {phase==="preparing"&&<div><div className="card"><MatchAnimation teamSize={sz} current={sz} status="preparing"/></div><p className="mt-3 text-center text-[10px] text-white/25">Players are locked in. Preparing the payment step now.</p></div>}
    <PaymentModal visible={phase==="payment"} onConfirm={pay} onCancel={()=>{setPhase("select");setPending(null)}} loading={loading}/>
  </div>;
}
