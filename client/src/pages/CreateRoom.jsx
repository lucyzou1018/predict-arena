import{useState,useEffect,useCallback,useRef}from"react";import{useNavigate}from"react-router-dom";
import{useSocket}from"../hooks/useSocket";import{useGame}from"../context/GameContext";import{useWallet}from"../context/WalletContext";import{useContract}from"../hooks/useContract";
import{TeamSlots,PaymentModal}from"../components";import{TEAM_SIZES,ENTRY_FEE,PAYMENT_TIMEOUT,SERVER_URL}from"../config/constants";
import{useT}from"../context/LangContext";

function RoomGlyph({kind,className="w-5 h-5"}){
  const common={viewBox:"0 0 24 24",fill:"none",className,stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"};
  switch(kind){
    case"room":
      return<svg {...common}><path d="M4 8.5 12 4l8 4.5v8L12 20l-8-3.5v-8Z"/><path d="M12 4v16"/><path d="M4 8.5 12 13l8-4.5"/></svg>;
    case"team":
      return<svg {...common}><circle cx="8" cy="9" r="2.5"/><circle cx="16" cy="9" r="2.5"/><path d="M3.5 18c0-2.5 2.2-4.5 4.5-4.5S12.5 15.5 12.5 18"/><path d="M11.5 18c0-2.5 2.2-4.5 4.5-4.5s4.5 2 4.5 4.5"/></svg>;
    case"fee":
      return<svg {...common}><ellipse cx="12" cy="7.5" rx="5" ry="2.5"/><path d="M7 7.5V12c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7.5"/><path d="M9.7 18h4.6"/><path d="M12 15.5v5"/></svg>;
    case"code":
      return<svg {...common}><path d="M8.5 8 5 11.5 8.5 15"/><path d="M15.5 8 19 11.5 15.5 15"/><path d="M13.5 6 10.5 18"/></svg>;
    case"scan":
      return<svg {...common}><path d="M5 7V5h2"/><path d="M17 5h2v2"/><path d="M19 17v2h-2"/><path d="M7 19H5v-2"/><path d="M7 12h10"/><path d="M7 9h6"/><path d="M7 15h8"/></svg>;
    case"timer":
      return<svg {...common}><circle cx="12" cy="13" r="6.5"/><path d="M12 13V9.5"/><path d="M12 13l3 1.5"/><path d="M9.5 3.5h5"/><path d="M10.5 6.5V4"/><path d="M13.5 6.5V4"/></svg>;
    case"copy":
      return<svg {...common}><rect x="9" y="9" width="10" height="10" rx="2"/><rect x="5" y="5" width="10" height="10" rx="2"/></svg>;
    default:
      return null;
  }
}

function StatTile({label,value,icon}){
  return<div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
    <div className="flex items-center gap-2 text-fuchsia-200/80 mb-2">
      <RoomGlyph kind={icon} className="w-4.5 h-4.5"/>
      <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">{label}</span>
    </div>
    <div className="text-[15px] sm:text-base font-bold text-white leading-tight">{value}</div>
  </div>;
}

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
      owner:d?.owner||prev?.owner||wallet||null,
      auth:d?.auth||prev?.auth||null,
      players:players.length?players:(prev?.players||[]),
      paymentTimeout:d?.paymentTimeout||prev?.paymentTimeout||PAYMENT_TIMEOUT*1000,
    }));
    setPaymentProgress(prev=>({paidCount:prev?.paidCount||0,total}));
    setPaymentStartedAt(prev=>prev||d?.paymentStartedAt||Date.now());
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

  useEffect(()=>{
    if(!wallet)return;
    fetch(`${SERVER_URL}/api/users/${wallet}/open-room`)
      .then(r=>r.json())
      .then(d=>{
        const room=d?.room;
        if(!room?.invite_code||!room?.is_owner)return;
        const inviteCode=room.invite_code;
        const players=Array.isArray(room.players)?room.players:[];
        const total=room.max_players||players.length||0;
        const current=room.current_players||players.length||0;
        setCode(inviteCode);
        setRoom({current,players});
        setRoomFullInfo({
          gameId:room.game_id||room.id,
          chainGameId:room.chain_game_id||null,
          inviteCode,
          maxPlayers:total,
          owner:room.owner||wallet||null,
          auth:room.auth||null,
          players,
          paymentTimeout:room.payment_timeout_ms||PAYMENT_TIMEOUT*1000,
        });
        setPaymentProgress({paidCount:room.paid_count||0,total:room.total_players||total});
        if(room.phase==="payment"||room.phase==="paid_waiting"){
          setPaid(room.phase==="paid_waiting");
          const startedAt=room.payment_started_at?new Date(room.payment_started_at).getTime():null;
          setPaymentStartedAt(startedAt);
          setRoomExpiresAt(null);
          setPhase(room.phase);
          return;
        }
        if(room.phase==="preparing"){
          setPaid(false);
          setPaymentStartedAt(null);
          setRoomExpiresAt(null);
          setPhase("preparing");
          return;
        }
        const expiresAt=room.expires_at?new Date(room.expires_at).getTime():null;
        setPaid(false);
        setPaymentStartedAt(null);
        setRoomExpiresAt(expiresAt);
        setPhase("waiting");
      })
      .catch(()=>{});
  },[wallet]);

  useEffect(()=>{const u=[
    on("room:created",d=>{cancelPending.current=false;phaseBeforeCancel.current="select";setHint(null);setCode(d.inviteCode);setRoomExpiresAt(d.expiresAt);setRoom({current:1,players:[wallet]});setPhase("waiting");}),
    on("room:update",d=>{setRoom({current:d.current,players:d.players});if(d.expiresAt)setRoomExpiresAt(d.expiresAt);if((d.status==="full"||(d.total&&d.current>=d.total))&&(d.paymentOpen||d.chainGameId))openPayment(d);}),
    on("room:preparing",d=>{setRoomFullInfo(prev=>({gameId:d?.gameId||prev?.gameId||null,chainGameId:d?.chainGameId||prev?.chainGameId||null,inviteCode:d?.inviteCode||prev?.inviteCode||code,maxPlayers:d?.total||prev?.maxPlayers||0,owner:d?.owner||prev?.owner||wallet||null,auth:null,players:Array.isArray(d?.players)?d.players:(prev?.players||[]),paymentTimeout:d?.timeoutMs||prev?.paymentTimeout||PAYMENT_TIMEOUT*1000}));setPaymentProgress({paidCount:0,total:d?.total||d?.players?.length||0});setPaymentStartedAt(null);setRoomExpiresAt(null);setRoomCountdown(null);setPhase(current=>current==="waiting"||current==="creating"?"preparing":current);}),
    on("room:full",d=>{if(d.paymentOpen||d.chainGameId)openPayment(d);else setPhase(current=>current==="waiting"||current==="creating"?"preparing":current);}),
    on("room:payment:opened",d=>{openPayment(d);}),
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
    on("room:dissolved",d=>{const selfCancelled=cancelPending.current;const reason=d?.reason||null;cancelPending.current=false;phaseBeforeCancel.current="select";setHint(null);if(paid){refund(ENTRY_FEE);setPaid(false);}setErr(selfCancelled||isPaymentClosureReason(reason)?null:reason);setCode("");setRoom({current:0,players:[]});setPhase("select");setRoomExpiresAt(null);setRoomCountdown(null);setPaymentStartedAt(null);setPaymentCountdown(null);setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});}),
    on("room:expired",()=>{setRoomExpiresAt(null);setRoomCountdown(null);setPhase("expired");}),
    on("room:payment:update",d=>{setPaymentProgress({paidCount:d.paidCount,total:d.total});confirmRetryRef.current.tries=0;if(confirmRetryRef.current.timer){clearTimeout(confirmRetryRef.current.timer);confirmRetryRef.current.timer=null;}setHint(null);setErr(null);}),
    on("room:payment:failed",d=>{const reason=d?.reason||t("create.err.teamDisbanded");if(isPaymentClosureReason(reason)){handlePaymentFailure(reason);return;}setPaymentStartedAt(null);setPaymentCountdown(null);setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});setPaymentTimeoutError(null);setHint(null);setErr(reason);setPhase("select");}),
    on("game:start",d=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players.length,players:d.players,phase:"predicting",basePrice:d.basePrice,countdown:Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null});setPaymentStartedAt(null);setTimeout(()=>nav("/game"),50);}),
    on("game:resume",d=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players?.length||d.totalPlayers||0,players:d.players||[],phase:d.phase==="settling"?"settling":"predicting",basePrice:d.basePrice,countdown:d.remaining||Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null,currentPrice:d.currentPrice||d.basePrice});setPaymentStartedAt(null);setTimeout(()=>nav("/game"),50);}),
  ];return()=>u.forEach(f=>f());},[on,sz,code,updateGame,nav,handlePaymentFailure,wallet,isPaymentClosureReason]);

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
  const closePaymentTimeoutError=useCallback(()=>{setPaymentTimeoutError(null);setErr(null);setHint(null);},[]);
  const payRoom=useCallback(async()=>{
    const startedAt=paymentStartedAtRef.current;
    const deadline=startedAt?startedAt+PAYMENT_TIMEOUT*1000:null;
    if(deadline&&Date.now()>=deadline){handlePaymentFailure(t("create.err.windowClosed"));return;}
    try{
      const paymentResult=await payForRoomEntry({inviteCode:code,chainGameId:roomFullInfo?.chainGameId||null});
      const nowDeadline=paymentStartedAtRef.current?paymentStartedAtRef.current+PAYMENT_TIMEOUT*1000:deadline;
      if(nowDeadline&&Date.now()>=nowDeadline){
        if(paymentResult?.paid)refund(ENTRY_FEE);
        handlePaymentFailure(t("create.err.windowClosed"));
        return;
      }
      if(roomFullInfo&&paymentResult?.chainGameId){setRoomFullInfo(prev=>prev?{...prev,chainGameId:paymentResult.chainGameId}:prev);}
      setPaymentProgress(prev=>({paidCount:Math.min(prev.total||roomFullInfo?.maxPlayers||1,Math.max(prev.paidCount||0,1)),total:prev.total||roomFullInfo?.maxPlayers||1}));
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
  const waitingLike=phase==="waiting"||phase==="paid_waiting";
  const roomProgress=paid&&paymentProgress.total?`${paymentProgress.paidCount}/${paymentProgress.total} ${t("create.paid")}`:`${room.current}/${sz}`;
  const statusTone=phase==="paid_waiting"?"text-fuchsia-200":"text-white/70";

  return<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
    <button onClick={()=>nav("/")} className="inline-flex items-center gap-2 text-white/30 hover:text-white/60 text-xs font-semibold uppercase tracking-[0.22em] mb-5 transition">
      <span className="text-sm">←</span>{t("howto.back")}
    </button>

    {phase!=="select"&&<section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr] items-start mb-5">
      <div className="space-y-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/18 bg-fuchsia-400/[0.08] px-3 py-1.5 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300"/>
            <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-fuchsia-100/85">Host Console</span>
          </div>
          <h1 className="neon-title text-[2rem] sm:text-[2.5rem] lg:text-[3rem] leading-[1.08] uppercase max-w-[11ch] mb-3">
            {t("create.heading")}
          </h1>
          <p className="text-white/62 text-sm sm:text-base leading-7 max-w-2xl">{t("create.subtitle")}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label={t("create.teamSize")} value={`${sz} Players`} icon="team"/>
          <StatTile label="Entry Fee" value={`$${(ENTRY_FEE/1_000_000).toFixed(0)} USDC / Seat`} icon="fee"/>
          <StatTile label="Access" value="Invite Only" icon="code"/>
        </div>
      </div>

      <div className="landing-story-card !p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-fuchsia-500/18 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-200/85 shrink-0">
            <RoomGlyph kind="scan"/>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-1">Room Flow</div>
            <div className="text-white text-lg font-bold">Create · Share · Fill · Start</div>
          </div>
        </div>
        <div className="grid gap-2.5 mb-4">
          {[
            "Generate a private room and invite code instantly.",
            "Share the code and monitor seats in real time.",
            "Round moves to payment as soon as every seat is taken.",
          ].map(item=><div key={item} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/64 leading-6">{item}</div>)}
        </div>
        <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.025] px-4 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38 mb-3">Seat Preview</div>
          <TeamSlots total={sz} players={[]} current={0}/>
          <div className="text-center text-[12px] text-white/40 mt-3">Room code appears after creation</div>
        </div>
      </div>
    </section>}

    {err&&<div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-300 px-4 py-3 mb-4 text-[12px] leading-6">{err}</div>}
    {hint&&<div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] text-white/52 px-4 py-3 mb-4 text-[12px] leading-6">{hint}</div>}

    {phase==="select"&&<>
      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr] items-start mb-4">
        <div className="space-y-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/18 bg-fuchsia-400/[0.08] px-3 py-1.5 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-fuchsia-100/85">Host Console</span>
            </div>
            <h1 className="neon-title text-[2.1rem] sm:text-[2.8rem] lg:text-[3.4rem] leading-[1.04] uppercase max-w-[10ch] mb-3">
              {t("create.heading")}
            </h1>
            <p className="text-white/62 text-sm sm:text-base leading-7 max-w-2xl">
              {t("create.subtitle")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label={t("create.teamSize")} value={`${sz} Players`} icon="team" />
            <StatTile label="Entry Fee" value={`$${(ENTRY_FEE/1_000_000).toFixed(0)} USDC / Seat`} icon="fee" />
            <StatTile label="Access" value="Invite Only" icon="code" />
          </div>

          <div className="landing-story-card !p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-fuchsia-500/18 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-200/85 shrink-0">
                <RoomGlyph kind="scan" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-1">Host Flow</div>
                <div className="text-white text-lg font-bold">Create · Share · Fill · Start</div>
              </div>
            </div>
            <div className="grid gap-2.5">
              {[
                "Pick the room size first, then create a private arena.",
                "The invite code becomes the visual center of the host panel.",
                "Seats and countdown live in a dedicated monitor card.",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/64 leading-6">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="landing-story-card !p-0 overflow-hidden">
          <div className="px-6 py-5 border-b border-white/[0.06] flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-2">Host Preview</div>
              <div className="text-white text-xl font-bold">Generated room card</div>
            </div>
            <div className="rounded-full border border-fuchsia-400/18 bg-fuchsia-400/[0.07] px-3 py-1 text-[11px] font-semibold text-fuchsia-100/80">
              Preview
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="rounded-[30px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,92,255,0.18),rgba(255,255,255,0.02)_58%)] px-5 py-6 mb-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-[10px] uppercase tracking-[0.26em] text-white/36">{t("create.arenaCode")}</div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-white/55">
                  <RoomGlyph kind="code" className="w-4 h-4" />
                  Share
                </div>
              </div>
              <div className="font-mono text-3xl sm:text-[3.2rem] tracking-[0.34em] text-gradient-fuchsia mb-2">AUTO GEN</div>
              <div className="text-[12px] text-white/45">Share this code to fill the room and trigger the payment step.</div>
            </div>

            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.025] px-5 py-5 mb-4">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42">Seat Monitor</div>
                <div className="text-[12px] text-white/52">0 / {sz} Ready</div>
              </div>
              <TeamSlots total={sz} players={[]} current={0}/>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile label="Time To Fill" value="04:29" icon="timer" />
              <StatTile label="Launch Rule" value="All seats must pay" icon="room" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr] items-start">
        <div className="landing-story-card !p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-3">Configuration Card</div>
          <div className="text-white text-2xl font-bold mb-2">Select your room size</div>
          <p className="text-white/55 text-sm leading-7 mb-5">
            Choose the number of seats. The room starts as soon as every participant joins and pays the entry.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {TEAM_SIZES.map(s=><button key={s} onClick={()=>setSz(s)} className={`rounded-[22px] px-4 py-4 border transition-all text-left ${sz===s?"border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/16 to-indigo-500/10 shadow-[0_0_30px_rgba(168,85,247,0.18)] -translate-y-0.5":"border-white/[0.08] bg-white/[0.03] text-white/55"}`}>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/38 mb-2">Team</div>
              <div className="text-2xl font-black text-white">{s}P</div>
            </button>)}
          </div>
          <button onClick={create} className="btn-primary w-full !py-3.5 !text-sm">{t("create.ctaCreate")}</button>
        </div>

        <div className="landing-story-card !p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-3">Why this direction</div>
          <div className="grid gap-2.5">
            {[
              "One dominant room-code card instead of many equal-weight panels.",
              "A separate seat monitor card so status feels live and operational.",
              "Small metric cards for fee, timer, and access instead of long paragraphs.",
              "Hackathon-poster energy, but still usable as a real transaction screen.",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/64 leading-6">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>}

    <PaymentModal visible={phase==="payment"||!!paymentTimeoutError} onConfirm={paymentTimeoutError?closePaymentTimeoutError:payRoom} onCancel={paymentTimeoutError?undefined:cancel} loading={loading} title={paymentTimeoutError?t("create.payment.timeout.title"):t("create.payment.full.title")} actionLabel={paymentTimeoutError?t("create.payment.timeout.action"):t("create.payment.action")} subtitle={paymentTimeoutError?t("create.payment.timeout.subtitle"):t("create.payment.full.subtitle").replace("{n}",String(paymentProgress.total))} hint={paymentTimeoutError?null:`${paymentProgress.paidCount}/${paymentProgress.total} ${t("create.paid")}`} error={paymentTimeoutError} countdown={paymentTimeoutError?null:paymentCountdown} singleAction={!!paymentTimeoutError}/>

    {phase==="dissolving"&&<div className="landing-story-card !p-8 text-center"><div className="w-10 h-10 mx-auto rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-200 animate-spin mb-4"/><p className="text-white/50 text-sm">{t("create.cancelling")}</p></div>}

    {waitingLike&&<section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr] items-start">
      <div className="landing-story-card !p-0 overflow-hidden">
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-2">Room Status</div>
            <div className={`text-xl font-bold ${statusTone}`}>{phase==="paid_waiting"?"Payment confirmed. Waiting for peers":"Room live. Share the invite code"}</div>
          </div>
          <div className="rounded-full border border-fuchsia-400/18 bg-fuchsia-400/[0.07] px-3 py-1 text-[11px] font-semibold text-fuchsia-100/80">{roomProgress}</div>
        </div>

        <div className="px-6 py-6">
          <div className="rounded-[30px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,92,255,0.18),rgba(255,255,255,0.02)_58%)] px-5 py-6 mb-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-[10px] uppercase tracking-[0.26em] text-white/36">{t("create.arenaCode")}</div>
              <button onClick={cp} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold transition ${copied?"bg-emerald-500/15 text-emerald-300":"border border-white/[0.08] bg-white/[0.03] text-white/55 hover:text-white/80"}`}>
                <RoomGlyph kind="copy" className="w-4 h-4"/>{copied?t("create.copy.done"):t("create.copy.cta")}
              </button>
            </div>
            <div className="font-mono text-3xl sm:text-[3.1rem] tracking-[0.34em] text-gradient-fuchsia mb-2">{code}</div>
            <div className="text-[12px] text-white/45">{t("create.share.opponents")}</div>
          </div>

          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.025] px-5 py-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42">Seat Monitor</div>
              <div className="text-[12px] text-white/52">{room.current}/{sz} ready</div>
            </div>
            <TeamSlots total={sz} players={room.players} current={room.current}/>
          </div>
        </div>
      </div>

      <div className="landing-story-card !p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-4">Host Controls</div>
        <div className="grid gap-3 mb-4">
          <StatTile label="Mode" value="Private Arena" icon="room"/>
          <StatTile label={t("create.teamSize")} value={`${sz} Seats`} icon="team"/>
          <StatTile label="Entry" value={`$${(ENTRY_FEE/1_000_000).toFixed(0)} USDC`} icon="fee"/>
        </div>

        {roomCountdown!==null&&roomCountdown>0&&room.current<sz&&<div className={`rounded-[22px] border px-4 py-3 mb-3 ${roomCountdown<=30?"border-rose-500/20 bg-rose-500/10 text-rose-300":"border-fuchsia-400/18 bg-fuchsia-400/[0.07] text-fuchsia-100/80"}`}>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] mb-1"><RoomGlyph kind="timer" className="w-4 h-4"/>{t("create.remaining")}</div>
          <div className="text-lg font-mono font-bold">{fmtCountdown(roomCountdown)}</div>
        </div>}

        {paymentCountdown!==null&&paymentCountdown>0&&phase==="paid_waiting"&&<div className={`rounded-[22px] border px-4 py-3 mb-3 ${paymentCountdown<=10?"border-rose-500/20 bg-rose-500/10 text-rose-300":"border-fuchsia-400/18 bg-fuchsia-400/[0.07] text-fuchsia-100/80"}`}>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] mb-1"><RoomGlyph kind="timer" className="w-4 h-4"/>{t("create.payment.countdown")}</div>
          <div className="text-lg font-mono font-bold">{paymentCountdown}s</div>
        </div>}

        <button onClick={dissolve} className="w-full rounded-[20px] border border-white/[0.08] bg-white/[0.03] py-3 text-sm font-semibold text-white/65 hover:border-rose-500/18 hover:bg-rose-500/[0.06] hover:text-rose-300 transition">{t("create.cta.cancel")}</button>
      </div>
    </section>}

    {phase==="expired"&&<section className="landing-story-card !p-0 overflow-hidden max-w-3xl">
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-2">{t("create.arenaCode")}</div>
        <div className="font-mono text-3xl tracking-[0.34em] text-white/18 line-through">{code}</div>
      </div>
      <div className="px-6 py-6">
        <p className="text-rose-300 text-sm leading-7 mb-4">{t("create.expired.msg")}</p>
        <button onClick={clearExpired} className="w-full rounded-[20px] bg-gradient-to-r from-rose-500 to-fuchsia-600 py-3 text-white text-sm font-semibold shadow-[0_0_30px_rgba(244,63,94,0.28)] transition">{t("create.expired.cta")}</button>
      </div>
    </section>}
  </div>;
}
