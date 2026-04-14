import{useState,useEffect,useCallback}from"react";import{useNavigate}from"react-router-dom";
import{useSocket}from"../hooks/useSocket";import{useGame}from"../context/GameContext";import{useWallet}from"../context/WalletContext";import{useContract}from"../hooks/useContract";
import{TeamSlots,PaymentModal}from"../components";import{TEAM_SIZES,ENTRY_FEE,PAYMENT_TIMEOUT}from"../config/constants";
export default function CreateRoom(){
  const nav=useNavigate();const{emit,on}=useSocket();const{updateGame}=useGame();
  const{wallet,refund}=useWallet();const{mockPay,loading}=useContract();
  const[phase,setPhase]=useState("select");const[sz,setSz]=useState(2);
  const[code,setCode]=useState("");const[room,setRoom]=useState({current:0,players:[]});
  const[err,setErr]=useState(null);const[copied,setCopied]=useState(false);const[paid,setPaid]=useState(false);
  const[roomFullInfo,setRoomFullInfo]=useState(null);
  const[paymentProgress,setPaymentProgress]=useState({paidCount:0,total:0});

  // Countdown timers
  const[roomExpiresAt,setRoomExpiresAt]=useState(null);
  const[roomCountdown,setRoomCountdown]=useState(null);
  const[paymentStartedAt,setPaymentStartedAt]=useState(null);
  const[paymentCountdown,setPaymentCountdown]=useState(null);

  // Room expiry countdown
  useEffect(()=>{
    if(!roomExpiresAt||phase!=="waiting"){setRoomCountdown(null);return;}
    const tick=()=>{const rem=Math.max(0,Math.ceil((roomExpiresAt-Date.now())/1000));setRoomCountdown(rem);if(rem<=0)clearInterval(iv);};
    tick();const iv=setInterval(tick,1000);return()=>clearInterval(iv);
  },[roomExpiresAt,phase]);

  // Payment countdown
  useEffect(()=>{
    if(!paymentStartedAt){setPaymentCountdown(null);return;}
    const tick=()=>{const rem=Math.max(0,Math.ceil((paymentStartedAt+PAYMENT_TIMEOUT*1000-Date.now())/1000));setPaymentCountdown(rem);if(rem<=0)clearInterval(iv);};
    tick();const iv=setInterval(tick,1000);return()=>clearInterval(iv);
  },[paymentStartedAt]);

  useEffect(()=>{const u=[
    on("room:created",d=>{setCode(d.inviteCode);setRoomExpiresAt(d.expiresAt);setRoom({current:1,players:[wallet]});setPhase("waiting");}),
    on("room:update",d=>{setRoom({current:d.current,players:d.players});if(d.expiresAt)setRoomExpiresAt(d.expiresAt);}),
    on("room:full",d=>{
      setRoomFullInfo(d);setPaymentProgress({paidCount:0,total:d.players.length});
      setPaymentStartedAt(Date.now());setRoomExpiresAt(null);setRoomCountdown(null);
      setPhase("payment");
    }),
    on("room:error",d=>setErr(d.message)),
    on("room:dissolved",d=>{if(paid){refund(ENTRY_FEE);setPaid(false);}setPhase("select");setRoomExpiresAt(null);setPaymentStartedAt(null);}),
    on("room:expired",()=>{setRoomExpiresAt(null);setRoomCountdown(null);setPhase("expired");}),
    on("room:payment:update",d=>{setPaymentProgress({paidCount:d.paidCount,total:d.total});}),
    on("room:payment:failed",d=>{if(paid){refund(ENTRY_FEE);setPaid(false);}setPaymentStartedAt(null);setRoomFullInfo(null);setErr(d?.reason||"Payment timeout — team disbanded");setPhase("select");}),
    on("game:start",d=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players.length,players:d.players,phase:"predicting",basePrice:d.basePrice,countdown:Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null});setPaymentStartedAt(null);setTimeout(()=>nav("/game"),500);}),
  ];return()=>u.forEach(f=>f());},[on,sz,code,updateGame,nav,paid,refund,wallet]);

  const create=()=>{setErr(null);emit("room:create",{teamSize:sz});};
  const payRoom=useCallback(async()=>{try{await mockPay();setPaid(true);if(roomFullInfo){emit("room:payment:confirm",{gameId:roomFullInfo.gameId,inviteCode:code});setPhase("paid_waiting");}}catch{setErr("Payment failed");}},[mockPay,roomFullInfo,code,emit]);
  const cancel=()=>{emit("room:dissolve",{inviteCode:code});setPhase("select");setRoomExpiresAt(null);setPaymentStartedAt(null);};
  const dissolve=()=>{emit("room:dissolve",{inviteCode:code});if(paid){refund(ENTRY_FEE);setPaid(false);}setPhase("select");setRoomExpiresAt(null);setPaymentStartedAt(null);};
  const clearExpired=()=>{setPhase("select");setCode("");setRoom({current:0,players:[]});setErr(null);};
  const cp=()=>{navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const fmtCountdown=(s)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  return<div className="page-container">
    <button onClick={()=>nav("/")} className="text-white/15 hover:text-white/30 text-xs mb-4 transition">← Back</button>
    <h2 className="text-xl font-black mb-4 flex items-center gap-2"><span className="text-2xl">🏟️</span>Create Arena</h2>
    {err&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-xl mb-3 text-[11px]">{err}</div>}
    {phase==="select"&&<div><p className="text-white/20 text-xs mb-2">Team size</p><div className="grid grid-cols-4 gap-2 mb-4">{TEAM_SIZES.map(s=><button key={s} onClick={()=>setSz(s)} className={`py-3.5 rounded-xl font-black text-lg transition-all ${sz===s?"bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-orange-500/15 -translate-y-0.5":"bg-white/[0.02] border border-white/[0.05] text-white/20 hover:bg-white/[0.04]"}`}>{s}P</button>)}</div><button onClick={create} className="btn-primary w-full py-3.5 font-black">Create Arena</button></div>}
    <PaymentModal visible={phase==="payment"} onConfirm={payRoom} onCancel={cancel} loading={loading} title="Room Full — Pay to Start" subtitle={`All ${paymentProgress.total} players joined! Pay 1 USDC to start.`} hint={`${paymentProgress.paidCount}/${paymentProgress.total} paid`} countdown={paymentCountdown}/>
    {(phase==="waiting"||phase==="paid_waiting")&&<div className="card text-center glow-orange">
      <p className="text-white/15 text-[8px] uppercase tracking-[0.3em] mb-2">Arena Code</p>
      <div className="mb-2"><span className="text-3xl font-mono font-black tracking-[0.4em] text-gradient">{code}</span></div>
      <button onClick={cp} className={`text-[9px] px-3 py-1 rounded-full transition mb-3 ${copied?"bg-emerald-500/15 text-emerald-400":"bg-white/[0.03] text-white/20 hover:text-white/30"}`}>{copied?"✓ Copied":"📋 Copy Code"}</button>
      <p className="text-white/10 text-[9px] mb-3">Share this code with your opponents</p>
      <TeamSlots total={sz} players={room.players} current={room.current}/>
      <div className="mt-2 inline-block bg-white/[0.015] border border-white/[0.04] rounded-full px-3 py-1"><span className="text-white/30 text-xs font-mono">{paid&&paymentProgress.total?`${paymentProgress.paidCount}/${paymentProgress.total} paid`:`${room.current}/${sz}`}</span><span className="text-white/15 text-[10px] ml-1">ready</span></div>
      {roomCountdown!==null&&roomCountdown>0&&room.current<sz&&(
        <div className={`mt-2 flex items-center justify-center gap-1.5 ${roomCountdown<=30?"text-rose-400":"text-amber-400"}`}>
          <span className="text-sm">⏱️</span><span className="text-sm font-mono font-bold">{fmtCountdown(roomCountdown)}</span>
          <span className="text-[9px] text-white/25 ml-1">remaining</span>
        </div>
      )}
      {paymentCountdown!==null&&paymentCountdown>0&&phase==="paid_waiting"&&(
        <div className={`mt-2 flex items-center justify-center gap-1.5 ${paymentCountdown<=10?"text-rose-400":"text-amber-400"}`}>
          <span className="text-sm">💰</span><span className="text-sm font-mono font-bold">{paymentCountdown}s</span>
          <span className="text-[9px] text-white/25 ml-1">payment countdown</span>
        </div>
      )}
      <button onClick={dissolve} className="mt-4 w-full py-2 rounded-xl bg-white/[0.015] border border-white/[0.04] hover:bg-rose-500/[0.06] hover:border-rose-500/15 hover:text-rose-400 transition text-[10px] text-white/20">Cancel</button>
    </div>}
    {phase==="expired"&&<div className="card text-center">
      <p className="text-white/15 text-[8px] uppercase tracking-[0.3em] mb-2">Arena Code</p>
      <div className="mb-2"><span className="text-3xl font-mono font-black tracking-[0.4em] text-white/15 line-through">{code}</span></div>
      <p className="text-rose-400 text-xs mb-3">Room expired — team not filled in time</p>
      <button onClick={clearExpired} className="w-full py-2.5 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 text-white font-bold text-sm shadow-lg shadow-rose-500/20 hover:shadow-rose-500/30 transition">Expired</button>
    </div>}
  </div>;
}
