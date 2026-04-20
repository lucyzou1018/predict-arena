import{useState,useEffect,useCallback,useRef}from"react";import{useNavigate}from"react-router-dom";
import{useSocket}from"../hooks/useSocket";import{useGame}from"../context/GameContext";import{useWallet}from"../context/WalletContext";import{useContract}from"../hooks/useContract";
import{TeamSlots,PaymentModal}from"../components";import{TEAM_SIZES,ENTRY_FEE,PAYMENT_TIMEOUT}from"../config/constants";
import{useT}from"../context/LangContext";
export default function CreateRoom(){
  const nav=useNavigate();const{emit,on}=useSocket();const{updateGame}=useGame();
  const{wallet,refund}=useWallet();const{payForRoomEntry,loading}=useContract();
  const t=useT();
  const[phase,setPhase]=useState("select");const[sz,setSz]=useState(2);
  const[code,setCode]=useState("");const[room,setRoom]=useState({current:0,players:[]});
  const[err,setErr]=useState(null);const[copied,setCopied]=useState(false);const[paid,setPaid]=useState(false);
  const[hint,setHint]=useState(null);
  const[roomFullInfo,setRoomFullInfo]=useState(null);
  const[paymentProgress,setPaymentProgress]=useState({paidCount:0,total:0});
  const[paymentTimeoutError,setPaymentTimeoutError]=useState(null);
  const cancelPending=useRef(false);
  const phaseBeforeCancel=useRef("select");
  const resumeRequestAt=useRef(0);
  const paidRef=useRef(false);
  const confirmRetryRef=useRef({tries:0,timer:null});
  const paymentStartedAtRef=useRef(null);

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

  const handlePaymentFailure=useCallback((reason=t("create.err.teamDisbanded"))=>{
    if(paid){refund(ENTRY_FEE);setPaid(false);}
    setPaymentStartedAt(null);
    setPaymentCountdown(null);
    setRoomFullInfo(null);
    setHint(null);
    setPaymentTimeoutError(reason);
    setErr(null);
    setPhase("select");
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
    on("room:created",d=>{cancelPending.current=false;phaseBeforeCancel.current="select";setHint(null);setCode(d.inviteCode);setRoomExpiresAt(d.expiresAt);setRoom({current:1,players:[wallet]});setPhase("waiting");}),
    on("room:update",d=>{setRoom({current:d.current,players:d.players});if(d.expiresAt)setRoomExpiresAt(d.expiresAt);if(d.status==="full"||(d.total&&d.current>=d.total))openPayment(d);}),
    on("room:full",d=>{openPayment(d);}),
    on("room:payment:opened",d=>{setRoomFullInfo(prev=>prev?{...prev,chainGameId:d.chainGameId||prev.chainGameId}:prev);}),
    on("room:error",d=>{
      if(cancelPending.current){cancelPending.current=false;setPhase(phaseBeforeCancel.current==="paid_waiting"?"paid_waiting":"waiting");}
      const msg=d?.message||"";
      const isRpcLike=/rpc|timed out|syncing|not confirmed/i.test(msg);
      if(paidRef.current&&isRpcLike&&roomFullInfo){
        const tries=confirmRetryRef.current.tries||0;
        if(tries<5){
          confirmRetryRef.current.tries=tries+1;
          setHint(t("create.syncing"));
          if(confirmRetryRef.current.timer)clearTimeout(confirmRetryRef.current.timer);
          confirmRetryRef.current.timer=setTimeout(()=>{
            emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:roomFullInfo.chainGameId||null,inviteCode:code,wallet});
          },2000);
          return;
        }
      }
      setHint(null);setErr(msg);
    }),
    on("room:dissolved",d=>{const selfCancelled=cancelPending.current;cancelPending.current=false;phaseBeforeCancel.current="select";setHint(null);if(paid){refund(ENTRY_FEE);setPaid(false);}setErr(selfCancelled?null:(d?.reason||null));setCode("");setRoom({current:0,players:[]});setPhase("select");setRoomExpiresAt(null);setRoomCountdown(null);setPaymentStartedAt(null);setPaymentCountdown(null);setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});}),
    on("room:expired",()=>{setRoomExpiresAt(null);setRoomCountdown(null);setPhase("expired");}),
    on("room:payment:update",d=>{setPaymentProgress({paidCount:d.paidCount,total:d.total});confirmRetryRef.current.tries=0;if(confirmRetryRef.current.timer){clearTimeout(confirmRetryRef.current.timer);confirmRetryRef.current.timer=null;}setHint(null);setErr(null);}),
    on("room:payment:failed",d=>{handlePaymentFailure(d?.reason||t("create.err.teamDisbanded"));}),
    on("game:start",d=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players.length,players:d.players,phase:"predicting",basePrice:d.basePrice,countdown:Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null});setPaymentStartedAt(null);setTimeout(()=>nav("/game"),500);}),
    on("game:resume",d=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players?.length||d.totalPlayers||0,players:d.players||[],phase:d.phase==="settling"?"settling":"predicting",basePrice:d.basePrice,countdown:d.remaining||Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null,currentPrice:d.currentPrice||d.basePrice});setPaymentStartedAt(null);setTimeout(()=>nav("/game"),300);}),
  ];return()=>u.forEach(f=>f());},[on,sz,code,updateGame,nav,handlePaymentFailure,wallet]);

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

  const create=()=>{cancelPending.current=false;phaseBeforeCancel.current="select";setErr(null);setHint(null);emit("room:create",{teamSize:sz});};
  const closePaymentTimeoutError=useCallback(()=>{setPaymentTimeoutError(null);},[]);
  const payRoom=useCallback(async()=>{
    const startedAt=paymentStartedAtRef.current;
    const deadline=startedAt?startedAt+PAYMENT_TIMEOUT*1000:null;
    if(deadline&&Date.now()>=deadline){handlePaymentFailure(t("create.err.windowClosed"));return;}
    try{
      const paymentResult=await payForRoomEntry({inviteCode:code,maxPlayers:roomFullInfo?.maxPlayers||sz,isOwner:true,auth:roomFullInfo?.auth});
      const nowDeadline=paymentStartedAtRef.current?paymentStartedAtRef.current+PAYMENT_TIMEOUT*1000:deadline;
      if(nowDeadline&&Date.now()>=nowDeadline){
        if(paymentResult?.paid)refund(ENTRY_FEE);
        handlePaymentFailure(t("create.err.windowClosed"));
        return;
      }
      if(roomFullInfo&&paymentResult?.chainGameId){setRoomFullInfo(prev=>prev?{...prev,chainGameId:paymentResult.chainGameId}:prev);}
      setPaid(true);paidRef.current=true;
      if(roomFullInfo){emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:paymentResult?.chainGameId||roomFullInfo.chainGameId||null,inviteCode:code,wallet});setPhase("paid_waiting");}
    }catch(e){
      const startedAtCatch=paymentStartedAtRef.current;
      const deadlineCatch=startedAtCatch?startedAtCatch+PAYMENT_TIMEOUT*1000:null;
      if(deadlineCatch&&Date.now()>=deadlineCatch)return;
      setErr(e?.message||t("create.err.paymentFailed"));
    }
  },[payForRoomEntry,roomFullInfo,code,emit,sz,wallet,refund,handlePaymentFailure,t]);
  const beginCancel=()=>{cancelPending.current=true;phaseBeforeCancel.current=phase;setErr(null);setHint(t("create.cancelling"));setRoomCountdown(null);emit("room:dissolve",{inviteCode:code});setPhase("dissolving");};
  const cancel=()=>{beginCancel();};
  const dissolve=()=>{beginCancel();};
  const clearExpired=()=>{setPhase("select");setCode("");setRoom({current:0,players:[]});setErr(null);};
  const cp=()=>{navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const fmtCountdown=(s)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  return<div className="page-container">
    <button onClick={()=>nav("/")} className="text-white/15 hover:text-white/30 text-xs mb-4 transition">{t("howto.back")}</button>
    <h2 className="text-xl font-black mb-4 flex items-center gap-2"><span className="text-2xl">🏟️</span>{t("create.heading")}</h2>
    {err&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-xl mb-3 text-[11px]">{err}</div>}
    {hint&&<div className="bg-white/[0.03] border border-white/[0.06] text-white/45 px-3 py-2 rounded-xl mb-3 text-[11px]">{hint}</div>}
    {phase==="select"&&<div><p className="text-white/20 text-xs mb-2">{t("create.teamSize")}</p><div className="grid grid-cols-4 gap-2 mb-4">{TEAM_SIZES.map(s=><button key={s} onClick={()=>setSz(s)} className={`py-3.5 rounded-xl font-black text-lg transition-all ${sz===s?"bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-violet-500/25 -translate-y-0.5":"bg-white/[0.02] border border-white/[0.05] text-white/20 hover:bg-white/[0.04]"}`}>{s}P</button>)}</div><button onClick={create} className="btn-primary w-full py-3.5 font-black">{t("create.ctaCreate")}</button></div>}
    <PaymentModal visible={phase==="payment"||!!paymentTimeoutError} onConfirm={paymentTimeoutError?closePaymentTimeoutError:payRoom} onCancel={paymentTimeoutError?undefined:cancel} loading={loading} title={paymentTimeoutError?t("create.payment.timeout.title"):t("create.payment.full.title")} actionLabel={paymentTimeoutError?t("create.payment.timeout.action"):t("create.payment.action")} subtitle={paymentTimeoutError?t("create.payment.timeout.subtitle"):t("create.payment.full.subtitle").replace("{n}",String(paymentProgress.total))} hint={paymentTimeoutError?null:`${paymentProgress.paidCount}/${paymentProgress.total} ${t("create.paid")}`} error={paymentTimeoutError} countdown={paymentTimeoutError?null:paymentCountdown} singleAction={!!paymentTimeoutError}/>
    {phase==="dissolving"&&<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-violet-400/30 border-t-violet-300 animate-spin mb-3"/><p className="text-white/40 text-xs">{t("create.cancelling")}</p></div>}
    {(phase==="waiting"||phase==="paid_waiting")&&<div className="card text-center glow-orange">
      <p className="text-white/15 text-[8px] uppercase tracking-[0.3em] mb-2">{t("create.arenaCode")}</p>
      <div className="mb-2"><span className="text-3xl font-mono font-black tracking-[0.4em] text-gradient">{code}</span></div>
      <button onClick={cp} className={`text-[9px] px-3 py-1 rounded-full transition mb-3 ${copied?"bg-emerald-500/15 text-emerald-400":"bg-white/[0.03] text-white/20 hover:text-white/30"}`}>{copied?t("create.copy.done"):t("create.copy.cta")}</button>
      <p className="text-white/10 text-[9px] mb-3">{t("create.share.opponents")}</p>
      <TeamSlots total={sz} players={room.players} current={room.current}/>
      <div className="mt-2 inline-block bg-white/[0.015] border border-white/[0.04] rounded-full px-3 py-1"><span className="text-white/30 text-xs font-mono">{paid&&paymentProgress.total?`${paymentProgress.paidCount}/${paymentProgress.total} ${t("create.paid")}`:`${room.current}/${sz}`}</span><span className="text-white/15 text-[10px] ml-1">{t("create.ready")}</span></div>
      {roomCountdown!==null&&roomCountdown>0&&room.current<sz&&(
        <div className={`mt-2 flex items-center justify-center gap-1.5 ${roomCountdown<=30?"text-rose-400":"text-violet-300"}`}>
          <span className="text-sm">⏱️</span><span className="text-sm font-mono font-bold">{fmtCountdown(roomCountdown)}</span>
          <span className="text-[9px] text-white/25 ml-1">{t("create.remaining")}</span>
        </div>
      )}
      {paymentCountdown!==null&&paymentCountdown>0&&phase==="paid_waiting"&&(
        <div className={`mt-2 flex items-center justify-center gap-1.5 ${paymentCountdown<=10?"text-rose-400":"text-violet-300"}`}>
          <span className="text-sm">💰</span><span className="text-sm font-mono font-bold">{paymentCountdown}s</span>
          <span className="text-[9px] text-white/25 ml-1">{t("create.payment.countdown")}</span>
        </div>
      )}
      <button onClick={dissolve} className="mt-4 w-full py-2 rounded-xl bg-white/[0.015] border border-white/[0.04] hover:bg-rose-500/[0.06] hover:border-rose-500/15 hover:text-rose-400 transition text-[10px] text-white/20">{t("create.cta.cancel")}</button>
    </div>}
    {phase==="expired"&&<div className="card text-center">
      <p className="text-white/15 text-[8px] uppercase tracking-[0.3em] mb-2">{t("create.arenaCode")}</p>
      <div className="mb-2"><span className="text-3xl font-mono font-black tracking-[0.4em] text-white/15 line-through">{code}</span></div>
      <p className="text-rose-400 text-xs mb-3">{t("create.expired.msg")}</p>
      <button onClick={clearExpired} className="w-full py-2.5 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 text-white font-bold text-sm shadow-lg shadow-rose-500/20 hover:shadow-rose-500/30 transition">{t("create.expired.cta")}</button>
    </div>}
  </div>;
}
