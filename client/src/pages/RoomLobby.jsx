import{useCallback,useEffect,useMemo,useRef,useState}from"react";
import{useNavigate,useParams,useLocation}from"react-router-dom";
import{Check,ChevronLeft,ChevronRight,Clock3,Copy,KeyRound,Power,Users}from"lucide-react";
import{useSocket}from"../hooks/useSocket";
import{useGame}from"../context/GameContext";
import{useWallet}from"../context/WalletContext";
import{useContract}from"../hooks/useContract";
import{PaymentModal}from"../components";
import{ENTRY_FEE,PAYMENT_TIMEOUT,SERVER_URL}from"../config/constants";
import{useT}from"../context/LangContext";
import GamePlay from"./GamePlay";
import roomLobbyBg from"../assets/room-created-bg-clean.jpg";
import{clearQuickMatchSession,writeQuickMatchSession}from"../utils/quickMatchSession";

function hash32(s){let h=2166136261>>>0;for(let i=0;i<(s||"").length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function SeatAvatar({seed,size=56}){
  const h=hash32(seed||"anon");
  const hue=h%360;
  const hue2=(hue+48)%360;
  return(
    <div className="room-lobby-seat-avatar" style={{width:size,height:size,background:`linear-gradient(135deg,hsl(${hue} 78% 60%),hsl(${hue2} 72% 45%))`}}>
      <svg viewBox="0 0 24 24" style={{width:Math.max(24,Math.round(size*0.44)),height:Math.max(24,Math.round(size*0.44))}} className="fill-white/95" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z"/></svg>
    </div>
  );
}

const roomLobbyBgLayer={
  position:"absolute",
  inset:0,
  backgroundImage:`url(${roomLobbyBg})`,
  backgroundPosition:"center",
  backgroundRepeat:"no-repeat",
  backgroundSize:"cover",
  filter:"brightness(0.9)",
  pointerEvents:"none",
};

const shortAddr=(a)=>!a?"—":`${a.slice(0,6)}…${a.slice(-4)}`;
const fmtCountdown=(s)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
const normalizeRoomPlayers=(players,current,wallet,owner)=>{
  if(Array.isArray(players)&&players.length)return players;
  const totalSlots=Math.max(Number(current)||0,wallet?1:0);
  return Array.from({length:totalSlots},(_,i)=>{
    if(i===0)return owner||wallet||`player-${i+1}`;
    return `player-${i+1}`;
  });
};
const topPillBaseStyle={
  display:"flex",
  alignItems:"center",
  gap:10,
  padding:"10px 16px",
  minHeight:46,
  borderRadius:999,
  border:"1px solid rgba(244,114,182,0.34)",
  background:"rgba(52,18,34,0.44)",
  boxShadow:"0 8px 18px rgba(4,6,20,0.18), inset 0 1px 0 rgba(255,255,255,0.05)",
  backdropFilter:"blur(12px)",
};
const topPillIconStyle={
  width:14,
  height:14,
  color:"rgba(255,245,249,0.95)",
  filter:"drop-shadow(0 0 8px rgba(255,255,255,0.4))",
  flexShrink:0,
};

export default function RoomLobby(){
  const nav=useNavigate();
  const{inviteCode:paramCode}=useParams();
  const loc=useLocation();
  const{emit,on}=useSocket();
  const{gameState,updateGame}=useGame();
  const{wallet,refund}=useWallet();
  const{payForRoomEntry,loading,shouldUseMockPayment,mockPay}=useContract();
  const t=useT();

  const initial=loc.state||{};
  const fromQuickMatch=!!initial.fromQuickMatch;
  const fromJoin=!!initial.fromJoin;
  const[code,setCode]=useState(paramCode||initial.inviteCode||"");
  const[phase,setPhase]=useState(initial.phase||"waiting");
  const[teamSize,setTeamSize]=useState(initial.teamSize||2);
  const[room,setRoom]=useState({current:Number(initial.current||1),players:Array.isArray(initial.players)?initial.players:(wallet?[wallet]:[])});
  const[roomExpiresAt,setRoomExpiresAt]=useState(initial.expiresAt||null);
  const[roomCountdown,setRoomCountdown]=useState(null);
  const[paymentStartedAt,setPaymentStartedAt]=useState(null);
  const[paymentCountdown,setPaymentCountdown]=useState(null);
  const[paymentProgress,setPaymentProgress]=useState({paidCount:0,total:0});
  const[roomFullInfo,setRoomFullInfo]=useState(null);
  const[roomOwner,setRoomOwner]=useState(initial.owner||null);
  const[paid,setPaid]=useState(false);
  const[err,setErr]=useState(null);
  const[hint,setHint]=useState(null);
  const[copied,setCopied]=useState(false);
  const[codeHovered,setCodeHovered]=useState(false);
  const[paymentTimeoutError,setPaymentTimeoutError]=useState(null);
  const[roomExitDialog,setRoomExitDialog]=useState(null);
  const[bootstrapped,setBootstrapped]=useState(false);

  const cancelPending=useRef(false);
  const phaseBeforeCancel=useRef("waiting");
  const resumeRequestAt=useRef(0);
  const paidRef=useRef(false);
  const confirmRetryRef=useRef({tries:0,timer:null});
  const paymentStartedAtRef=useRef(null);
  const quickMatchPaymentOpened=useRef(false);
  const expiredRedirectTimerRef=useRef(null);
  const inactiveRedirectTimerRef=useRef(null);
  const previousWalletRef=useRef(wallet);
  const walletSwitchedRef=useRef(false);
  const seatScrollerRef=useRef(null);
  const[seatScrollState,setSeatScrollState]=useState({canLeft:false,canRight:false});
  const codeHoverTimeoutRef=useRef(null);

  const isPaymentClosureReason=useCallback((reason="")=>/timed out|timeout|window closed|did not complete payment|room has been dissolved/i.test(String(reason)),[]);
  const isOwner=!!wallet&&!!roomOwner&&roomOwner.toLowerCase()===wallet.toLowerCase();
  const openRoomExitDialog=useCallback((title,subtitle)=>{
    if(expiredRedirectTimerRef.current){
      clearTimeout(expiredRedirectTimerRef.current);
      expiredRedirectTimerRef.current=null;
    }
    setHint(null);
    setErr(null);
    setRoomExpiresAt(null);
    setRoomCountdown(null);
    setPaymentStartedAt(null);
    setPaymentCountdown(null);
    setRoomFullInfo(null);
    setPaymentProgress({paidCount:0,total:0});
    setRoomExitDialog({title,subtitle});
  },[]);
  const showExpiredDialog=useCallback((subtitle=t("roomLobby.exit.expiredSubtitle"))=>{
    openRoomExitDialog(t("roomLobby.exit.expiredTitle"),subtitle);
  },[openRoomExitDialog,t]);
  const showClosedDialog=useCallback((subtitle=t("roomLobby.exit.closedSubtitle"))=>{
    openRoomExitDialog(t("roomLobby.exit.closedTitle"),subtitle);
  },[openRoomExitDialog,t]);

  const resetLobbyState=useCallback(()=>{
    cancelPending.current=false;
    phaseBeforeCancel.current="waiting";
    resumeRequestAt.current=0;
    paidRef.current=false;
    quickMatchPaymentOpened.current=false;
    if(confirmRetryRef.current.timer)clearTimeout(confirmRetryRef.current.timer);
    confirmRetryRef.current={tries:0,timer:null};
    if(expiredRedirectTimerRef.current){
      clearTimeout(expiredRedirectTimerRef.current);
      expiredRedirectTimerRef.current=null;
    }
    if(inactiveRedirectTimerRef.current){
      clearTimeout(inactiveRedirectTimerRef.current);
      inactiveRedirectTimerRef.current=null;
    }
    setCode("");
    setPhase("waiting");
    setTeamSize(2);
    setRoom({current:0,players:[]});
    setRoomExpiresAt(null);
    setRoomCountdown(null);
    setPaymentStartedAt(null);
    setPaymentCountdown(null);
    setPaymentProgress({paidCount:0,total:0});
    setRoomFullInfo(null);
    setRoomOwner(null);
    setPaid(false);
    setErr(null);
    setHint(null);
    setCopied(false);
    setCodeHovered(false);
    setPaymentTimeoutError(null);
    setRoomExitDialog(null);
  },[]);

  useEffect(()=>()=>{if(codeHoverTimeoutRef.current)clearTimeout(codeHoverTimeoutRef.current);},[]);

  const openPayment=useCallback((d={})=>{
    const total=Number(d?.total||d?.players?.length||0);
    const players=Array.isArray(d?.players)?d.players:[];
    if(!total)return;
    if(d?.owner)setRoomOwner(d.owner);
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
    if(players.length){setRoom({current:total,players});setTeamSize(total);}
    setPhase(current=>current==="waiting"||current==="creating"||current==="preparing"?"payment":current);
  },[code,wallet]);

  const handlePaymentFailure=useCallback((reason)=>{
    const r=reason||t("create.err.teamDisbanded");
    if(paid){refund(ENTRY_FEE);setPaid(false);}
    if(fromQuickMatch)clearQuickMatchSession(wallet);
    setPaymentStartedAt(null);
    setPaymentCountdown(null);
    setRoomFullInfo(null);
    setHint(null);
    setPaymentTimeoutError(r);
    setErr(null);
    setPhase("dissolved");
  },[paid,refund,t,fromQuickMatch,wallet]);
  const leaveLobby=useCallback(()=>{
    emit("room:leave");
    if(paidRef.current){
      refund(ENTRY_FEE);
      setPaid(false);
    }
    resetLobbyState();
    nav("/dashboard",{replace:true});
  },[emit,nav,refund,resetLobbyState]);
  const confirmLobbyExit=useCallback(()=>{
    resetLobbyState();
    nav("/dashboard",{replace:true});
  },[nav,resetLobbyState]);

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
    if(!fromQuickMatch||!code)return;
    writeQuickMatchSession({
      wallet:wallet||"",
      inviteCode:code,
      teamSize,
      total:teamSize,
      current:room.current||room.players?.length||teamSize,
      players:Array.isArray(room.players)?room.players:[],
      gameId:roomFullInfo?.gameId||initial.gameId||null,
      chainGameId:roomFullInfo?.chainGameId||initial.chainGameId||null,
      phase:"preparing",
      readyForPayment:!!(initial.readyForPayment||roomFullInfo?.gameId||roomFullInfo?.chainGameId||phase==="payment"||phase==="paid_waiting"),
    });
  },[fromQuickMatch,code,wallet,teamSize,room.current,room.players,roomFullInfo,initial.gameId,initial.chainGameId,initial.readyForPayment,phase]);

  useEffect(()=>{
    const previousWallet=previousWalletRef.current;
    const walletSwitched=!!(previousWallet&&wallet&&previousWallet.toLowerCase()!==wallet.toLowerCase());
    walletSwitchedRef.current=walletSwitched;
    if(walletSwitched){
      resetLobbyState();
      setBootstrapped(false);
    }else if(previousWallet&&!wallet){
      nav("/login?next=/dashboard",{replace:true});
    }
    previousWalletRef.current=wallet;
  },[wallet,nav,resetLobbyState]);

  // Bootstrap from server if we landed here directly or on refresh
  useEffect(()=>{
    if(!wallet){setBootstrapped(true);return;}
    const walletSwitched=walletSwitchedRef.current;
    if(fromQuickMatch&&!walletSwitched){setBootstrapped(true);return;}
    let cancelled=false;
    setBootstrapped(false);
    fetch(`${SERVER_URL}/api/users/${wallet}/open-room`)
      .then(r=>r.json())
      .then(d=>{
        if(cancelled)return;
        walletSwitchedRef.current=false;
        const rm=d?.room;
        if(!rm?.invite_code){
          setBootstrapped(true);
          emit("game:resume:request");
          if(inactiveRedirectTimerRef.current)clearTimeout(inactiveRedirectTimerRef.current);
          inactiveRedirectTimerRef.current=setTimeout(()=>{
            if(!cancelled)nav("/dashboard",{replace:true});
          },900);
          return;
        }
        if(inactiveRedirectTimerRef.current){
          clearTimeout(inactiveRedirectTimerRef.current);
          inactiveRedirectTimerRef.current=null;
        }
        const inviteCode=rm.invite_code;
        if(paramCode&&paramCode.toUpperCase()!==inviteCode.toUpperCase()){
          nav(`/room/${inviteCode}`,{replace:true});
          return;
        }
        const current=rm.current_players||rm.players?.length||0;
        const players=normalizeRoomPlayers(rm.players,current,wallet,rm.owner);
        const total=rm.max_players||players.length||0;
        setCode(inviteCode);
        setTeamSize(total);
        setRoomOwner(rm.owner||null);
        setRoom({current,players});
        setRoomFullInfo({
          gameId:rm.game_id||rm.id,
          chainGameId:rm.chain_game_id||null,
          inviteCode,
          maxPlayers:total,
          owner:rm.owner||wallet||null,
          auth:rm.auth||null,
          players,
          paymentTimeout:rm.payment_timeout_ms||PAYMENT_TIMEOUT*1000,
        });
        setPaymentProgress({paidCount:rm.paid_count||0,total:rm.total_players||total});
        if(rm.phase==="payment"||rm.phase==="paid_waiting"){
          setPaid(rm.phase==="paid_waiting");
          const startedAt=rm.payment_started_at?new Date(rm.payment_started_at).getTime():null;
          setPaymentStartedAt(startedAt);
          setRoomExpiresAt(null);
          setPhase(rm.phase);
        }else if(rm.phase==="preparing"){
          setPaid(false);
          setPaymentStartedAt(null);
          setRoomExpiresAt(null);
          setPhase("preparing");
        }else{
          const expiresAt=rm.expires_at?new Date(rm.expires_at).getTime():null;
          setPaid(false);
          setPaymentStartedAt(null);
          if(expiresAt)setRoomExpiresAt(expiresAt);
          setPhase("waiting");
        }
        setBootstrapped(true);
      })
      .catch(()=>{
        walletSwitchedRef.current=false;
        setBootstrapped(true);
      });
    return()=>{cancelled=true;};
  },[wallet,paramCode,fromQuickMatch,nav]);

  // For quick match: open payment modal immediately once bootstrapped
  useEffect(()=>{
    if(!bootstrapped||!fromQuickMatch||!initial.readyForPayment||quickMatchPaymentOpened.current)return;
    quickMatchPaymentOpened.current=true;
    openPayment({gameId:initial.gameId||null,chainGameId:initial.chainGameId||null,players:initial.players||[],total:initial.teamSize||0,inviteCode:initial.inviteCode||code,paymentTimeout:PAYMENT_TIMEOUT*1000});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[bootstrapped]);

  useEffect(()=>{
    const u=[
      on("room:created",d=>{cancelPending.current=false;phaseBeforeCancel.current="waiting";setHint(null);setCode(d.inviteCode);setRoomOwner(wallet||null);setRoomExpiresAt(d.expiresAt);setRoom(prev=>prev.players?.length?prev:{current:1,players:[wallet]});setPhase("waiting");}),
      on("room:update",d=>{setRoom({current:d.current,players:d.players});if(d.owner)setRoomOwner(d.owner);if(d.total)setTeamSize(d.total);if(d.expiresAt)setRoomExpiresAt(d.expiresAt);if((d.status==="full"||(d.total&&d.current>=d.total))&&(d.paymentOpen||d.chainGameId))openPayment(d);}),
      on("room:preparing",d=>{if(d?.owner)setRoomOwner(d.owner);setRoomFullInfo(prev=>({gameId:d?.gameId||prev?.gameId||null,chainGameId:d?.chainGameId||prev?.chainGameId||null,inviteCode:d?.inviteCode||prev?.inviteCode||code,maxPlayers:d?.total||prev?.maxPlayers||0,owner:d?.owner||prev?.owner||wallet||null,auth:null,players:Array.isArray(d?.players)?d.players:(prev?.players||[]),paymentTimeout:d?.timeoutMs||prev?.paymentTimeout||PAYMENT_TIMEOUT*1000}));setPaymentProgress({paidCount:0,total:d?.total||d?.players?.length||0});setPaymentStartedAt(null);setRoomExpiresAt(null);setRoomCountdown(null);setPhase(current=>current==="waiting"||current==="creating"?"preparing":current);}),
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
      on("room:dissolved",d=>{const selfCancelled=cancelPending.current;const reason=d?.reason||null;cancelPending.current=false;phaseBeforeCancel.current="waiting";setHint(null);if(paid){refund(ENTRY_FEE);setPaid(false);}setErr(null);setRoomExpiresAt(null);setRoomCountdown(null);setPaymentStartedAt(null);setPaymentCountdown(null);setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});setPhase("dissolved");showClosedDialog(selfCancelled||isPaymentClosureReason(reason)?t("roomLobby.exit.closedSubtitle"):reason||t("roomLobby.exit.closedSubtitle"));}),
      on("room:expired",()=>{setRoomExpiresAt(null);setRoomCountdown(null);setPhase("expired");showExpiredDialog();}),
      on("room:payment:update",d=>{setPaymentProgress({paidCount:d.paidCount,total:d.total});confirmRetryRef.current.tries=0;if(confirmRetryRef.current.timer){clearTimeout(confirmRetryRef.current.timer);confirmRetryRef.current.timer=null;}setHint(null);setErr(null);}),
      on("room:payment:failed",d=>{const reason=d?.reason||t("create.err.teamDisbanded");if(isPaymentClosureReason(reason)){handlePaymentFailure(reason);return;}setPaymentStartedAt(null);setPaymentCountdown(null);setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});setPaymentTimeoutError(null);setHint(null);setErr(null);setPhase("dissolved");showClosedDialog(reason||t("roomLobby.exit.closedSubtitle"));}),
      on("game:start",d=>{if(inactiveRedirectTimerRef.current){clearTimeout(inactiveRedirectTimerRef.current);inactiveRedirectTimerRef.current=null;}const nextPlayers=Array.isArray(d.players)?d.players:[];const nextTotal=d.players.length;updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:nextTotal,players:nextPlayers,phase:"predicting",basePrice:d.basePrice,countdown:Math.round((d.predictTimeout||60000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null});setRoom({current:nextPlayers.length,players:nextPlayers});setTeamSize(nextTotal||teamSize);setRoomOwner(nextPlayers[0]||null);if(d.inviteCode)setCode(d.inviteCode);setRoomExpiresAt(null);setRoomCountdown(null);setPaymentStartedAt(null);setPaymentCountdown(null);setPaymentTimeoutError(null);setErr(null);setHint(null);setBootstrapped(true);if(fromQuickMatch){clearQuickMatchSession(wallet);setTimeout(()=>nav("/game"),50);return;}setPhase("in_game");}),
      on("game:resume",d=>{if(inactiveRedirectTimerRef.current){clearTimeout(inactiveRedirectTimerRef.current);inactiveRedirectTimerRef.current=null;}const nextPlayers=Array.isArray(d.players)?d.players:[];const nextTotal=d.players?.length||d.totalPlayers||0;updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:nextTotal,players:nextPlayers,phase:d.phase==="settling"?"settling":"predicting",basePrice:d.basePrice,countdown:d.remaining||Math.round((d.predictTimeout||60000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null,currentPrice:d.currentPrice||d.basePrice});setRoom({current:nextPlayers.length||nextTotal,players:nextPlayers});setTeamSize(nextTotal||teamSize);setRoomOwner(nextPlayers[0]||null);if(d.inviteCode)setCode(d.inviteCode);setRoomExpiresAt(null);setRoomCountdown(null);setPaymentStartedAt(null);setPaymentCountdown(null);setPaymentTimeoutError(null);setErr(null);setHint(null);setBootstrapped(true);if(fromQuickMatch){clearQuickMatchSession(wallet);setTimeout(()=>nav("/game"),50);return;}setPhase("in_game");}),
      on("match:found",d=>{if(!fromQuickMatch||quickMatchPaymentOpened.current)return;quickMatchPaymentOpened.current=true;openPayment({gameId:d.gameId||null,chainGameId:d.chainGameId||null,players:d.players||[],total:d.teamSize||0,inviteCode:d.inviteCode||code,paymentTimeout:PAYMENT_TIMEOUT*1000});}),
    ];
    return()=>u.forEach(f=>f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[on,code,updateGame,nav,handlePaymentFailure,wallet,isPaymentClosureReason,openPayment,fromQuickMatch]);

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

  useEffect(()=>()=>{if(expiredRedirectTimerRef.current)clearTimeout(expiredRedirectTimerRef.current);if(inactiveRedirectTimerRef.current)clearTimeout(inactiveRedirectTimerRef.current);},[]);
  useEffect(()=>{
    if(roomExitDialog||paymentTimeoutError)return;
    if(phase==="expired"||(phase==="waiting"&&roomCountdown===0)){
      if(phase!=="expired")setPhase("expired");
      showExpiredDialog();
    }
  },[phase,roomCountdown,roomExitDialog,paymentTimeoutError,showExpiredDialog]);

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
      if(fromQuickMatch){
        if(roomFullInfo){emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:paymentResult?.chainGameId||roomFullInfo.chainGameId||null,inviteCode:code,wallet});setPhase("paid_waiting");}
        return;
      }
      if(roomFullInfo){emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:paymentResult?.chainGameId||roomFullInfo.chainGameId||null,inviteCode:code,wallet});setPhase("paid_waiting");}
    }catch(e){
      const startedAtCatch=paymentStartedAtRef.current;
      const deadlineCatch=startedAtCatch?startedAtCatch+PAYMENT_TIMEOUT*1000:null;
      if(deadlineCatch&&Date.now()>=deadlineCatch)return;
      const msg=e?.message||t("create.err.paymentFailed");
      if(msg==="Payment was already submitted for this game."&&roomFullInfo){
        setErr(null);
        setHint(null);
        setPaid(true);
        paidRef.current=true;
        setPaymentProgress(prev=>({paidCount:Math.min(prev.total||roomFullInfo?.maxPlayers||1,Math.max(prev.paidCount||0,1)),total:prev.total||roomFullInfo?.maxPlayers||1}));
        emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:roomFullInfo.chainGameId||null,inviteCode:code,wallet});
        setPhase("paid_waiting");
        return;
      }
      setErr(msg);
    }
  },[payForRoomEntry,roomFullInfo,code,emit,wallet,refund,handlePaymentFailure,t,fromQuickMatch,updateGame,nav]);

  const dissolve=useCallback(()=>{
    if(phase==="expired"||(phase==="waiting"&&roomCountdown===0)){
      setPhase("expired");
      showExpiredDialog();
      return;
    }
    cancelPending.current=true;phaseBeforeCancel.current=phase;
    setErr(null);setHint(t("create.cancelling"));setRoomCountdown(null);
    emit("room:dissolve",{inviteCode:code});
    setPhase("dissolving");
  },[emit,code,phase,t,nav,roomCountdown]);

  const confirmPaymentTimeoutError=useCallback(()=>{
    setPaymentTimeoutError(null);
    confirmLobbyExit();
  },[confirmLobbyExit]);
  const hideCodeHintSoon=useCallback(()=>{
    if(codeHoverTimeoutRef.current)clearTimeout(codeHoverTimeoutRef.current);
    codeHoverTimeoutRef.current=setTimeout(()=>setCodeHovered(false),60);
  },[]);
  const copyCode=useCallback(()=>{navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),2000);},[code]);
  const shareToX=useCallback(()=>{
    if(typeof window==="undefined")return;
    const roomUrl=`${window.location.origin}/room/${code}`;
    const text=t("home.share.text",{code,url:roomUrl});
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,"_blank","noopener,noreferrer");
  },[code,t]);

  const seats=useMemo(()=>{
    const size=teamSize||Math.max(room.current,2);
    return Array.from({length:size}).map((_,i)=>({filled:i<room.players.length,addr:room.players[i]||null,isSelf:room.players[i]&&wallet&&room.players[i].toLowerCase()===wallet.toLowerCase(),isHost:i===0}));
  },[teamSize,room,wallet]);

  const isEmbeddedGame=phase==="in_game"&&["predicting","settling","result","failed"].includes(gameState.phase);
  const totalSeats=teamSize||Math.max(room.current,2);
  const readyCount=room.current;
  const remainingSeats=Math.max(totalSeats-readyCount,0);
  const scrollSeatLayout=totalSeats>=4;
  const seatRows=useMemo(()=>{
    const indexed=seats.map((seat,index)=>({seat,index}));
    return[indexed];
  },[seats,totalSeats]);
  const isRoomLocallyExpired=phase==="expired"||(phase==="waiting"&&roomCountdown===0);
  const progressText=isEmbeddedGame
    ? gameState.phase==="predicting"
      ? t("roomLobby.progress.roundLive")
      : gameState.phase==="settling"
        ? t("roomLobby.progress.settlement")
        : gameState.phase==="result"
          ? t("roomLobby.progress.roundSettled")
          : t("roomLobby.progress.recovery")
    : phase==="payment"||phase==="paid_waiting"
    ? t("roomLobby.progress.paid",{paid:paymentProgress.paidCount||0,total:paymentProgress.total||totalSeats})
    : t("roomLobby.progress.ready",{ready:readyCount,total:totalSeats});
  const stageCopy=(()=>{
    if(isEmbeddedGame){
      if(gameState.phase==="predicting")return{title:t("roomLobby.stage.predicting.title"),subtitle:t("roomLobby.stage.predicting.subtitle")};
      if(gameState.phase==="settling")return{title:t("roomLobby.stage.settling.title"),subtitle:t("roomLobby.stage.settling.subtitle")};
      if(gameState.phase==="result")return{title:t("roomLobby.stage.result.title"),subtitle:t("roomLobby.stage.result.subtitle")};
      if(gameState.phase==="failed")return{title:t("roomLobby.stage.failed.title"),subtitle:t("roomLobby.stage.failed.subtitle")};
    }
    if(fromQuickMatch){
      if(phase==="payment")return{title:t("roomLobby.stage.matchFound.title"),subtitle:t("roomLobby.stage.matchFound.subtitle")};
      if(phase==="paid_waiting")return{title:t("roomLobby.stage.paymentConfirmed.title"),subtitle:t("roomLobby.stage.paymentConfirmed.subtitle")};
      return{title:t("roomLobby.stage.preparing.title"),subtitle:t("roomLobby.stage.quickPreparing.subtitle")};
    }
    if(phase==="payment")return{title:t("roomLobby.stage.roomLocked.title"),subtitle:t("roomLobby.stage.roomLocked.subtitle")};
    if(phase==="paid_waiting")return{title:t("roomLobby.stage.paymentConfirmed.title"),subtitle:t("roomLobby.stage.paymentConfirmed.roomSubtitle")};
    if(phase==="preparing")return{title:t("roomLobby.stage.preparing.title"),subtitle:t("roomLobby.stage.preparing.subtitle")};
    if(phase==="dissolving")return{title:t("roomLobby.stage.closing.title"),subtitle:t("roomLobby.stage.closing.subtitle")};
    if(isRoomLocallyExpired)return{title:t("roomLobby.stage.expired.title"),subtitle:t("roomLobby.stage.expired.subtitle")};
    if(phase==="dissolved")return{title:t("roomLobby.stage.closed.title"),subtitle:t("roomLobby.stage.closed.subtitle")};
    return{
      title:t("roomLobby.stage.waiting.title"),
      subtitle:remainingSeats>0
        ? t(remainingSeats===1?"roomLobby.stage.waiting.subtitle.one":"roomLobby.stage.waiting.subtitle.many",{n:remainingSeats})
        :t("roomLobby.stage.waiting.subtitle.full")
    };
  })();
  const footerHint=phase==="waiting"
    ? t("roomLobby.footer.waiting")
    : phase==="preparing"
      ? t("roomLobby.footer.preparing")
      : phase==="payment"||phase==="paid_waiting"
        ? t("roomLobby.footer.payment")
        : t("roomLobby.footer.default");
  const topActionLabel=isEmbeddedGame?t("roomLobby.action.matchLive"):fromQuickMatch?t("roomLobby.action.leaveLobby"):isOwner?t("roomLobby.action.cancelRoom"):t("roomLobby.action.leaveRoom");
  const handleTopAction=isEmbeddedGame?undefined:fromQuickMatch?()=>nav("/"):isOwner?dissolve:leaveLobby;
  const scrollSeats=useCallback((direction)=>{
    const el=seatScrollerRef.current;
    if(!el)return;
    el.scrollBy({left:direction*198,behavior:"smooth"});
  },[]);
  const syncSeatScrollState=useCallback(()=>{
    const el=seatScrollerRef.current;
    if(!el||!scrollSeatLayout){
      setSeatScrollState({canLeft:false,canRight:false});
      return;
    }
    const maxScroll=Math.max(0,el.scrollWidth-el.clientWidth);
    setSeatScrollState({
      canLeft:el.scrollLeft>2,
      canRight:el.scrollLeft<maxScroll-2,
    });
  },[scrollSeatLayout]);
  useEffect(()=>{
    syncSeatScrollState();
    const el=seatScrollerRef.current;
    if(!el)return;
    el.addEventListener("scroll",syncSeatScrollState,{passive:true});
    window.addEventListener("resize",syncSeatScrollState);
    const raf=requestAnimationFrame(syncSeatScrollState);
    return()=>{
      el.removeEventListener("scroll",syncSeatScrollState);
      window.removeEventListener("resize",syncSeatScrollState);
      cancelAnimationFrame(raf);
    };
  },[syncSeatScrollState,seats.length]);
  const lobbyCenterContent=(
    <>
      <div className="room-lobby-hero-copy" style={{textAlign:'center',width:'100%',maxWidth:760,padding:'0 20px',boxSizing:'border-box',marginTop:0,marginBottom:12}}>
        <div style={{fontSize:10,letterSpacing:'0.32em',color:'rgba(255,255,255,0.24)',fontFamily:'monospace',marginBottom:10,textTransform:'uppercase'}}>
          {fromQuickMatch?t("roomLobby.kicker.live"):t("roomLobby.kicker.private")}
        </div>
        <h1 style={{display:'block',width:'100%',maxWidth:'100%',fontSize:'clamp(26px,3.2vw,42px)',fontWeight:900,background:'linear-gradient(135deg,#e0f9ff 0%,#67e8f9 35%,#c084fc 75%,#f0abfc 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text',letterSpacing:'-0.04em',lineHeight:1.24,margin:0,paddingBottom:'0.14em',whiteSpace:'normal',overflow:'visible',overflowWrap:'anywhere',wordBreak:'normal',textWrap:'balance'}}>
          {stageCopy.title}
        </h1>
        <p style={{margin:'20px auto 0',maxWidth:440,fontSize:13,lineHeight:1.95,color:'rgba(255,255,255,0.54)'}}>
          {stageCopy.subtitle}
        </p>
      </div>

      <div className="room-lobby-seats-area" style={{width:'min(1080px,100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:18,marginTop:scrollSeatLayout?26:34,marginBottom:12}}>
        {seatRows.map((row,rowIndex)=>(
          <div key={rowIndex} className="room-lobby-seat-row" style={{position:'relative',width:'100%',maxWidth:scrollSeatLayout?'576px':'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
            {scrollSeatLayout&&seatScrollState.canLeft&&(
              <button type="button" aria-label={t("roomLobby.seats.prev")} onClick={()=>scrollSeats(-1)} style={{position:'absolute',left:-44,top:'50%',transform:'translateY(-50%)',width:34,height:34,borderRadius:999,border:'1px solid rgba(244,114,182,0.22)',background:'rgba(12,10,24,0.72)',color:'rgba(255,255,255,0.82)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',backdropFilter:'blur(10px)',boxShadow:'0 12px 24px rgba(4,6,20,0.28)',zIndex:2}}>
                <ChevronLeft size={18} strokeWidth={2.4}/>
              </button>
            )}
            <div ref={rowIndex===0?seatScrollerRef:null} className="room-lobby-seat-strip hide-scrollbar" style={{display:'flex',alignItems:'flex-start',justifyContent:scrollSeatLayout?'flex-start':'center',gap:18,flexWrap:'nowrap',width:'100%',maxWidth:'100%',overflowX:scrollSeatLayout?'auto':'visible',overflowY:'visible',padding:'0 0 10px',scrollSnapType:scrollSeatLayout?'x mandatory':undefined,WebkitOverflowScrolling:'touch',boxSizing:'border-box'}}>
              {row.map(({seat,index})=>renderPod(seat,index,scrollSeatLayout))}
            </div>
            {scrollSeatLayout&&seatScrollState.canRight&&(
              <button type="button" aria-label={t("roomLobby.seats.next")} onClick={()=>scrollSeats(1)} style={{position:'absolute',right:-44,top:'50%',transform:'translateY(-50%)',width:34,height:34,borderRadius:999,border:'1px solid rgba(244,114,182,0.22)',background:'rgba(12,10,24,0.72)',color:'rgba(255,255,255,0.82)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',backdropFilter:'blur(10px)',boxShadow:'0 12px 24px rgba(4,6,20,0.28)',zIndex:2}}>
                <ChevronRight size={18} strokeWidth={2.4}/>
              </button>
            )}
          </div>
        ))}
        {scrollSeatLayout&&<div style={{fontSize:9,fontFamily:'monospace',letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(255,255,255,0.34)',marginTop:-4}}>{t("roomLobby.seats.scrollHint")}</div>}
      </div>
    </>
  );

  if(!bootstrapped&&!initial.fromCreate&&!fromJoin){
    return(
      <div style={{minHeight:'100vh',background:'#06060f',display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden'}}>
        <div style={roomLobbyBgLayer}/>
        <div className="room-lobby-beam"/>
        <div style={{color:'rgba(255,255,255,0.3)',fontSize:13,letterSpacing:'0.26em',textTransform:'uppercase',animation:'ellipsisPulse 1.4s ease-in-out infinite'}}>{t("roomLobby.loading")}</div>
      </div>
    );
  }

  const showRoomCountdown=roomCountdown!==null&&room.current<(teamSize||2)&&phase==="waiting";
  const showPaymentCountdown=paymentCountdown!==null&&paymentCountdown>0&&phase==="paid_waiting";
  const showExpiredRoomCountdown=phase==="expired";

  /* ── player pod renderer ── */
  function renderPod(seat,i,scrollable=false){
    const self=seat.isSelf;
    const filled=seat.filled;
    const emptyExpired=!filled&&isRoomLocallyExpired;
    const cardShadow=filled
      ? `0 18px 38px rgba(4,6,20,0.34), 0 0 0 1px rgba(255,255,255,0.02) inset`
      : '0 10px 22px rgba(4,6,20,0.22)';
    const borderColor=self?"rgba(236,72,153,0.38)":filled?"rgba(34,211,238,0.24)":"rgba(255,255,255,0.08)";
    const accent=self?"#ec4899":"#22d3ee";
    const cardBg=filled
      ? self
        ? "linear-gradient(180deg,rgba(236,72,153,0.12) 0%,rgba(7,8,20,0.94) 52%)"
        : "linear-gradient(180deg,rgba(34,211,238,0.1) 0%,rgba(7,8,20,0.94) 52%)"
      : emptyExpired
        ? "linear-gradient(180deg,rgba(255,255,255,0.015) 0%,rgba(7,8,20,0.78) 55%)"
        : "linear-gradient(180deg,rgba(255,255,255,0.02) 0%,rgba(7,8,20,0.82) 55%)";
    return(
      <div key={i} className="room-lobby-player-pod" style={{position:'relative',width:'min(180px,28vw)',minWidth:144,flex:'0 0 auto',scrollSnapAlign:scrollable?'center':undefined,display:'flex',flexDirection:'column',alignItems:'center',padding:'20px 14px 18px',borderRadius:20,background:cardBg,border:`1px solid ${borderColor}`,backdropFilter:'blur(10px)',boxShadow:cardShadow,animation:'rlSeatIn 0.45s cubic-bezier(0.22,1,0.36,1) both'}}
        onMouseEnter={e=>{
          e.currentTarget.style.transform='translateY(-3px)';
          e.currentTarget.style.borderColor=filled?accent:'rgba(255,255,255,0.16)';
          e.currentTarget.style.boxShadow=filled?`0 20px 44px rgba(4,6,20,0.4),0 0 16px ${self?'rgba(236,72,153,0.2)':'rgba(34,211,238,0.16)'}`:emptyExpired?cardShadow:'0 14px 26px rgba(4,6,20,0.28)';
        }}
        onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.borderColor=borderColor;e.currentTarget.style.boxShadow=cardShadow;}}>
        <div style={{position:'absolute',inset:0,pointerEvents:'none',borderRadius:22,background:filled?`radial-gradient(circle at top, ${self?'rgba(236,72,153,0.16)':'rgba(34,211,238,0.14)'} 0%, transparent 55%)`:'none'}}/>
        <div style={{position:'absolute',top:0,left:'16%',right:'16%',height:1,background:filled?`linear-gradient(90deg,transparent,${accent},transparent)`:'rgba(255,255,255,0.05)'}}/>
        <div style={{position:'relative',marginBottom:14}}>
          {filled?(
            <>
              <div style={{position:'absolute',inset:-8,borderRadius:'50%',background:self?'radial-gradient(circle,rgba(236,72,153,0.28) 0%,transparent 70%)':'radial-gradient(circle,rgba(34,211,238,0.22) 0%,transparent 70%)',filter:'blur(8px)'}}/>
              <div style={{position:'relative',width:88,height:88,borderRadius:'50%',border:`2px solid ${accent}`,boxShadow:`0 0 0 5px ${self?'rgba(236,72,153,0.08)':'rgba(34,211,238,0.07)'},0 0 24px ${self?'rgba(236,72,153,0.24)':'rgba(34,211,238,0.2)'}`,display:'flex',alignItems:'center',justifyContent:'center',background:'#090b1b'}}>
                <SeatAvatar seed={seat.addr} size={60}/>
              </div>
              {self&&<div style={{position:'absolute',top:-8,left:'50%',transform:'translateX(-50%)',background:'linear-gradient(135deg,#a855f7,#ec4899)',padding:'3px 10px',borderRadius:20,fontSize:8,fontWeight:900,color:'#fff',letterSpacing:'0.16em',whiteSpace:'nowrap',boxShadow:'0 0 12px rgba(168,85,247,0.45)'}}>{t("roomLobby.seat.you")}</div>}
            </>
          ):(
            <div style={{width:88,height:88,borderRadius:'50%',border:'1.5px dashed rgba(255,255,255,0.12)',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,0.015)',animation:emptyExpired?'none':'avatarPulseGlow 3s ease-in-out infinite'}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:emptyExpired?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.1)'}}/>
            </div>
          )}
        </div>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:'0.04em',color:filled?(self?'rgba(244,114,182,0.92)':'rgba(255,255,255,0.62)'):'rgba(255,255,255,0.2)',marginBottom:8}}>
          {filled?shortAddr(seat.addr):emptyExpired?t("roomLobby.seat.roomExpired"):t("roomLobby.seat.waiting")}
        </div>
        <div style={{height:1,width:'78%',background:filled?`linear-gradient(90deg,transparent,${self?'rgba(236,72,153,0.26)':'rgba(34,211,238,0.22)'},transparent)`:'rgba(255,255,255,0.05)',marginBottom:9}}/>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:7.5,fontFamily:'monospace',letterSpacing:'0.22em',textTransform:'uppercase',color:filled?(self?'rgba(244,114,182,0.84)':'rgba(103,232,249,0.78)'):'rgba(255,255,255,0.22)'}}>
          <div style={{width:5,height:5,borderRadius:'50%',background:filled?accent:'rgba(255,255,255,0.14)',boxShadow:filled?`0 0 8px ${accent}`:'none',animation:filled?'avatarPulseGlow 1.6s ease-in-out infinite':'none'}}/>
          {self?t("roomLobby.seat.youReady"):filled?(seat.isHost?t("roomLobby.seat.hostReady"):t("roomLobby.seat.playerReady")):emptyExpired?t("roomLobby.seat.expired"):t("roomLobby.seat.open")}
        </div>
      </div>
    );
  }

  return(
    <div className="room-lobby-page" style={{minHeight:'100vh',background:'#06060f',display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
      <div style={roomLobbyBgLayer}/>

      <header className="room-lobby-topbar" style={{position:'relative',zIndex:10,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'24px 28px 0',flexWrap:'wrap'}}>
        <div className="room-lobby-topbar-left" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <div className="room-lobby-top-pill" style={{...topPillBaseStyle,border:'1px solid rgba(244,114,182,0.34)',background:'rgba(52,18,34,0.44)'}}>
            <Users style={topPillIconStyle} strokeWidth={2.1}/>
            <span style={{fontFamily:'monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(255,255,255,0.92)'}}>
              {progressText}
            </span>
          </div>
          <button
            className="room-lobby-top-pill room-lobby-action-pill"
            type="button"
            onClick={handleTopAction}
            disabled={isEmbeddedGame}
            style={{...topPillBaseStyle,color:isEmbeddedGame?'rgba(255,255,255,0.36)':'rgba(255,255,255,0.82)',fontSize:10,fontFamily:'monospace',letterSpacing:'0.18em',textTransform:'uppercase',cursor:isEmbeddedGame?'not-allowed':'pointer',transition:'all 0.2s',opacity:isEmbeddedGame?0.72:1}}
            onMouseEnter={e=>{if(isEmbeddedGame)return;e.currentTarget.style.borderColor='rgba(244,63,94,0.38)';e.currentTarget.style.background='rgba(36,16,28,0.52)';e.currentTarget.style.color='rgba(255,240,244,0.98)';}}
            onMouseLeave={e=>{if(isEmbeddedGame)return;e.currentTarget.style.borderColor='rgba(244,114,182,0.34)';e.currentTarget.style.background='rgba(52,18,34,0.44)';e.currentTarget.style.color='rgba(255,255,255,0.82)';}}
          >
            <Power style={topPillIconStyle} strokeWidth={2.2}/>
            {topActionLabel}
          </button>
        </div>
        <div className="room-lobby-topbar-right" style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:10,marginLeft:'auto',flexWrap:'wrap'}}>
          {!fromQuickMatch?(
            <div className="room-lobby-code-wrap" style={{position:'relative'}}>
              <div
                className="room-lobby-top-pill room-lobby-code-pill"
                style={{...topPillBaseStyle,padding:'8px 10px 8px 14px'}}
                onMouseLeave={e=>{hideCodeHintSoon();e.currentTarget.style.borderColor='rgba(244,114,182,0.34)';e.currentTarget.style.background='rgba(52,18,34,0.44)';}}
              >
                <KeyRound style={topPillIconStyle} strokeWidth={2.1}/>
                <div
                  style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:2,minWidth:0}}
                  onMouseEnter={()=>{if(codeHoverTimeoutRef.current)clearTimeout(codeHoverTimeoutRef.current);setCodeHovered(true);}}
                  onMouseLeave={hideCodeHintSoon}
                  onFocus={()=>setCodeHovered(true)}
                  onBlur={hideCodeHintSoon}
                  tabIndex={0}
                >
                  <span style={{color:'rgba(255,255,255,0.56)',fontSize:8,fontFamily:'monospace',letterSpacing:'0.18em',textTransform:'uppercase',lineHeight:1.1}}>{t("roomLobby.arenaCode")}</span>
                  <span style={{color:'rgba(255,255,255,0.92)',fontSize:12,fontFamily:'monospace',letterSpacing:'0.24em',fontWeight:700,lineHeight:1.1}}>{code||"······"}</span>
                </div>
                <div className="room-lobby-code-actions" style={{marginLeft:6,display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                  <button
                    type="button"
                    aria-label={t("roomLobby.shareXAria")}
                    onClick={shareToX}
                    onMouseEnter={()=>setCodeHovered(false)}
                    onFocus={()=>setCodeHovered(false)}
                    style={{width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:999,border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.78)',cursor:'pointer',flexShrink:0,fontSize:13,fontWeight:900,fontFamily:'monospace'}}
                  >
                    𝕏
                  </button>
                  <button
                    type="button"
                    aria-label={copied?t("roomLobby.copy.copied"):t("roomLobby.copy.aria")}
                    onClick={copyCode}
                    onMouseEnter={()=>setCodeHovered(false)}
                    onFocus={()=>setCodeHovered(false)}
                    style={{width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:999,border:'1px solid rgba(255,255,255,0.12)',background:copied?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.05)',color:copied?'#86efac':'rgba(255,255,255,0.78)',cursor:'pointer',flexShrink:0}}
                  >
                    {copied?<Check size={14} strokeWidth={2.4}/>:<Copy size={14} strokeWidth={2.1}/>}
                  </button>
                </div>
              </div>
              {codeHovered&&phase==="waiting"&&(
                <div style={{position:'absolute',top:'calc(100% + 10px)',right:0,width:'min(320px,60vw)',padding:'10px 12px',borderRadius:12,background:'rgba(9,10,24,0.92)',border:'1px solid rgba(168,85,247,0.22)',boxShadow:'0 14px 30px rgba(4,6,20,0.35)',color:'rgba(255,255,255,0.72)',fontSize:11,lineHeight:1.55,textAlign:'left',backdropFilter:'blur(10px)',pointerEvents:'none'}}>
                  {footerHint}
                </div>
              )}
            </div>
          ):(
            <div className="room-lobby-auto-label" style={{color:'rgba(255,255,255,0.24)',fontSize:10,fontFamily:'monospace',letterSpacing:'0.24em',textTransform:'uppercase'}}>{t("roomLobby.autoMatched")}</div>
          )}
          {(showRoomCountdown||showPaymentCountdown||showExpiredRoomCountdown)&&(
            <div className="room-lobby-countdown-wrap" style={{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'flex-end',gap:10}}>
              {(showRoomCountdown||showExpiredRoomCountdown)&&(
                <div className="room-lobby-top-pill room-lobby-timer-pill" style={{...topPillBaseStyle,gap:8,border:showExpiredRoomCountdown?'1px solid rgba(244,63,94,0.42)':'1px solid rgba(244,114,182,0.34)',background:showExpiredRoomCountdown?'rgba(72,18,24,0.52)':'rgba(52,18,34,0.44)'}}>
                  <Clock3 style={{...topPillIconStyle,color:showExpiredRoomCountdown||roomCountdown<=30?'#fca5a5':'rgba(255,245,249,0.95)'}} strokeWidth={2.1}/>
                  {showExpiredRoomCountdown?(
                    <span style={{fontSize:13,fontFamily:'monospace',fontWeight:700,color:'#fca5a5',letterSpacing:'0.08em',textTransform:'uppercase'}}>
                      {t("roomLobby.roomExpired")}
                    </span>
                  ):(
                    <>
                      <span style={{fontSize:13,fontFamily:'monospace',fontWeight:700,color:roomCountdown<=30?'#fca5a5':'rgba(255,255,255,0.92)'}}>
                        {fmtCountdown(roomCountdown)}
                      </span>
                      <span style={{fontSize:9,color:'rgba(255,255,255,0.82)',letterSpacing:'0.18em',textTransform:'uppercase'}}>
                        {t("roomLobby.roomExpires")}
                      </span>
                    </>
                  )}
                </div>
              )}
              {showPaymentCountdown&&(
                <div className="room-lobby-top-pill room-lobby-timer-pill" style={{...topPillBaseStyle,gap:8}}>
                  <Clock3 style={{...topPillIconStyle,color:paymentCountdown<=10?'#fca5a5':'rgba(255,245,249,0.95)'}} strokeWidth={2.1}/>
                  <span style={{fontSize:13,fontFamily:'monospace',fontWeight:700,color:paymentCountdown<=10?'#fca5a5':'rgba(255,255,255,0.92)'}}>{paymentCountdown}s</span>
                  <span style={{fontSize:9,color:'rgba(255,255,255,0.82)',letterSpacing:'0.18em',textTransform:'uppercase'}}>{t("create.payment.countdown")}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {(err||hint)&&(
        <div className="room-lobby-notices" style={{position:'relative',zIndex:10,padding:'12px 28px 0',display:'flex',flexDirection:'column',gap:8}}>
          {err&&<div style={{border:'1px solid rgba(244,63,94,0.25)',background:'rgba(244,63,94,0.07)',padding:'10px 16px',borderRadius:10,color:'rgba(252,165,165,0.9)',fontSize:11}}>{err}</div>}
          {hint&&<div style={{border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)',padding:'10px 16px',borderRadius:10,color:'rgba(255,255,255,0.4)',fontSize:11}}>{hint}</div>}
        </div>
      )}

      <main className="room-lobby-content" style={{position:'relative',zIndex:10,flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',padding:isEmbeddedGame?'18px 28px 24px':'28px 28px 24px'}}>
        {isEmbeddedGame?(
          <div style={{width:'min(1380px,100%)',display:'flex',justifyContent:'center'}}>
            <GamePlay embedded layout="room" centerContent={lobbyCenterContent}/>
          </div>
        ):(
          <>
            {lobbyCenterContent}
          </>
        )}
      </main>

      {!isEmbeddedGame&&(
        <footer style={{position:'relative',zIndex:10,padding:'0 28px 28px'}}>
          <div style={{maxWidth:620,margin:'0 auto',textAlign:'center'}}>
            {!(phase==="waiting"&&!fromQuickMatch)&&<p style={{margin:'0 0 16px',fontSize:12,lineHeight:1.7,color:'rgba(255,255,255,0.42)'}}>{footerHint}</p>}
          </div>
        </footer>
      )}

      <PaymentModal
        visible={fromQuickMatch&&phase==="preparing"}
        onConfirm={()=>{}}
        loading={false}
        mode="preparing"
        variant="quickPreparing"
        amount={null}
        hint={null}
      />
      <PaymentModal
        visible={phase==="payment"||phase==="paid_waiting"||!!paymentTimeoutError}
        onConfirm={paymentTimeoutError?confirmPaymentTimeoutError:payRoom}
        onCancel={paymentTimeoutError?undefined:(fromQuickMatch?()=>nav("/"):isOwner?dissolve:leaveLobby)}
        loading={paymentTimeoutError?false:loading}
        mode={phase==="paid_waiting"?"waiting":"confirm"}
        variant="lobby"
        eyebrow={paymentTimeoutError?t("roomLobby.payment.lobbyUpdate"):t("roomLobby.payment.eyebrow")}
        title={paymentTimeoutError?t("create.payment.timeout.title"):t("create.payment.full.title")}
        actionLabel={paymentTimeoutError?t("create.payment.timeout.action"):t("create.payment.action")}
        subtitle={paymentTimeoutError?t("create.payment.timeout.subtitle"):t("create.payment.full.subtitle").replace("{n}",String(paymentProgress.total))}
        error={paymentTimeoutError||((phase==="payment"||phase==="paid_waiting")?err:null)}
        hint={paymentTimeoutError?null:(phase==="paid_waiting"?t("roomLobby.payment.hint.waiting"):shouldUseMockPayment?t("roomLobby.payment.hint.mock"):t("roomLobby.payment.hint.confirm"))}
        countdown={paymentTimeoutError?null:paymentCountdown}
        countdownLabel={paymentTimeoutError?null:t("roomLobby.payment.timeLeft")}
        paidCount={paymentProgress.paidCount}
        totalCount={paymentProgress.total||teamSize}
        amountCaption={t("roomLobby.payment.amountCaption")}
        cancelLabel={fromQuickMatch?t("roomLobby.action.leaveLobby"):isOwner?t("roomLobby.action.cancelRoom"):t("roomLobby.action.leaveRoom")}
        singleAction={!!paymentTimeoutError}
      />
      <PaymentModal
        visible={!!roomExitDialog}
        onConfirm={confirmLobbyExit}
        loading={false}
        mode="confirm"
        variant="lobby"
        eyebrow={t("roomLobby.payment.lobbyUpdate")}
        title={roomExitDialog?.title||t("roomLobby.exit.closedTitle")}
        actionLabel={t("roomLobby.exit.confirm")}
        subtitle={roomExitDialog?.subtitle||t("roomLobby.exit.closedSubtitle")}
        amount={null}
        hint={null}
        singleAction
      />
    </div>
  );
}
