import{useState,useEffect,useCallback}from"react";import{useNavigate}from"react-router-dom";
import{useSocket}from"../hooks/useSocket";import{useGame}from"../context/GameContext";import{useWallet}from"../context/WalletContext";import{useContract}from"../hooks/useContract";
import{TeamSlots,PaymentModal}from"../components";import{ENTRY_FEE,PAYMENT_TIMEOUT}from"../config/constants";
export default function JoinRoom(){
  const nav=useNavigate();const{emit,on}=useSocket();const{updateGame}=useGame();
  const{wallet,connect,refund}=useWallet();const{mockPay,loading}=useContract();
  const[phase,setPhase]=useState("input");const[code,setCode]=useState("");
  const[room,setRoom]=useState({current:0,total:0,players:[]});const[err,setErr]=useState(null);const[paid,setPaid]=useState(false);
  const[validInfo,setValidInfo]=useState(null);
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
    on("room:valid",d=>{setValidInfo(d);setPhase("confirm");}),
    on("room:invalid",d=>{setErr(d.message);setPhase("input");}),
    on("room:joined",d=>{
      if(d.error){setErr(d.error);setPhase("input");return;}
      setRoom({current:d.current,total:d.total,players:d.players});
      if(d.expiresAt)setRoomExpiresAt(d.expiresAt);
      setPhase("waiting");
    }),
    on("room:update",d=>{
      setRoom({current:d.current,total:d.total,players:d.players});
      if(d.expiresAt)setRoomExpiresAt(d.expiresAt);
    }),
    on("room:full",d=>{
      setRoomFullInfo(d);setPaymentProgress({paidCount:0,total:d.players.length});
      setPaymentStartedAt(Date.now());setRoomExpiresAt(null);setRoomCountdown(null);
      setPhase("payment");
    }),
    on("room:error",d=>{setErr(d.message);if(paid){refund(ENTRY_FEE);setPaid(false);}setPhase("input");}),
    on("room:dissolved",d=>{if(paid){refund(ENTRY_FEE);setPaid(false);}setErr(d.reason);setPhase("input");setRoomExpiresAt(null);setPaymentStartedAt(null);}),
    on("room:expired",()=>{setRoomExpiresAt(null);setRoomCountdown(null);setErr("Room expired — team not filled in time");setPhase("input");}),
    on("room:payment:update",d=>{setPaymentProgress({paidCount:d.paidCount,total:d.total});}),
    on("room:payment:failed",d=>{if(paid){refund(ENTRY_FEE);setPaid(false);}setPaymentStartedAt(null);setRoomFullInfo(null);setErr(d?.reason||"Payment timeout — team disbanded");setPhase("input");}),
    on("game:start",d=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players.length,players:d.players,phase:"predicting",basePrice:d.basePrice,countdown:Math.round((d.predictTimeout||20000)/1000)});setPaymentStartedAt(null);setTimeout(()=>nav("/game"),500);}),
  ];return()=>u.forEach(f=>f());},[on,code,updateGame,nav,paid,refund]);

  const join=()=>{if(!wallet){connect();return;}if(code.length<6)return setErr("Enter complete 6-digit code");setErr(null);emit("room:validate",{inviteCode:code.toUpperCase()});};
  const confirmJoin=()=>{emit("room:join",{inviteCode:code.toUpperCase()});setPhase("joining");};
  const payRoom=useCallback(async()=>{try{await mockPay();setPaid(true);if(roomFullInfo){emit("room:payment:confirm",{gameId:roomFullInfo.gameId,inviteCode:roomFullInfo.inviteCode||code});setPhase("paid_waiting");}}catch{setErr("Payment failed");}},[code,mockPay,emit,roomFullInfo]);
  const leave=()=>{emit("room:leave");if(paid){refund(ENTRY_FEE);setPaid(false);}setPhase("input");setRoomExpiresAt(null);};
  const fmtCountdown=(s)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  return<div className="page-container">
    <button onClick={()=>nav("/")} className="text-white/15 hover:text-white/30 text-xs mb-4 transition">← Back</button>
    <h2 className="text-xl font-black mb-4 flex items-center gap-2"><span className="text-2xl">🎯</span>Join Arena</h2>
    {err&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-xl mb-3 text-[11px]">{err}</div>}
    {phase==="input"&&<div>
      {!wallet&&<div className="bg-amber-500/[0.04] border border-amber-500/10 rounded-xl px-3 py-1.5 mb-3"><p className="text-amber-400/50 text-[9px]">Connect wallet first</p></div>}
      <p className="text-white/20 text-xs mb-2">Enter arena code</p>
      <input type="text" value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="6-digit code" maxLength={6} className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3.5 text-center text-2xl font-mono font-black tracking-[0.5em] text-orange-400 placeholder:text-white/[0.08] placeholder:tracking-normal placeholder:text-sm placeholder:font-normal focus:outline-none focus:border-orange-500/20 transition mb-3"/>
      <button onClick={join} disabled={code.length<6} className="btn-primary w-full py-3.5 font-black disabled:!opacity-15">Challenge</button>
    </div>}
    {/* Confirm dialog — no payment, just confirm joining */}
    {phase==="confirm"&&<div className="card text-center">
      <p className="text-white/40 text-xs mb-3">Join arena with code</p>
      <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 mb-3">
        <span className="text-2xl font-mono font-black tracking-[0.4em] text-gradient">{code}</span>
      </div>
      <p className="text-white/25 text-[10px] mb-4">{validInfo?`${validInfo.current}/${validInfo.total} players in room`:""}</p>
      <div className="flex gap-2">
        <button onClick={()=>{setPhase("input");setValidInfo(null);}} className="flex-1 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] text-white/30 text-xs transition">Cancel</button>
        <button onClick={confirmJoin} className="flex-1 btn-primary !py-2.5 !text-sm font-bold">Join</button>
      </div>
    </div>}
    {phase==="joining"&&<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-orange-400/30 border-t-orange-400 animate-spin mb-3"/><p className="text-white/40 text-xs">Joining arena...</p></div>}
    <PaymentModal visible={phase==="payment"} onConfirm={payRoom} onCancel={leave} loading={loading} title="Room Full — Pay to Start" subtitle={`All ${paymentProgress.total} players joined! Pay 1 USDC to start.`} hint={`${paymentProgress.paidCount}/${paymentProgress.total} paid`} countdown={paymentCountdown}/>
    {(phase==="waiting"||phase==="paid_waiting")&&<div className="card text-center">
      <p className="text-white/20 text-xs mb-1">Joined Arena</p>
      <p className="text-xl font-mono font-black text-gradient tracking-widest mb-3">{code}</p>
      <TeamSlots total={room.total} players={room.players}/>
      <p className="text-white/20 text-[10px] mt-2">{paid&&paymentProgress.total?`${paymentProgress.paidCount}/${paymentProgress.total} paid`:`Waiting for opponents... (${room.current}/${room.total})`}</p>
      {roomCountdown!==null&&roomCountdown>0&&room.current<room.total&&(
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
      <button onClick={leave} className="mt-4 w-full py-2 rounded-xl bg-white/[0.015] border border-white/[0.04] hover:bg-rose-500/[0.06] hover:text-rose-400 transition text-[10px] text-white/20">Leave</button>
    </div>}
  </div>;
}
