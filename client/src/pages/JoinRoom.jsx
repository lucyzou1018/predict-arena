import{useState,useEffect,useCallback,useRef}from"react";import{useNavigate}from"react-router-dom";
import{useSocket}from"../hooks/useSocket";import{useGame}from"../context/GameContext";import{useWallet}from"../context/WalletContext";import{useContract}from"../hooks/useContract";
import{TeamSlots,PaymentModal}from"../components";import{ENTRY_FEE,PAYMENT_TIMEOUT}from"../config/constants";
import{useT}from"../context/LangContext";
export default function JoinRoom(){
  const nav=useNavigate();const{emit,on}=useSocket();const{updateGame}=useGame();
  const{wallet,connect,refund}=useWallet();const{payForRoomEntry,loading}=useContract();
  const t=useT();
  const[phase,setPhase]=useState("input");const[code,setCode]=useState("");
  const[room,setRoom]=useState({current:0,total:0,players:[]});const[err,setErr]=useState(null);const[paid,setPaid]=useState(false);
  const[validInfo,setValidInfo]=useState(null);
  const[roomFullInfo,setRoomFullInfo]=useState(null);
  const[paymentProgress,setPaymentProgress]=useState({paidCount:0,total:0});
  const[paymentTimeoutError,setPaymentTimeoutError]=useState(null);
  const resumeRequestAt=useRef(0);
  const paidRef=useRef(false);
  const confirmRetryRef=useRef({tries:0,timer:null});
  const paymentStartedAtRef=useRef(null);
  const isPaymentClosureReason=useCallback((reason="")=>/timed out|timeout|window closed|did not complete payment|room has been dissolved/i.test(String(reason)),[]);

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
      owner:d?.owner||prev?.owner||null,
      auth:d?.auth||prev?.auth||null,
      players:players.length?players:(prev?.players||[]),
      paymentTimeout:d?.paymentTimeout||prev?.paymentTimeout||PAYMENT_TIMEOUT*1000,
    }));
    setPaymentProgress(prev=>({paidCount:prev?.paidCount||0,total}));
    setPaymentStartedAt(prev=>prev||d?.paymentStartedAt||Date.now());
    setRoomExpiresAt(null);
    setRoomCountdown(null);
    if(players.length)setRoom({current:total,total:d?.total||total,players});
    setPhase(current=>{
      if(current!=="waiting"&&current!=="joining"&&current!=="preparing")return current;
      return "payment";
    });
  };

  const handlePaymentFailure=useCallback((reason=t("create.err.teamDisbanded"))=>{
    if(paid){refund(ENTRY_FEE);setPaid(false);}
    setPaymentStartedAt(null);
    setPaymentCountdown(null);
    setRoomFullInfo(null);
    setPaymentTimeoutError(reason);
    setErr(null);
    setPhase("input");
  },[paid,refund,t]);

  // Room expiry countdown
  useEffect(()=>{
    if(!roomExpiresAt||phase!=="waiting"){setRoomCountdown(null);return;}
    const tick=()=>{const rem=Math.max(0,Math.ceil((roomExpiresAt-Date.now())/1000));setRoomCountdown(rem);if(rem<=0)clearInterval(iv);};
    tick();const iv=setInterval(tick,1000);return()=>clearInterval(iv);
  },[roomExpiresAt,phase]);

  // Payment countdown
  useEffect(()=>{
    paymentStartedAtRef.current=paymentStartedAt;
    if(!paymentStartedAt){setPaymentCountdown(null);return;}
    const tick=()=>{const rem=Math.max(0,Math.ceil((paymentStartedAt+PAYMENT_TIMEOUT*1000-Date.now())/1000));setPaymentCountdown(rem);if(rem<=0)clearInterval(iv);};
    tick();const iv=setInterval(tick,1000);return()=>clearInterval(iv);
  },[paymentStartedAt]);

  useEffect(()=>{paidRef.current=paid;},[paid]);

  useEffect(()=>{const u=[
    on("room:valid",d=>{setValidInfo(d);setPhase("confirm");}),
    on("room:invalid",d=>{setErr(d.message);setPhase("input");}),
    on("room:joined",d=>{
      if(d.error){setErr(d.error);setPhase("input");return;}
      if(d.status==="full"){
        if(d.paymentOpen||d.chainGameId)openPayment(d);
        else setPhase(current=>current==="waiting"||current==="joining"?"preparing":current);
        return;
      }
      setRoom({current:d.current,total:d.total,players:d.players});
      if(d.expiresAt)setRoomExpiresAt(d.expiresAt);
      setPhase("waiting");
    }),
    on("room:update",d=>{
      setRoom({current:d.current,total:d.total,players:d.players});
      if(d.expiresAt)setRoomExpiresAt(d.expiresAt);
      if((d.status==="full"||(d.total&&d.current>=d.total))&&(d.paymentOpen||d.chainGameId))openPayment(d);
    }),
    on("room:preparing",d=>{setRoomFullInfo(prev=>({gameId:d?.gameId||prev?.gameId||null,chainGameId:d?.chainGameId||prev?.chainGameId||null,inviteCode:d?.inviteCode||prev?.inviteCode||code,maxPlayers:d?.total||prev?.maxPlayers||0,owner:d?.owner||prev?.owner||null,auth:null,players:Array.isArray(d?.players)?d.players:(prev?.players||[]),paymentTimeout:d?.timeoutMs||prev?.paymentTimeout||PAYMENT_TIMEOUT*1000}));setPaymentProgress({paidCount:0,total:d?.total||d?.players?.length||0});setPaymentStartedAt(null);setRoomExpiresAt(null);setRoomCountdown(null);setPhase(current=>current==="waiting"||current==="joining"?"preparing":current);}),
    on("room:full",d=>{if(d.paymentOpen||d.chainGameId)openPayment(d);else setPhase(current=>current==="waiting"||current==="joining"?"preparing":current);}),
    on("room:payment:opened",d=>{openPayment(d);}),
    on("room:error",d=>{
      const msg=d?.message||"";
      const isRpcLike=/rpc|timed out|syncing|not confirmed/i.test(msg);
      if(paidRef.current&&isRpcLike&&roomFullInfo){
        const tries=confirmRetryRef.current.tries||0;
        if(tries<5){
          confirmRetryRef.current.tries=tries+1;
          if(confirmRetryRef.current.timer)clearTimeout(confirmRetryRef.current.timer);
          confirmRetryRef.current.timer=setTimeout(()=>{
            emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:roomFullInfo.chainGameId||null,inviteCode:roomFullInfo.inviteCode||code,wallet});
          },2000);
          return;
        }
      }
      setErr(msg);if(paid){refund(ENTRY_FEE);setPaid(false);}setPhase("input");
    }),
    on("room:dissolved",d=>{const reason=d?.reason||null;if(paid){refund(ENTRY_FEE);setPaid(false);}setErr(isPaymentClosureReason(reason)?null:reason);setPhase("input");setRoom({current:0,total:0,players:[]});setRoomExpiresAt(null);setRoomCountdown(null);setPaymentStartedAt(null);setPaymentCountdown(null);setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});}),
    on("room:expired",()=>{setRoomExpiresAt(null);setRoomCountdown(null);setErr(t("join.err.expired"));setPhase("input");}),
    on("room:payment:update",d=>{setPaymentProgress({paidCount:d.paidCount,total:d.total});confirmRetryRef.current.tries=0;if(confirmRetryRef.current.timer){clearTimeout(confirmRetryRef.current.timer);confirmRetryRef.current.timer=null;}setErr(null);}),
    on("room:payment:failed",d=>{const reason=d?.reason||t("create.err.teamDisbanded");if(isPaymentClosureReason(reason)){handlePaymentFailure(reason);return;}setPaymentStartedAt(null);setPaymentCountdown(null);setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});setPaymentTimeoutError(null);setErr(reason);setPhase("input");}),
    on("game:start",d=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players.length,players:d.players,phase:"predicting",basePrice:d.basePrice,countdown:Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null});setPaymentStartedAt(null);setTimeout(()=>nav("/game"),50);}),
    on("game:resume",d=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players?.length||d.totalPlayers||0,players:d.players||[],phase:d.phase==="settling"?"settling":"predicting",basePrice:d.basePrice,countdown:d.remaining||Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null,currentPrice:d.currentPrice||d.basePrice});setPaymentStartedAt(null);setTimeout(()=>nav("/game"),50);}),
  ];return()=>u.forEach(f=>f());},[on,code,updateGame,nav,handlePaymentFailure,wallet,isPaymentClosureReason]);

  useEffect(()=>{
    if(paymentCountdown!==0)return;
    const everyonePaid=paymentProgress.total>0&&paymentProgress.paidCount>=paymentProgress.total;
    if(everyonePaid)return;
    if(phase!=="payment"&&phase!=="paid_waiting")return;
    const timer=setTimeout(()=>{
      const fullyPaidNow=paymentProgress.total>0&&paymentProgress.paidCount>=paymentProgress.total;
      if((phase==="payment"||phase==="paid_waiting")&&!fullyPaidNow)handlePaymentFailure(t("create.err.teamDisbanded"));
    },1200);
    return()=>clearTimeout(timer);
  },[paymentCountdown,phase,paymentProgress,handlePaymentFailure,t]);

  useEffect(()=>{
    const everyonePaid=paymentProgress.total>0&&paymentProgress.paidCount>=paymentProgress.total;
    if(!everyonePaid||phase!=="paid_waiting"||!wallet)return;
    const now=Date.now();
    if(now-resumeRequestAt.current<2500)return;
    resumeRequestAt.current=now;
    emit("game:resume:request");
  },[paymentProgress,phase,wallet,emit]);

  const join=()=>{if(!wallet){connect();return;}if(code.length<6)return setErr(t("join.err.incompleteCode"));setErr(null);emit("room:validate",{inviteCode:code.toUpperCase()});};
  const confirmJoin=()=>{emit("room:join",{inviteCode:code.toUpperCase()});setPhase("joining");};
  const closePaymentTimeoutError=useCallback(()=>{setPaymentTimeoutError(null);setErr(null);},[]);
  const payRoom=useCallback(async()=>{
    const startedAt=paymentStartedAtRef.current;
    const deadline=startedAt?startedAt+PAYMENT_TIMEOUT*1000:null;
    if(deadline&&Date.now()>=deadline){handlePaymentFailure(t("create.err.windowClosed"));return;}
    try{
      const paymentResult=await payForRoomEntry({inviteCode:roomFullInfo?.inviteCode||code,chainGameId:roomFullInfo?.chainGameId||null});
      const nowDeadline=paymentStartedAtRef.current?paymentStartedAtRef.current+PAYMENT_TIMEOUT*1000:deadline;
      if(nowDeadline&&Date.now()>=nowDeadline){
        if(paymentResult?.paid)refund(ENTRY_FEE);
        handlePaymentFailure(t("create.err.windowClosed"));
        return;
      }
      if(roomFullInfo&&paymentResult?.chainGameId){setRoomFullInfo(prev=>prev?{...prev,chainGameId:paymentResult.chainGameId}:prev);}
      setPaymentProgress(prev=>({paidCount:Math.min(prev.total||roomFullInfo?.maxPlayers||1,Math.max(prev.paidCount||0,1)),total:prev.total||roomFullInfo?.maxPlayers||1}));
      setPaid(true);paidRef.current=true;
      if(roomFullInfo){emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:paymentResult?.chainGameId||roomFullInfo.chainGameId||null,inviteCode:roomFullInfo.inviteCode||code,wallet});setPhase("paid_waiting");}
    }catch(e){
      const startedAtCatch=paymentStartedAtRef.current;
      const deadlineCatch=startedAtCatch?startedAtCatch+PAYMENT_TIMEOUT*1000:null;
      if(deadlineCatch&&Date.now()>=deadlineCatch)return;
      setErr(e?.message||t("create.err.paymentFailed"));
    }
  },[code,payForRoomEntry,emit,roomFullInfo,wallet,refund,handlePaymentFailure,t]);
  const leave=()=>{emit("room:leave");if(paid){refund(ENTRY_FEE);setPaid(false);}setPhase("input");setRoomExpiresAt(null);};
  const fmtCountdown=(s)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  return<div className="page-container">
    <button onClick={()=>nav("/")} className="text-white/15 hover:text-white/30 text-xs mb-4 transition">{t("howto.back")}</button>
    <h2 className="text-xl font-black mb-4 flex items-center gap-2"><span className="text-2xl">🎯</span>{t("join.heading")}</h2>
    {err&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-xl mb-3 text-[11px]">{err}</div>}
    {phase==="input"&&<div>
      {!wallet&&<div className="bg-fuchsia-500/[0.06] border border-fuchsia-500/15 rounded-xl px-3 py-1.5 mb-3"><p className="text-fuchsia-300/60 text-[9px]">{t("join.connectWallet")}</p></div>}
      <p className="text-white/20 text-xs mb-2">{t("join.enterCode")}</p>
      <input type="text" value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder={t("join.codePlaceholder")} maxLength={6} className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3.5 text-center text-2xl font-mono font-black tracking-[0.5em] text-fuchsia-300 placeholder:text-white/[0.08] placeholder:tracking-normal placeholder:text-sm placeholder:font-normal focus:outline-none focus:border-fuchsia-500/30 transition mb-3"/>
      <button onClick={join} disabled={code.length<6} className="btn-primary w-full py-3.5 font-black disabled:!opacity-15">{t("join.ctaJoinMatch")}</button>
    </div>}
    {/* Confirm dialog — no payment, just confirm joining */}
    {phase==="confirm"&&<div className="card text-center">
      <p className="text-white/40 text-xs mb-3">{t("join.confirm.title")}</p>
      <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 mb-3">
        <span className="text-2xl font-mono font-black tracking-[0.4em] text-gradient">{code}</span>
      </div>
      <p className="text-white/25 text-[10px] mb-4">{validInfo?t("join.confirm.count").replace("{c}",String(validInfo.current)).replace("{t}",String(validInfo.total)):""}</p>
      <div className="flex gap-2">
        <button onClick={()=>{setPhase("input");setValidInfo(null);}} className="flex-1 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] text-white/30 text-xs transition">{t("join.ctaCancel")}</button>
        <button onClick={confirmJoin} className="flex-1 btn-primary !py-2.5 !text-sm font-bold">{t("join.ctaJoin")}</button>
      </div>
    </div>}
    {phase==="joining"&&<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-300 animate-spin mb-3"/><p className="text-white/40 text-xs">{t("join.joining")}</p></div>}
    <PaymentModal visible={phase==="payment"||!!paymentTimeoutError} onConfirm={paymentTimeoutError?closePaymentTimeoutError:payRoom} onCancel={paymentTimeoutError?undefined:leave} loading={loading} title={paymentTimeoutError?t("join.payment.timeout.title"):t("join.payment.full.title")} actionLabel={paymentTimeoutError?t("join.payment.timeout.action"):t("join.payment.action")} subtitle={paymentTimeoutError?t("join.payment.timeout.subtitle"):t("join.payment.full.subtitle")} hint={paymentTimeoutError?null:`${paymentProgress.paidCount}/${paymentProgress.total} ${t("join.paid")}`} error={paymentTimeoutError} countdown={paymentTimeoutError?null:paymentCountdown} singleAction={!!paymentTimeoutError}/>
    {(phase==="waiting"||phase==="paid_waiting")&&<div className="card text-center">
      <p className="text-white/20 text-xs mb-1">{t("join.joined")}</p>
      <p className="text-xl font-mono font-black text-gradient tracking-widest mb-3">{code}</p>
      <TeamSlots total={room.total} players={room.players}/>
      <p className="text-white/20 text-[10px] mt-2">{paid&&paymentProgress.total?`${paymentProgress.paidCount}/${paymentProgress.total} ${t("join.paid")}`:`${t("join.waiting")} (${room.current}/${room.total})`}</p>
      {roomCountdown!==null&&roomCountdown>0&&room.current<room.total&&(
        <div className={`mt-2 flex items-center justify-center gap-1.5 ${roomCountdown<=30?"text-rose-400":"text-fuchsia-300"}`}>
          <span className="text-sm">⏱️</span><span className="text-sm font-mono font-bold">{fmtCountdown(roomCountdown)}</span>
          <span className="text-[9px] text-white/25 ml-1">{t("join.remaining")}</span>
        </div>
      )}
      {paymentCountdown!==null&&paymentCountdown>0&&phase==="paid_waiting"&&(
        <div className={`mt-2 flex items-center justify-center gap-1.5 ${paymentCountdown<=10?"text-rose-400":"text-fuchsia-300"}`}>
          <span className="text-sm">💰</span><span className="text-sm font-mono font-bold">{paymentCountdown}s</span>
          <span className="text-[9px] text-white/25 ml-1">{t("join.payment.countdown")}</span>
        </div>
      )}
      <button onClick={leave} className="mt-4 w-full py-2 rounded-xl bg-white/[0.015] border border-white/[0.04] hover:bg-rose-500/[0.06] hover:text-rose-400 transition text-[10px] text-white/20">{t("join.ctaLeave")}</button>
    </div>}
  </div>;
}
