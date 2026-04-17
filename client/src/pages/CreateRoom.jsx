import{useState,useEffect,useCallback,useRef}from"react";import{useNavigate}from"react-router-dom";
import{useSocket}from"../hooks/useSocket";import{useGame}from"../context/GameContext";import{useWallet}from"../context/WalletContext";import{useContract}from"../hooks/useContract";
import{TeamSlots,PaymentModal}from"../components";import{TEAM_SIZES,ENTRY_FEE,PAYMENT_TIMEOUT}from"../config/constants";
export default function CreateRoom(){
  const nav=useNavigate();const{emit,on}=useSocket();const{updateGame}=useGame();
  const{wallet,refund}=useWallet();const{payForRoomEntry,loading}=useContract();
  const[phase,setPhase]=useState("select");const[sz,setSz]=useState(2);
  const[code,setCode]=useState("");const[room,setRoom]=useState({current:0,players:[]});
  const[err,setErr]=useState(null);const[copied,setCopied]=useState(false);const[paid,setPaid]=useState(false);
  const[hint,setHint]=useState(null);
  const[roomFullInfo,setRoomFullInfo]=useState(null);
  const[paymentProgress,setPaymentProgress]=useState({paidCount:0,total:0});
  const cancelPending=useRef(false);
  const phaseBeforeCancel=useRef("select");

  // Countdown timers
  const[roomExpiresAt,setRoomExpiresAt]=useState(null);
  const[roomCountdown,setRoomCountdown]=useState(null);
  const[paymentStartedAt,setPaymentStartedAt]=useState(null);
  const[paymentCountdown,setPaymentCountdown]=useState(null);

  const openPayment=(d={})=>{
    const total=Number(d?.total||d?.players?.length||0);
    const players=Array.isArray(d?.players)?d.players:[];
    if(!total)return;
    setRoomFullInfo(prev=>({
      gameId:d?.gameId||prev?.gameId||null,
      chainGameId:d?.chainGameId||prev?.chainGameId||null,
      inviteCode:d?.inviteCode||prev?.inviteCode||code,
      maxPlayers:d?.total||prev?.maxPlayers||total,
      owner:d?.owner||prev?.owner||wallet||null,
      auth:d?.auth||prev?.auth||null,
      players:players.length?players:(prev?.players||[]),
      paymentTimeout:d?.paymentTimeout||prev?.paymentTimeout||PAYMENT_TIMEOUT*1000,
    }));
    setPaymentProgress(prev=>({paidCount:prev?.paidCount||0,total}));
    setPaymentStartedAt(prev=>prev||Date.now());
    setRoomExpiresAt(null);
    setRoomCountdown(null);
    if(players.length)setRoom({current:total,players});
    setPhase(current=>current==="waiting"||current==="creating"||current==="preparing"?"payment":current);
  };

  const handlePaymentFailure=useCallback((reason="Payment timeout — team disbanded")=>{
    if(paid){refund(ENTRY_FEE);setPaid(false);}
    setPaymentStartedAt(null);
    setRoomFullInfo(null);
    setHint(null);
    setErr(reason);
    setPhase("select");
  },[paid,refund]);

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
    on("room:created",d=>{cancelPending.current=false;phaseBeforeCancel.current="select";setHint(null);setCode(d.inviteCode);setRoomExpiresAt(d.expiresAt);setRoom({current:1,players:[wallet]});setPhase("waiting");}),
    on("room:update",d=>{setRoom({current:d.current,players:d.players});if(d.expiresAt)setRoomExpiresAt(d.expiresAt);if(d.status==="full"||(d.total&&d.current>=d.total))openPayment(d);}),
    on("room:full",d=>{openPayment(d);}),
    on("room:payment:opened",d=>{setRoomFullInfo(prev=>prev?{...prev,chainGameId:d.chainGameId||prev.chainGameId}:prev);}),
    on("room:error",d=>{if(cancelPending.current){cancelPending.current=false;setPhase(phaseBeforeCancel.current==="paid_waiting"?"paid_waiting":"waiting");}setHint(null);setErr(d.message);}),
    on("room:dissolved",d=>{const selfCancelled=cancelPending.current;cancelPending.current=false;phaseBeforeCancel.current="select";setHint(null);if(paid){refund(ENTRY_FEE);setPaid(false);}setErr(selfCancelled?null:(d?.reason||null));setCode("");setRoom({current:0,players:[]});setPhase("select");setRoomExpiresAt(null);setRoomCountdown(null);setPaymentStartedAt(null);setPaymentCountdown(null);setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});}),
    on("room:expired",()=>{setRoomExpiresAt(null);setRoomCountdown(null);setPhase("expired");}),
    on("room:payment:update",d=>{setPaymentProgress({paidCount:d.paidCount,total:d.total});}),
    on("room:payment:failed",d=>{handlePaymentFailure(d?.reason||"Payment timeout — team disbanded");}),
    on("game:start",d=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players.length,players:d.players,phase:"predicting",basePrice:d.basePrice,countdown:Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null});setPaymentStartedAt(null);setTimeout(()=>nav("/game"),500);}),
  ];return()=>u.forEach(f=>f());},[on,sz,code,updateGame,nav,handlePaymentFailure,wallet]);

  useEffect(()=>{
    if(paymentCountdown!==0)return;
    if(phase!=="payment"&&phase!=="paid_waiting")return;
    const timer=setTimeout(()=>{
      if(phase==="payment"||phase==="paid_waiting")handlePaymentFailure("Payment timeout — team disbanded");
    },1200);
    return()=>clearTimeout(timer);
  },[paymentCountdown,phase,handlePaymentFailure]);

  const create=()=>{cancelPending.current=false;phaseBeforeCancel.current="select";setErr(null);setHint(null);emit("room:create",{teamSize:sz});};
  const payRoom=useCallback(async()=>{try{const paymentResult=await payForRoomEntry({inviteCode:code,maxPlayers:roomFullInfo?.maxPlayers||sz,isOwner:true,auth:roomFullInfo?.auth});if(paymentResult?.approved&&!paymentResult?.paid)return;if(roomFullInfo&&paymentResult?.chainGameId){setRoomFullInfo(prev=>prev?{...prev,chainGameId:paymentResult.chainGameId}:prev);}setPaid(true);if(roomFullInfo){emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:paymentResult?.chainGameId||roomFullInfo.chainGameId||null,inviteCode:code,wallet});setPhase("paid_waiting");}}catch(e){setErr(e?.message||"Payment failed");}},[payForRoomEntry,roomFullInfo,code,emit,sz,wallet]);
  const beginCancel=()=>{cancelPending.current=true;phaseBeforeCancel.current=phase;setErr(null);setHint("Cancelling room...");setRoomCountdown(null);emit("room:dissolve",{inviteCode:code});setPhase("dissolving");};
  const cancel=()=>{beginCancel();};
  const dissolve=()=>{beginCancel();};
  const clearExpired=()=>{setPhase("select");setCode("");setRoom({current:0,players:[]});setErr(null);};
  const cp=()=>{navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const fmtCountdown=(s)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  return<div className="page-container">
    <button onClick={()=>nav("/")} className="text-white/15 hover:text-white/30 text-xs mb-4 transition">← Back</button>
    <h2 className="text-xl font-black mb-4 flex items-center gap-2"><span className="text-2xl">🏟️</span>Create Arena</h2>
    {err&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-xl mb-3 text-[11px]">{err}</div>}
    {hint&&<div className="bg-white/[0.03] border border-white/[0.06] text-white/45 px-3 py-2 rounded-xl mb-3 text-[11px]">{hint}</div>}
    {phase==="select"&&<div><p className="text-white/20 text-xs mb-2">Team size</p><div className="grid grid-cols-4 gap-2 mb-4">{TEAM_SIZES.map(s=><button key={s} onClick={()=>setSz(s)} className={`py-3.5 rounded-xl font-black text-lg transition-all ${sz===s?"bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-orange-500/15 -translate-y-0.5":"bg-white/[0.02] border border-white/[0.05] text-white/20 hover:bg-white/[0.04]"}`}>{s}P</button>)}</div><button onClick={create} className="btn-primary w-full py-3.5 font-black">Create Arena</button></div>}
    <PaymentModal visible={phase==="payment"} onConfirm={payRoom} onCancel={cancel} loading={loading} title="Room Full — Pay to Start" subtitle={`All ${paymentProgress.total} players joined! Pay 1 USDC to start.`} hint={`${paymentProgress.paidCount}/${paymentProgress.total} paid`} countdown={paymentCountdown}/>
    {phase==="dissolving"&&<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin mb-3"/><p className="text-white/40 text-xs">Cancelling room...</p></div>}
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
