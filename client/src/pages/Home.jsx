import{useState,useEffect,useCallback,useRef}from"react";
import{createPortal}from"react-dom";
import{useNavigate}from"react-router-dom";
import{useWallet}from"../context/WalletContext";
import{useSocket}from"../hooks/useSocket";
import{SERVER_URL}from"../config/constants";
import{useGame}from"../context/GameContext";
import{useContract}from"../hooks/useContract";
import{useBtcPrice}from"../hooks/useBtcPrice";
import{BtcTicker,TeamSlots,MatchAnimation,PaymentModal}from"../components";
import{ENTRY_FEE,TEAM_SIZES,PAYMENT_TIMEOUT}from"../config/constants";
import{useT}from"../context/LangContext";

function formatPaymentUiError(message){
  const text=(message||"").toLowerCase();
  if(!text)return null;
  if(text.includes("request timeout")||text.includes("confirmation timed out")||text.includes("econnreset")){
    return "Base Sepolia RPC timed out while waiting for confirmation. Please retry in a few seconds.";
  }
  if(text.includes("on-chain payment not confirmed")){
    return "Payment was sent, but server confirmation is still catching up. Please wait a few seconds.";
  }
  if(text.includes("could not decode result data")||text.includes("bad data")){
    return "Payment configuration is out of date. Refresh the page and try again.";
  }
  if(text.includes("allowance")){
    return "Token approval finished, but the payment transaction is not ready yet. Please wait a moment and try again.";
  }
  if(text.includes("room payment is still syncing on-chain")||text.includes("on-chain room payment is still syncing")){
    return "Room payment is still syncing on-chain. Please retry in a moment.";
  }
  return message;
}

function enrichHistoryGame(game,status){
  if(!status)return game;
  if(status.action==="refund"||(status.claimed&&status.state===5)){
    return{
      ...game,
      claimAction:"refund",
      claimLabel:"Claim Refund",
      claimedLabel:"Refunded",
      claimable:!status.claimed,
      claimed:status.claimed,
      reward:status.entryFee,
      uiState:status.claimed?"Refunded":"Refund Ready",
    };
  }
  if(status.state===3){
    return{
      ...game,
      claimAction:(status.canClaimReward||status.claimed)?"reward":game.claimAction,
      claimLabel:"Claim Reward",
      claimedLabel:"Claimed",
      claimable:status.canClaimReward,
      claimed:status.claimed,
      reward:status.reward,
      uiState:game.state==="settled"?(game.uiState||"Settled"):"Settled",
    };
  }
  return game;
}

function getHistoryResult(game){
  if(game.uiState)return game.uiState;
  if(game.state!=="settled"){
    if(game.state==="expired")return"Expired";
    if(game.state==="failed")return"Failed";
    if(game.state==="cancelled")return"Cancelled";
    if(game.state==="waiting")return"Waiting";
    if(game.state==="active")return"Playing";
    return game.state;
  }
  return game.is_correct===null||game.is_correct===undefined?"—":game.is_correct?"Win":"Lose";
}

function getHistoryResultClass(result){
  if(result==="Win")return"text-emerald-400";
  if(result==="Lose")return"text-rose-400";
  if(result==="Failed")return"text-violet-300";
  if(result==="Expired")return"text-violet-300";
  if(result==="Cancelled")return"text-white/30";
  if(result==="Waiting")return"text-violet-300";
  if(result==="Playing")return"text-sky-300";
  if(result==="Refund Ready"||result==="Refunded")return"text-violet-300";
  if(result==="Settled")return"text-emerald-300";
  return"text-white/35";
}

// Payout formula popover used next to Team Size selectors.
// Lives at module scope so open-state is preserved across parent re-renders.
function PayoutInfo(){
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const updatePos = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 288; // w-72
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ left, top: r.bottom + 8 });
  };

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onDown = (e) => {
      const inBtn = btnRef.current && btnRef.current.contains(e.target);
      const inPop = popRef.current && popRef.current.contains(e.target);
      if (!inBtn && !inPop) setOpen(false);
    };
    const onKey  = (e) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => updatePos();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setOpen(true)}
        aria-label={t("home.payout.trigger")}
        className="w-4 h-4 rounded-full border border-white/20 text-white/40 hover:text-white/70 hover:border-white/40 text-[9px] font-black leading-none inline-flex items-center justify-center transition"
      >i</button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          onMouseLeave={() => setOpen(false)}
          className="w-72 p-3 rounded-xl border border-white/10 shadow-2xl"
          style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 100, background: "linear-gradient(180deg,#15172c,#0d0e1c)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-2">{t("home.payout.heading")}</p>
          <div className="font-mono text-[11px] text-white/75 bg-white/[0.04] rounded-lg px-3 py-2 mb-2 leading-relaxed">
            {t("home.payout.formula")}
          </div>
          <p className="text-[10px] text-white/40 leading-relaxed mb-3">{t("home.payout.legend")}</p>
          <div className="pt-2 border-t border-white/[0.06]">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-1.5">{t("home.payout.exampleLabel")}</p>
            <div className="font-mono text-[11px] text-emerald-300 mb-1.5">{t("home.payout.exampleCalc")}</div>
            <p className="text-[10px] text-white/45 leading-relaxed">{t("home.payout.exampleNote")}</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function SizeSelectorBase({selectedSize,onSelect,onAction,actionLabel,disabled,label}){
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-white/30 text-[11px] font-medium">{label}</p>
        <PayoutInfo/>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {TEAM_SIZES.map(s=>(
          <button key={s} onClick={()=>onSelect(s)} disabled={disabled}
            className={`py-3 rounded-xl font-black text-base transition-all
              ${selectedSize===s
                ?"bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-violet-500/25 -translate-y-0.5"
                :"bg-white/[0.03] border border-white/[0.06] text-white/20 hover:bg-white/[0.06] hover:text-white/40"}
              ${disabled?"!opacity-30 cursor-not-allowed":""}`}
          >{s}P</button>
        ))}
      </div>
      <button onClick={onAction} disabled={disabled} className={`btn-primary w-full py-3 font-bold text-sm ${disabled?"!opacity-30 cursor-not-allowed":""}`}>{actionLabel}</button>
    </div>
  );
}

export default function Home(){
  const nav=useNavigate();
  const t=useT();
  const{wallet,provider,signer,connect,mockMode,refund,pendingAction,setPendingAction}=useWallet();
  const{emit,on}=useSocket();
  const{updateGame}=useGame();
  const{payForGame,payForRoomEntry,claimGameFunds,getGameClaimStatus,loading,claiming,mockPay,shouldUseMockPayment}=useContract();
  const price=useBtcPrice();

  // i18n helpers for things computed outside the component
  const translateHistoryResult=(g)=>{
    const r=getHistoryResult(g);
    const map={
      "Win":"home.history.win",
      "Lose":"home.history.lose",
      "Failed":"home.history.failed",
      "Expired":"home.history.expired",
      "Cancelled":"home.history.cancelled",
      "Waiting":"home.history.waitingState",
      "Playing":"home.history.playingState",
      "Refund Ready":"home.history.refundReady",
      "Refunded":"home.history.refunded",
      "Settled":"home.history.settled",
    };
    return map[r]?t(map[r]):r;
  };
  const translateHistoryLabel=(label,fallback)=>{
    const map={
      "Claim":"home.history.claim",
      "Claimed":"home.history.claimed",
      "Claim Reward":"home.history.claimReward",
      "Claim Refund":"home.history.claimRefund",
      "Refunded":"home.history.refunded",
    };
    return map[label]?t(map[label]):(label||fallback);
  };
  const translateUiError=(msg)=>{
    const text=(msg||"").toLowerCase();
    if(!text)return msg;
    if(text.includes("request timeout")||text.includes("confirmation timed out")||text.includes("econnreset"))return t("home.err.rpcTimeout");
    if(text.includes("on-chain payment not confirmed"))return t("home.err.paymentNotConfirmed");
    if(text.includes("could not decode result data")||text.includes("bad data"))return t("home.err.configStale");
    if(text.includes("allowance"))return t("home.err.allowancePending");
    if(text.includes("room payment is still syncing on-chain")||text.includes("on-chain room payment is still syncing"))return t("home.err.roomSyncing");
    return msg;
  };

  const[history,setHistory]=useState([]);
  const[historyFilter,setHistoryFilter]=useState("all");
  const[payoutRulesOpen,setPayoutRulesOpen]=useState(false);
  const[historyPage,setHistoryPage]=useState(1);
  const[stats,setStats]=useState(null);
  const[claimingHistoryId,setClaimingHistoryId]=useState(null);

  const[mode,setMode]=useState("create");
  const[createTeamSize,setCreateTeamSize]=useState(2);
  const[matchTeamSize,setMatchTeamSize]=useState(2);

  // Per-card independent state
  const[createPhase,setCreatePhase]=useState("select");
  const createTimeoutRef=useRef(null);
  const joinTimeoutRef=useRef(null);
  const[createErr,setCreateErr]=useState(null);
  const[createHint,setCreateHint]=useState(null);
  const[createPaid,setCreatePaid]=useState(false);
  const[roomFullInfo,setRoomFullInfo]=useState(null);
  const[paymentProgress,setPaymentProgress]=useState({paidCount:0,total:0});
  const[paymentErr,setPaymentErr]=useState(null);
  const[paymentNotice,setPaymentNotice]=useState(null);
  const[paymentFailureDialog,setPaymentFailureDialog]=useState(null);
  const[roomCode,setRoomCode]=useState("");
  const[openRoom,setOpenRoom]=useState(null);
  const[room,setRoom]=useState({current:0,total:0,players:[]});
  const[copied,setCopied]=useState(false);

  // Room expiry countdown
  const[roomExpiresAt,setRoomExpiresAt]=useState(null);
  const[roomCountdown,setRoomCountdown]=useState(null);

  // Payment countdown (60s after room full)
  const[paymentStartedAt,setPaymentStartedAt]=useState(null);
  const[paymentCountdown,setPaymentCountdown]=useState(null);

  // Join room expiry countdown
  const[joinExpiresAt,setJoinExpiresAt]=useState(null);
  const[joinCountdown,setJoinCountdown]=useState(null);

  const[joinPhase,setJoinPhase]=useState("select");
  const[joinErr,setJoinErr]=useState(null);
  const[joinPaid,setJoinPaid]=useState(false);
  const[joinCode,setJoinCode]=useState("");
  const[joinRoom,setJoinRoom]=useState({current:0,total:0,players:[]});
  const[joinValidInfo,setJoinValidInfo]=useState(null);

  const[matchPhase,setMatchPhase]=useState("select");
  const[matchErr,setMatchErr]=useState(null);
  const[matchInfo,setMatchInfo]=useState({current:0});
  const[cd,setCd]=useState(15);
  const[pending,setPending]=useState(null);

  // Refs to track latest state values inside socket handlers (avoids stale closures & dep churn)
  const createPhaseRef=useRef(createPhase); createPhaseRef.current=createPhase;
  const joinPhaseRef=useRef(joinPhase); joinPhaseRef.current=joinPhase;
  const matchPhaseRef=useRef(matchPhase); matchPhaseRef.current=matchPhase;
  const createPaidRef=useRef(createPaid); createPaidRef.current=createPaid;
  const joinPaidRef=useRef(joinPaid); joinPaidRef.current=joinPaid;
  const joinCodeRef=useRef(joinCode); joinCodeRef.current=joinCode;
  const walletRef=useRef(wallet); walletRef.current=wallet;
  const roomRef=useRef(room); roomRef.current=room;
  const joinRoomRef=useRef(joinRoom); joinRoomRef.current=joinRoom;
  const createTeamSizeRef=useRef(createTeamSize); createTeamSizeRef.current=createTeamSize;
  const matchTeamSizeRef=useRef(matchTeamSize); matchTeamSizeRef.current=matchTeamSize;
  const roomCodeRef=useRef(roomCode); roomCodeRef.current=roomCode;
  const createCancelPendingRef=useRef(false);
  const createPhaseBeforeCancelRef=useRef("select");
  const paymentResumeRequestAtRef=useRef(0);
  const paymentStartedAtRef=useRef(null);
  const paymentFailureDialogRef=useRef(null);

  const resetMatchState=useCallback((message=null,{cancelQueue=false}={})=>{
    if(cancelQueue)emit("match:cancel");
    setPending(null);
    setMatchInfo({current:0});
    setPaymentStartedAt(null);
    setMatchPhase("select");
    setMatchErr(message);
  },[emit]);

  const enterRoomPayment=useCallback((d={})=>{
    const total=Number(d?.total||d?.players?.length||0);
    const players=Array.isArray(d?.players)?d.players:[];
    if(!total)return;
    const ownerWallet=d?.owner?.toLowerCase?.()||null;
    setRoomFullInfo(prev=>({
      gameId:d?.gameId||prev?.gameId||null,
      chainGameId:d?.chainGameId||prev?.chainGameId||null,
      inviteCode:d?.inviteCode||prev?.inviteCode||roomCodeRef.current||joinCodeRef.current||"",
      maxPlayers:d?.total||prev?.maxPlayers||total,
      owner:ownerWallet||prev?.owner||null,
      auth:d?.auth||prev?.auth||null,
      players:players.length?players:(prev?.players||[]),
      paymentTimeout:d?.paymentTimeout||prev?.paymentTimeout||PAYMENT_TIMEOUT*1000,
    }));
    setPaymentProgress(prev=>({paidCount:prev?.paidCount||0,total}));
    setPaymentErr(null);
    setPaymentNotice(null);
    setPaymentStartedAt(prev=>prev||Date.now());
    setRoomExpiresAt(null);setRoomCountdown(null);
    setJoinExpiresAt(null);setJoinCountdown(null);
    if(players.length){
      if(createPhaseRef.current==="waiting"||createPhaseRef.current==="creating"||createPhaseRef.current==="preparing")setRoom({current:total,total:d?.total||total,players});
      if(joinPhaseRef.current==="waiting"||joinPhaseRef.current==="joining"||joinPhaseRef.current==="preparing")setJoinRoom({current:total,total:d?.total||total,players});
    }
    if(createPhaseRef.current==="waiting"||createPhaseRef.current==="creating"||createPhaseRef.current==="preparing"){
      setCreatePhase(createPaidRef.current?"paid_waiting":"payment");
    }
    if(joinPhaseRef.current==="waiting"||joinPhaseRef.current==="joining"||joinPhaseRef.current==="preparing"){
      setJoinPhase(joinPaidRef.current?"paid_waiting":"payment");
    }
  },[]);

  const reloadHistory=useCallback(async(targetWallet=walletRef.current)=>{
    if(!targetWallet)return;
    try{
      const response=await fetch(`${SERVER_URL}/api/users/${targetWallet}/games?limit=20`);
      const data=await response.json();
      const rows=Array.isArray(data.games)?data.games:[];
      const enriched=await Promise.all(rows.map(async(game)=>{
        if(!game?.chain_game_id||!["active","failed"].includes(game.state))return game;
        const status=await getGameClaimStatus(game.chain_game_id,targetWallet);
        return enrichHistoryGame(game,status);
      }));
      setHistory(enriched);
      setHistoryPage(1);
    }catch{}
  },[getGameClaimStatus]);

  const handleRoomPaymentFailure=useCallback((reason)=>{
    reason = reason || t("home.err.timeoutTeam");
    const wasCreateFlow =
      createPhaseRef.current==="payment"||
      createPhaseRef.current==="paid_waiting"||
      createPhaseRef.current==="waiting"||
      !!roomCodeRef.current;
    const wasJoinFlow =
      joinPhaseRef.current==="payment"||
      joinPhaseRef.current==="paid_waiting"||
      joinPhaseRef.current==="waiting"||
      !!joinCodeRef.current;
    if(createPaidRef.current){refund(ENTRY_FEE);setCreatePaid(false);}
    if(joinPaidRef.current){refund(ENTRY_FEE);setJoinPaid(false);}
    setPaymentStartedAt(null);
    setPaymentCountdown(null);
    setRoomFullInfo(null);
    setPaymentNotice(null);
    setPaymentErr(null);
    setPaymentFailureDialog(reason);
    paymentFailureDialogRef.current=reason;
    setCreateHint(null);
    setCreatePhase("select");
    setJoinPhase("select");
    if(matchPhaseRef.current==="payment"||matchPhaseRef.current==="paid_waiting"){
      setMatchPhase("select");
      setPending(null);
    }
    setRoomCode("");
    setRoom({current:0,total:0,players:[]});
    setOpenRoom(null);
    setCreateErr(wasCreateFlow?reason:null);
    setJoinErr(wasJoinFlow?reason:null);
    reloadHistory(walletRef.current);
  },[refund,reloadHistory]);

  // Carousel state
  const scrollRef=useRef(null);
  const[activeCard,setActiveCard]=useState(0);
  const CARDS=["create","join","match"];

  const scrollToCard=(idx)=>{
    const el=scrollRef.current;
    if(!el||!el.children[0])return;
    const cardWidth=el.children[0].offsetWidth;
    const gap=16;
    el.scrollTo({left:idx*(cardWidth+gap),behavior:"smooth"});
  };

  const scrollPosRef=useRef(0);
  const handleScroll=()=>{
    const el=scrollRef.current;
    if(!el)return;
    const cardWidth=el.children[0]?.offsetWidth||1;
    const gap=16;
    const pos=Math.round(el.scrollLeft/(cardWidth+gap));
    scrollPosRef.current=pos;
  };

  const goCard=(idx)=>{
    setActiveCard(idx);
    setMode(CARDS[idx]);
    if(idx>=2) scrollToCard(1);
    else scrollToCard(0);
  };

  const scrollRight=()=>{scrollToCard(1);};
  const scrollLeft=()=>{scrollToCard(0);};

  // Room expiry countdown timer
  useEffect(()=>{
    if(!roomExpiresAt||createPhase!=="waiting"){setRoomCountdown(null);return;}
    const tick=()=>{
      const rem=Math.max(0,Math.ceil((roomExpiresAt-Date.now())/1000));
      setRoomCountdown(rem);
      if(rem<=0)clearInterval(iv);
    };
    tick();
    const iv=setInterval(tick,1000);
    return()=>clearInterval(iv);
  },[roomExpiresAt,createPhase]);

  // Join room expiry countdown timer
  useEffect(()=>{
    if(!joinExpiresAt||joinPhase!=="waiting"){setJoinCountdown(null);return;}
    const tick=()=>{
      const rem=Math.max(0,Math.ceil((joinExpiresAt-Date.now())/1000));
      setJoinCountdown(rem);
      if(rem<=0)clearInterval(iv);
    };
    tick();
    const iv=setInterval(tick,1000);
    return()=>clearInterval(iv);
  },[joinExpiresAt,joinPhase]);

  // Payment countdown timer (60s after room full)
  useEffect(()=>{
    paymentStartedAtRef.current=paymentStartedAt;
    if(!paymentStartedAt){setPaymentCountdown(null);return;}
    const tick=()=>{
      const rem=Math.max(0,Math.ceil((paymentStartedAt+PAYMENT_TIMEOUT*1000-Date.now())/1000));
      setPaymentCountdown(rem);
      if(rem<=0)clearInterval(iv);
    };
    tick();
    const iv=setInterval(tick,1000);
    return()=>clearInterval(iv);
  },[paymentStartedAt]);

  useEffect(()=>{
    // Reset ALL state on wallet disconnect or switch
    setHistory([]);setStats(null);
    setCreatePhase("select");setCreateErr(null);setCreatePaid(false);setRoomCode("");setRoom({current:0,total:0,players:[]});setOpenRoom(null);setRoomExpiresAt(null);setRoomCountdown(null);
    setJoinPhase("select");setJoinErr(null);setJoinPaid(false);setJoinCode("");setJoinRoom({current:0,total:0,players:[]});setJoinExpiresAt(null);setJoinCountdown(null);setJoinValidInfo(null);
    setMatchPhase("select");setMatchErr(null);setMatchInfo({current:0});setPending(null);
    setPaymentStartedAt(null);setPaymentCountdown(null);setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});setPaymentErr(null);
    if(!wallet) return;
    reloadHistory(wallet);
    fetch(`${SERVER_URL}/api/users/${wallet}`).then(r=>r.json()).then(setStats).catch(()=>{});
    fetch(`${SERVER_URL}/api/users/${wallet}/open-room`).then(r=>r.json()).then(d=>{
      setOpenRoom(d.room||null);
      if(d.room?.invite_code){
        const code=d.room.invite_code;
        const players=d.room.players?.length?d.room.players:Array.from({length:d.room.current_players||1},(_,i)=> i===0 ? wallet : `player-${i}`);
        const total=d.room.max_players;
        const current=d.room.current_players||players.length||1;
        const expiresAt=(d.room.expires_at?new Date(d.room.expires_at).getTime():new Date(d.room.created_at).getTime()+300000);
        const isExpired=expiresAt<=Date.now();
        const isPaymentPhase=d.room.phase==="payment"||d.room.phase==="paid_waiting";
        const paymentStartedAt=d.room.payment_started_at?new Date(d.room.payment_started_at).getTime():null;
        if(isPaymentPhase){
          setRoomFullInfo({gameId:d.room.game_id||d.room.id,chainGameId:d.room.chain_game_id||null,inviteCode:code,maxPlayers:total,owner:d.room.owner||null,auth:d.room.auth||null,players,paymentTimeout:d.room.payment_timeout_ms});
          setPaymentProgress({paidCount:d.room.paid_count||0,total:d.room.total_players||total});
          setPaymentStartedAt(paymentStartedAt);
        }
        if(d.room.is_owner){
          setCreateTeamSize(total);
          setRoomCode(code);
          setRoom({current,total,players});
          if(isPaymentPhase){
            setCreatePaid(d.room.phase==="paid_waiting");
            setCreatePhase(d.room.phase);
            setRoomExpiresAt(null);
          } else if(isExpired){
            setCreatePhase("expired");
          } else {
            setRoomExpiresAt(expiresAt);
            setCreatePhase("waiting");
          }
        } else {
          setJoinCode(code);
          setJoinRoom({current,total,players});
          if(isPaymentPhase){
            setJoinPaid(d.room.phase==="paid_waiting");
            setJoinPhase(d.room.phase);
            setJoinExpiresAt(null);
          } else if(isExpired){
            setJoinErr(t("home.expiredMsg"));
            setJoinPhase("select");
          } else {
            setJoinExpiresAt(expiresAt);
            setJoinPhase("waiting");
          }
          setTimeout(()=>{setActiveCard(1);setMode("join");scrollToCard(0);},100);
        }
      }
    }).catch(()=>{});
  },[wallet]);

  // ===== SOCKET EVENT LISTENERS =====
  // Uses refs to read latest state — deps are only stable references, so listeners are never torn down mid-flight
  useEffect(()=>{
    const refreshHistory=()=>reloadHistory(walletRef.current);
    const u=[
      on("room:created",d=>{
        if(createTimeoutRef.current){clearTimeout(createTimeoutRef.current);createTimeoutRef.current=null;}
        createCancelPendingRef.current=false;
        createPhaseBeforeCancelRef.current="select";
        setCreateErr(null);
        setCreateHint(null);
        setRoomCode(d.inviteCode);
        setRoom({current:1,total:createTeamSizeRef.current,players:[walletRef.current]});
        setRoomExpiresAt(d.expiresAt);
        setCreatePhase("waiting");
      }),
      on("room:update",d=>{
        if(createPhaseRef.current==="waiting"||createPhaseRef.current==="paid_waiting"||createPhaseRef.current==="preparing"){
          const total=d.total||roomRef.current.total||createTeamSizeRef.current||d.players?.length||0;
          setCreateTeamSize(total||createTeamSizeRef.current);
          setRoom({current:d.current,total,players:d.players});
          if(d.expiresAt)setRoomExpiresAt(d.expiresAt);
        }
        if(joinPhaseRef.current==="waiting"||joinPhaseRef.current==="paid_waiting"||joinPhaseRef.current==="preparing"){
          const total=d.total||joinRoomRef.current.total||d.players?.length||0;
          setJoinRoom({current:d.current,total,players:d.players});
          if(d.expiresAt)setJoinExpiresAt(d.expiresAt);
        }
        if(d.status==="full"||(d.total&&d.current>=d.total))enterRoomPayment(d);
      }),
      on("room:preparing",d=>{
        const total=d.total||d.players?.length||0;
        setPaymentErr(null);
        setPaymentNotice(null);
        setPaymentProgress({paidCount:0,total});
        setRoomFullInfo(prev=>({
          gameId:d.gameId||prev?.gameId||null,
          chainGameId:d.chainGameId||prev?.chainGameId||null,
          inviteCode:d.inviteCode||prev?.inviteCode||roomCodeRef.current||joinCodeRef.current||"",
          players:Array.isArray(d.players)?d.players:(prev?.players||[]),
          paymentTimeout:d.timeoutMs||prev?.paymentTimeout||PAYMENT_TIMEOUT*1000,
        }));
        setRoomExpiresAt(null);
        setJoinExpiresAt(null);
        if(createPhaseRef.current==="waiting"||createPhaseRef.current==="creating")setCreatePhase("preparing");
        if(joinPhaseRef.current==="waiting"||joinPhaseRef.current==="joining")setJoinPhase("preparing");
      }),
      on("room:full",d=>{
        enterRoomPayment(d);
      }),
      on("room:payment:opened",d=>{
        setRoomFullInfo(prev=>prev?{...prev,chainGameId:d.chainGameId||prev.chainGameId}:prev);
      }),
      on("room:error",d=>{
        if(createTimeoutRef.current){clearTimeout(createTimeoutRef.current);createTimeoutRef.current=null;}
        const uiMsg=formatPaymentUiError(d.message);
        if(createPhaseRef.current==="dissolving"){
          createCancelPendingRef.current=false;
          setCreatePhase(createPhaseBeforeCancelRef.current==="paid_waiting"?"paid_waiting":"waiting");
        }
        setCreateHint(null);
        const tUiMsg=translateUiError(uiMsg);
        if(createPhaseRef.current==="creating"||createPhaseRef.current==="waiting"||createPhaseRef.current==="preparing"||createPhaseRef.current==="payment"||createPhaseRef.current==="paid_waiting") {setCreateErr(tUiMsg);setPaymentErr(tUiMsg);}
        if(createPhaseRef.current==="dissolving") {setCreateErr(tUiMsg);}
        if(joinPhaseRef.current==="select"||joinPhaseRef.current==="waiting"||joinPhaseRef.current==="joining"||joinPhaseRef.current==="preparing"||joinPhaseRef.current==="payment"||joinPhaseRef.current==="paid_waiting") {setJoinErr(tUiMsg);setPaymentErr(tUiMsg);if(joinPhaseRef.current!=="payment"&&joinPhaseRef.current!=="paid_waiting")setJoinPhase("select");}
        setCreatePhase(prev=>(prev==="creating"||prev==="preparing")?"select":prev);
      }),
      on("room:dissolved",d=>{
        const wasCreateFlow = createPhaseRef.current!=="select" || !!roomCodeRef.current;
        const wasJoinFlow = joinPhaseRef.current!=="select" || !!joinCodeRef.current;
        const selfCancelledCreate = createCancelPendingRef.current;
        createCancelPendingRef.current=false;
        createPhaseBeforeCancelRef.current="select";
        if(createTimeoutRef.current){clearTimeout(createTimeoutRef.current);createTimeoutRef.current=null;}
        if(createPaidRef.current){refund(ENTRY_FEE);setCreatePaid(false);}
        if(joinPaidRef.current){refund(ENTRY_FEE);setJoinPaid(false);}
        setOpenRoom(null);setRoomCode("");setRoom({current:0,total:0,players:[]});
        setRoomExpiresAt(null);setRoomCountdown(null);
        setJoinExpiresAt(null);setJoinCountdown(null);
        setPaymentStartedAt(null);setPaymentCountdown(null);
        setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});setPaymentErr(null);setPaymentNotice(null);
        setCreatePhase("select");setJoinPhase("select");
        setCreateHint(null);
        if(wasCreateFlow && d&&d.reason && !selfCancelledCreate)setCreateErr(d.reason);
        if(selfCancelledCreate)setCreateErr(null);
        if(wasJoinFlow && d&&d.reason)setJoinErr(d.reason);
        refreshHistory();
      }),
      on("room:expired",d=>{
        if(createTimeoutRef.current){clearTimeout(createTimeoutRef.current);createTimeoutRef.current=null;}
        createCancelPendingRef.current=false;
        createPhaseBeforeCancelRef.current="select";
        setRoomExpiresAt(null);setRoomCountdown(null);
        setJoinExpiresAt(null);setJoinCountdown(null);
        setPaymentStartedAt(null);
        if(createPhaseRef.current==="waiting"||createPhaseRef.current==="creating"){
          setCreatePhase("expired");
          setCreateErr(null);
        }
        setCreateHint(null);
        if(joinPhaseRef.current==="waiting"){
          setJoinPhase("select");
          setJoinErr(t("home.expiredMsg"));
        }
        refreshHistory();
      }),
      on("room:valid",d=>{
        if(joinTimeoutRef.current){clearTimeout(joinTimeoutRef.current);joinTimeoutRef.current=null;}
        setJoinValidInfo(d);
        setJoinPhase("confirm");
      }),
      on("room:invalid",d=>{
        if(joinTimeoutRef.current){clearTimeout(joinTimeoutRef.current);joinTimeoutRef.current=null;}
        setJoinErr(d?.message||t("home.err.roomNotFound"));setJoinPhase("select");
      }),
      on("room:payment:update",d=>{setPaymentProgress({paidCount:d.paidCount,total:d.total});if(d.chainGameId){setRoomFullInfo(prev=>prev?{...prev,chainGameId:d.chainGameId}:prev);}}),
      on("room:payment:failed",d=>{
        if(createTimeoutRef.current){clearTimeout(createTimeoutRef.current);createTimeoutRef.current=null;}
        createCancelPendingRef.current=false;
        createPhaseBeforeCancelRef.current="select";
        handleRoomPaymentFailure(d?.reason||"Payment timeout — team disbanded");
      }),
      on("room:joined",d=>{
        if(d.error){setJoinErr(d.error);if(joinPaidRef.current){refund(ENTRY_FEE);setJoinPaid(false);}setJoinPhase("select");return;}
        const total=d.total||d.players?.length||0;
        const current=d.current||d.players?.length||0;
        setJoinRoom({current,total,players:d.players});
        if(d.expiresAt)setJoinExpiresAt(d.expiresAt);
        if(d.status==="full"){
          enterRoomPayment(d);
        } else if(joinPhaseRef.current!=="payment"&&joinPhaseRef.current!=="paid_waiting"){
          setJoinPhase("waiting");
        }
      }),
      on("game:start",d=>{
        updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players.length,players:d.players,phase:"predicting",basePrice:d.basePrice,countdown:Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null});
        setPaymentStartedAt(null);
        setTimeout(()=>nav("/game"),500);
      }),
      on("game:resume",d=>{
        updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players?.length||d.totalPlayers||0,players:d.players||[],phase:d.phase==="settling"?"settling":"predicting",basePrice:d.basePrice,countdown:d.remaining||Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null,currentPrice:d.currentPrice||d.basePrice});
        setPaymentStartedAt(null);
        setTimeout(()=>nav("/game"),300);
      }),
    ];
    return()=>u.forEach(f=>f());
  },[on,updateGame,nav,handleRoomPaymentFailure]);

  // Check if any mode is currently active (not in idle "select" state)
  const isCreateBusy=createPhase!=="select";
  const isJoinBusy=joinPhase!=="select";
  const isMatchBusy=matchPhase!=="select";
  const anyBusy=isCreateBusy||isJoinBusy||isMatchBusy;
  const joinEntryDisabled=isCreateBusy||isMatchBusy;
  const joinBlockedMsg=isCreateBusy
    ?t("home.err.joinBlocked.create")
    :isMatchBusy
      ?t("home.err.joinBlocked.match")
      :null;

  const createRoom=()=>{if(isJoinBusy||isMatchBusy){setCreateErr(t("home.err.finishFirst"));return;}if(isCreateBusy){setCreateErr(t("home.err.alreadyCreating"));return;}if(!mockMode && (!wallet || !provider || !signer)){connect({type:"create-room"});return;}createCancelPendingRef.current=false;createPhaseBeforeCancelRef.current="select";setCreateErr(null);setCreateHint(null);setCreatePhase("creating");if(createTimeoutRef.current)clearTimeout(createTimeoutRef.current);createTimeoutRef.current=setTimeout(()=>{createTimeoutRef.current=null;if(createPhaseRef.current==="creating")setCreateHint(t("home.err.baseSlow"));},12000);emit("room:create",{teamSize:createTeamSize});};
  const payCreate=useCallback(async()=>{try{setPaymentErr(null);setPaymentNotice(null);if(!roomFullInfo?.gameId||!wallet)throw new Error("Missing game id");const startedAt=paymentStartedAtRef.current;const deadline=startedAt?startedAt+PAYMENT_TIMEOUT*1000:null;if((deadline&&Date.now()>=deadline)||paymentFailureDialogRef.current){handleRoomPaymentFailure(t("home.err.windowClosed"));return;}const paymentResult=await payForRoomEntry({inviteCode:roomCode,maxPlayers:roomFullInfo?.maxPlayers||createTeamSizeRef.current,isOwner:true,auth:roomFullInfo?.auth});const nowDeadline=paymentStartedAtRef.current?paymentStartedAtRef.current+PAYMENT_TIMEOUT*1000:deadline;if((nowDeadline&&Date.now()>=nowDeadline)||paymentFailureDialogRef.current){if(paymentResult?.paid)refund(ENTRY_FEE);handleRoomPaymentFailure(t("home.err.windowClosed"));return;}if(paymentResult?.chainGameId){setRoomFullInfo(prev=>prev?{...prev,chainGameId:paymentResult.chainGameId}:prev);}setCreatePaid(true);setCreateErr(null);emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:paymentResult?.chainGameId||roomFullInfo?.chainGameId||null,inviteCode:roomCode,wallet});setCreatePhase("paid_waiting");}catch(e){const startedAtCatch=paymentStartedAtRef.current;const deadlineCatch=startedAtCatch?startedAtCatch+PAYMENT_TIMEOUT*1000:null;const timedOut=(deadlineCatch&&Date.now()>=deadlineCatch)||!!paymentFailureDialogRef.current;if(timedOut)return;const msg=formatPaymentUiError(e?.message||"Payment failed");setCreateErr(msg);setPaymentErr(msg);}},[payForRoomEntry,roomFullInfo,roomCode,emit,wallet,refund,handleRoomPaymentFailure]);
  const beginCreateRoomCancel=()=>{createCancelPendingRef.current=true;createPhaseBeforeCancelRef.current=createPhaseRef.current;setCreateErr(null);setCreateHint(t("home.cancelling"));setRoomCountdown(null);setCreatePhase("dissolving");emit("room:dissolve",{inviteCode:roomCodeRef.current||roomCode});};
  const cancelCreate=()=>{beginCreateRoomCancel();};
  const dissolveRoom=()=>{beginCreateRoomCancel();};
  const clearExpired=()=>{setCreatePhase("select");setRoomCode("");setRoom({current:0,total:0,players:[]});setOpenRoom(null);setCreateErr(null);reloadHistory(wallet);};
  const copyCode=()=>{navigator.clipboard.writeText(roomCode);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const shareTwitter=()=>{const url=typeof window!=="undefined"?window.location.origin:"";const text=t("home.share.text",{code:roomCode,url});const intent=`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;if(typeof window!=="undefined")window.open(intent,"_blank","noopener,noreferrer");};

  // Join flow: confirm dialog (no payment), then join directly
  const submitJoin=()=>{if(isCreateBusy||isMatchBusy){setJoinErr(t("home.err.finishFirst"));return;}if(isJoinBusy){setJoinErr(t("home.err.alreadyJoin"));return;}if(!mockMode && (!wallet || !provider || !signer)){connect({type:"join-room",code:joinCode});return;}if(joinCode.length<6)return setJoinErr(t("home.err.incompleteCode"));setJoinErr(null);setJoinPhase("validating");if(joinTimeoutRef.current)clearTimeout(joinTimeoutRef.current);joinTimeoutRef.current=setTimeout(()=>{setJoinErr(t("home.err.invalidCode"));setJoinPhase("select");},4000);emit("room:validate",{inviteCode:joinCode.toUpperCase()});};
  const confirmJoin=()=>{emit("room:join",{inviteCode:joinCode.toUpperCase()});setJoinPhase("joining");};
  const payJoin=useCallback(async()=>{try{setPaymentErr(null);setPaymentNotice(null);if(!roomFullInfo?.gameId||!wallet)throw new Error("Missing game id");const startedAt=paymentStartedAtRef.current;const deadline=startedAt?startedAt+PAYMENT_TIMEOUT*1000:null;if((deadline&&Date.now()>=deadline)||paymentFailureDialogRef.current){handleRoomPaymentFailure(t("home.err.windowClosed"));return;}const paymentResult=await payForRoomEntry({inviteCode:roomFullInfo.inviteCode||joinCode,isOwner:false,auth:roomFullInfo?.auth});const nowDeadline=paymentStartedAtRef.current?paymentStartedAtRef.current+PAYMENT_TIMEOUT*1000:deadline;if((nowDeadline&&Date.now()>=nowDeadline)||paymentFailureDialogRef.current){if(paymentResult?.paid)refund(ENTRY_FEE);handleRoomPaymentFailure(t("home.err.windowClosed"));return;}if(paymentResult?.chainGameId){setRoomFullInfo(prev=>prev?{...prev,chainGameId:paymentResult.chainGameId}:prev);}setJoinPaid(true);setJoinErr(null);emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:paymentResult?.chainGameId||roomFullInfo?.chainGameId||null,inviteCode:roomFullInfo.inviteCode||joinCode,wallet});setJoinPhase("paid_waiting");}catch(e){const startedAtCatch=paymentStartedAtRef.current;const deadlineCatch=startedAtCatch?startedAtCatch+PAYMENT_TIMEOUT*1000:null;const timedOut=(deadlineCatch&&Date.now()>=deadlineCatch)||!!paymentFailureDialogRef.current;if(timedOut)return;const msg=formatPaymentUiError(e?.message||"Payment failed");setJoinErr(msg);setPaymentErr(msg);}},[joinCode,payForRoomEntry,emit,roomFullInfo,wallet,refund,handleRoomPaymentFailure]);
  const leaveRoom=()=>{emit("room:leave");if(joinPaid){refund(ENTRY_FEE);setJoinPaid(false);}setJoinPhase("select");setJoinExpiresAt(null);};

  // ===== QUICK MATCH =====
  useEffect(()=>{if(matchPhase!=="matching")return;setCd(15);const t=setInterval(()=>setCd(c=>{if(c<=1){clearInterval(t);return 0;}return c-1;}),1000);return()=>clearInterval(t);},[matchPhase]);

  useEffect(()=>{
    const u=[
      on("match:update",d=>{setMatchInfo({current:d.current});if(typeof d.remaining==="number")setCd(d.remaining);}),
      on("match:full",d=>{setMatchErr(null);setMatchInfo({current:d.current||d.total||matchTeamSizeRef.current});setMatchPhase("preparing");}),
      on("match:found",d=>{setPending(d);setPaymentProgress({paidCount:0,total:d.players?.length||0});setPaymentErr(null);setPaymentStartedAt(Date.now());if(mockMode){mockPay().then(()=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId,mode:"random",teamSize:d.teamSize||matchTeamSizeRef.current,players:d.players,phase:"predicting"});nav("/game");});}else setMatchPhase("payment");}),
      on("match:failed",()=>resetMatchState(t("home.err.noOpponents"))),
      on("match:error",d=>resetMatchState(d.message)),
      on("disconnect",()=>{
        if(matchPhaseRef.current==="matching"||matchPhaseRef.current==="preparing"){
          resetMatchState(t("home.err.lostConn"));
        }
      }),
    ];
    return()=>u.forEach(f=>f());
  },[on,mockMode,mockPay,updateGame,nav,resetMatchState]);

  useEffect(()=>{
    if(matchPhase!=="matching"||cd!==0)return;
    const timer=setTimeout(()=>{
      if(matchPhaseRef.current==="matching"){
        resetMatchState(t("home.err.noOpponents"),{cancelQueue:true});
      }
    },1200);
    return()=>clearTimeout(timer);
  },[matchPhase,cd,resetMatchState]);

  const startMatch=()=>{if(isCreateBusy||isJoinBusy){setMatchErr(t("home.err.finishFirst"));return;}if(isMatchBusy){setMatchErr(t("home.err.alreadyMatching"));return;}if(!mockMode && (!wallet || !provider || !signer)){connect({type:"random-match"});return;}setPending(null);setMatchErr(null);setMatchPhase("matching");setMatchInfo({current:1});emit("match:join",{teamSize:matchTeamSize});};
  const cancelMatch=()=>resetMatchState(null,{cancelQueue:true});
  const payMatch=useCallback(async()=>{if(!pending)return;try{setPaymentErr(null);setPaymentNotice(null);if(!pending.gameId||!pending.chainGameId||!wallet)throw new Error("Missing game id");const startedAt=paymentStartedAtRef.current;const deadline=startedAt?startedAt+PAYMENT_TIMEOUT*1000:null;if((deadline&&Date.now()>=deadline)||paymentFailureDialogRef.current){handleRoomPaymentFailure(t("home.err.windowClosed"));return;}await payForGame(pending.chainGameId);const nowDeadline=paymentStartedAtRef.current?paymentStartedAtRef.current+PAYMENT_TIMEOUT*1000:deadline;if((nowDeadline&&Date.now()>=nowDeadline)||paymentFailureDialogRef.current){refund(ENTRY_FEE);handleRoomPaymentFailure(t("home.err.windowClosed"));return;}emit("room:payment:confirm",{gameId:pending.gameId,chainGameId:pending.chainGameId,wallet});setMatchPhase("paid_waiting");}catch(e){const startedAtCatch=paymentStartedAtRef.current;const deadlineCatch=startedAtCatch?startedAtCatch+PAYMENT_TIMEOUT*1000:null;const timedOut=(deadlineCatch&&Date.now()>=deadlineCatch)||!!paymentFailureDialogRef.current;if(timedOut){setMatchPhase("select");return;}const msg=formatPaymentUiError(e?.message||"Payment failed");setMatchErr(msg);setPaymentErr(msg);setMatchPhase("select");}},[pending,payForGame,emit,wallet,refund,handleRoomPaymentFailure]);
  const claimHistoryReward=useCallback(async(game)=>{
    if(!game?.claimable||!game?.chain_game_id)return;
    try{
      setClaimingHistoryId(game.id);
      const payout=await claimGameFunds(game.chain_game_id,walletRef.current);
      setHistory(prev=>prev.map(item=>item.id===game.id?{
        ...item,
        claimed:true,
        claimable:false,
        uiState:(payout?.type==="refund"||item.claimAction==="refund")?"Refunded":item.uiState,
      }:item));
      reloadHistory(walletRef.current);
    }catch(e){
      const msg=e?.message||"Claim failed";
      alert(msg);
    }finally{
      setClaimingHistoryId(null);
    }
  },[claimGameFunds,reloadHistory]);

  // Payment modal — room payment keeps the modal open while waiting for everyone
  const isRoomPreparing=(createPhase==="preparing")||(joinPhase==="preparing");
  const isRoomPaymentPhase=(createPhase==="payment")||(joinPhase==="payment");
  const isRoomPaidWaiting=(createPhase==="paid_waiting")||(joinPhase==="paid_waiting");
  const isMatchPreparing=matchPhase==="preparing";
  const isMatchPaymentPhase=matchPhase==="payment";
  const isMatchPaidWaiting=matchPhase==="paid_waiting";
  const isWaitingPaymentPhase=isRoomPaidWaiting||isMatchPaidWaiting;
  const showPayment=isRoomPreparing||isRoomPaymentPhase||isWaitingPaymentPhase||isMatchPreparing||isMatchPaymentPhase||!!paymentFailureDialog;
  const paymentModalMode=isWaitingPaymentPhase?"waiting":(isRoomPreparing||isMatchPreparing)?"preparing":"confirm";
  const preparingMatchTotal=matchInfo.current||matchTeamSize;
  const onPayConfirm=createPhase==="payment"?payCreate:joinPhase==="payment"?payJoin:payMatch;
  const onPayCancel=()=>{
    if(createPhase==="payment")cancelCreate();
    else if(joinPhase==="payment")leaveRoom();
    else{setMatchPhase("select");setPending(null);}
    setPaymentNotice(null);
    setPaymentErr(null);
  };
  const closePaymentFailureDialog=useCallback(()=>{setPaymentFailureDialog(null);paymentFailureDialogRef.current=null;},[]);
  const classifyFailure=(reason)=>{const raw=(reason||"").toString();const cancelled=/walked away|left the room|player left|host left|取消|退出|离开/i.test(raw);if(!cancelled)return{kind:"timeout",text:raw};const isHost=/host/i.test(raw)||/房主/.test(raw);return{kind:"cancelled",text:isHost?t("home.err.hostLeft"):t("home.err.playerLeft")};};
  const failureInfo=paymentFailureDialog?classifyFailure(paymentFailureDialog):null;
  const isFailureCancelled=failureInfo?.kind==="cancelled";

  useEffect(()=>{
    if(paymentCountdown!==0)return;
    const everyonePaid = paymentProgress.total>0&&paymentProgress.paidCount>=paymentProgress.total;
    if(everyonePaid)return;
    const stillInPayment =
      createPhaseRef.current==="payment"||
      createPhaseRef.current==="paid_waiting"||
      joinPhaseRef.current==="payment"||
      joinPhaseRef.current==="paid_waiting"||
      matchPhaseRef.current==="payment"||
      matchPhaseRef.current==="paid_waiting";
    if(!stillInPayment)return;
    const timer=setTimeout(()=>{
      const paymentStillOpen =
        createPhaseRef.current==="payment"||
        createPhaseRef.current==="paid_waiting"||
        joinPhaseRef.current==="payment"||
        joinPhaseRef.current==="paid_waiting"||
        matchPhaseRef.current==="payment"||
        matchPhaseRef.current==="paid_waiting";
      const fullyPaidNow = paymentProgress.total>0&&paymentProgress.paidCount>=paymentProgress.total;
      if(paymentStillOpen&&!fullyPaidNow)handleRoomPaymentFailure(t("home.err.timeoutTeam"));
    },1200);
    return()=>clearTimeout(timer);
  },[paymentCountdown,paymentProgress,handleRoomPaymentFailure]);

  useEffect(()=>{
    const everyonePaid=paymentProgress.total>0&&paymentProgress.paidCount>=paymentProgress.total;
    if(!everyonePaid||!wallet)return;
    if(createPhase!=="paid_waiting"&&joinPhase!=="paid_waiting")return;
    const now=Date.now();
    if(now-paymentResumeRequestAtRef.current<2500)return;
    paymentResumeRequestAtRef.current=now;
    emit("game:resume:request");
  },[paymentProgress,createPhase,joinPhase,wallet,emit]);

  useEffect(()=>{
    if(!pendingAction) return;
    if(!mockMode && (!wallet || !provider || !signer)) return;
    const action = pendingAction;
    setPendingAction(null);
    if(action.type === "create-room") createRoom();
    if(action.type === "random-match") startMatch();
    if(action.type === "join-room"){ if(action.code) setJoinCode(action.code); setTimeout(()=>submitJoin(),0); }
  },[pendingAction,wallet,provider,signer,mockMode]);

  // Team size selector component
  const SizeSelector=SizeSelectorBase;

  // Format countdown as mm:ss
  const fmtCountdown=(s)=>{if(s===null||s===undefined)return"";return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
  const createRoomTotal=room.total||createTeamSize;

  return(
    <div className="max-w-5xl mx-auto px-6 py-8 min-h-screen">

      {/* Top section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
            {t("home.hero.title.pre")} <span className="text-gradient">{t("home.hero.title.highlight")}</span>
          </h1>
          <p className="text-white/50 text-sm leading-relaxed max-w-lg">
            {t("home.hero.desc", { fee: ENTRY_FEE })}
          </p>
          {mockMode&&<div className="inline-flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1 mt-3">
            <span className="text-violet-300/80 text-[10px] font-bold">{t("home.demoBadge")}</span>
          </div>}
          {!wallet&&!mockMode&&<p className="text-white/30 text-xs mt-3">
            {window.ethereum?t("home.hint.connectWallet"):t("home.hint.noWallet")}
          </p>}
        </div>
        <div className="card glow-orange flex flex-col items-center justify-center">
          <BtcTicker price={price} size="lg" label={t("home.ticker.label")}/>
          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
            <span className="text-white/30 text-[9px] uppercase tracking-[0.2em]">{t("home.ticker.live")}</span>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {stats&&(stats.wins>0||stats.losses>0)&&<div className="grid grid-cols-3 gap-3 mb-6">
        <div className="stat-card"><p className="text-[10px] text-white/35 uppercase tracking-wider">{t("home.stats.wins")}</p><p className="text-xl font-black text-emerald-400">{stats.wins}</p></div>
        <div className="stat-card"><p className="text-[10px] text-white/35 uppercase tracking-wider">{t("home.stats.losses")}</p><p className="text-xl font-black text-rose-400">{stats.losses}</p></div>
        <div className="stat-card"><p className="text-[10px] text-white/35 uppercase tracking-wider">{t("home.stats.profit")}</p><p className={`text-xl font-black ${parseFloat(stats.total_earned)-parseFloat(stats.total_lost)>=0?"text-emerald-400":"text-rose-400"}`}>{(parseFloat(stats.total_earned)-parseFloat(stats.total_lost)).toFixed(2)}</p></div>
      </div>}

      {/* ===== Card Carousel ===== */}
      <div className="relative mb-8">
        <button onClick={scrollLeft}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.1] transition backdrop-blur-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button onClick={scrollRight}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.1] transition backdrop-blur-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        <div ref={scrollRef} onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto scroll-smooth pb-2 hide-scrollbar"
          style={{scrollbarWidth:"none",msOverflowStyle:"none"}}
        >
          {/* Card 1: Create Room */}
          <div className="flex-shrink-0 w-[calc(50%-8px)] min-w-[280px]">
            <div className={`rounded-2xl border p-5 h-full transition-all duration-300
              ${activeCard===0
                ?"border-violet-500/30 bg-gradient-to-br from-indigo-500/[0.1] to-violet-500/[0.08] shadow-lg shadow-violet-500/[0.08]"
                :"border-white/[0.06] bg-white/[0.02] opacity-70 hover:opacity-90"}`}
              onClick={()=>{if(activeCard!==0){setActiveCard(0);setMode("create");}}}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-xl">🏟️</div>
                <div>
                  <h3 className="text-sm font-bold">{t("home.card.create.title")}</h3>
                  <p className="text-[10px] text-white/30">{t("home.card.create.desc")}</p>
                </div>
              </div>

              {createErr&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-lg mb-3 text-[10px]">⚠️ {createErr}</div>}
              {createHint&&<div className="bg-white/[0.03] border border-white/[0.06] text-white/45 px-3 py-2 rounded-lg mb-3 text-[10px]">{createHint}</div>}

              {createPhase==="select"&& !openRoom&&(
                <SizeSelector label={t("home.teamSize")} selectedSize={createTeamSize} onSelect={setCreateTeamSize} onAction={createRoom} actionLabel="Create" disabled={isJoinBusy||isMatchBusy}/>
              )}
              {createPhase==="creating"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-violet-400/30 border-t-violet-300 animate-spin mb-3"/><p className="text-white/40 text-xs">{t("home.creating")}</p></div>)}
              {createPhase==="dissolving"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-violet-400/30 border-t-violet-300 animate-spin mb-3"/><p className="text-white/40 text-xs">{t("home.cancelling")}</p></div>)}
              {(createPhase==="waiting"||createPhase==="paid_waiting"||createPhase==="preparing")&&(
                <div className="text-center">
                  <p className="text-white/20 text-[8px] uppercase tracking-[0.3em] mb-2">{t("home.arenaCode")}</p>
                  <button
                    type="button"
                    onClick={copyCode}
                    aria-label={t("home.copy.cta")}
                    className={`group relative w-full rounded-xl px-4 py-3 mb-2 transition border ${copied?"bg-emerald-500/10 border-emerald-500/25":"bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12]"}`}
                  >
                    <span className="text-2xl font-mono font-black tracking-[0.4em] text-gradient">{roomCode}</span>
                    <span className={`block mt-1 text-[9px] tracking-wider ${copied?"text-emerald-400":"text-white/25 group-hover:text-white/45"}`}>
                      {copied?t("home.copy.done"):t("home.copy.clickHint")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={shareTwitter}
                    aria-label={t("home.share.twitter")}
                    className="w-full rounded-xl px-3 py-2 mb-2 text-[11px] tracking-wider transition border bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-sky-500/10 hover:border-sky-500/25 hover:text-sky-300 inline-flex items-center justify-center gap-1.5"
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current" aria-hidden="true"><path d="M18.244 2H21l-6.52 7.45L22 22h-6.828l-4.76-6.23L4.8 22H2l7.02-8.02L2 2h6.91l4.29 5.68L18.244 2Zm-2.397 18h1.86L7.24 4H5.3l10.547 16Z"/></svg>
                    <span>{t("home.share.twitter")}</span>
                  </button>
                  <TeamSlots total={createRoomTotal} players={room.players} current={room.current}/>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"/>
                    <span className="text-white/30 font-mono">{createPhase==="preparing" ? t("home.preparingPayment") : createPaid && paymentProgress.total ? `${paymentProgress.paidCount}/${paymentProgress.total} ${t("home.paid")}` : `${room.current}/${createRoomTotal} ${t("home.ready")}`}</span>
                  </div>
                  {/* Room expiry countdown — only when not full */}
                  {roomCountdown!==null&&roomCountdown>0&&room.current<createRoomTotal&&(
                    <div className={`mt-2 flex items-center justify-center gap-1.5 ${roomCountdown<=30?"text-rose-400":"text-violet-300"}`}>
                      <span className="text-sm">⏱️</span>
                      <span className="text-sm font-mono font-bold">{fmtCountdown(roomCountdown)}</span>
                      <span className="text-[9px] text-white/25 ml-1">{t("home.remaining")}</span>
                    </div>
                  )}
                  {/* Payment countdown (after full, 60s) */}
                  {paymentCountdown!==null&&paymentCountdown>0&&createPhase==="paid_waiting"&&(
                    <div className={`mt-2 flex items-center justify-center gap-1.5 ${paymentCountdown<=10?"text-rose-400":"text-violet-300"}`}>
                      <span className="text-sm">💰</span>
                      <span className="text-sm font-mono font-bold">{paymentCountdown}s</span>
                      <span className="text-[9px] text-white/25 ml-1">{t("home.payment.countdown")}</span>
                    </div>
                  )}
                  <button onClick={dissolveRoom} disabled={createPhase==="preparing"} className="mt-3 w-full py-2 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-rose-500/[0.06] hover:text-rose-400 transition text-[10px] text-white/20 disabled:opacity-30 disabled:cursor-not-allowed">{t("home.cancel")}</button>
                </div>
              )}
              {/* Expired state — highlighted Expired button */}
              {createPhase==="expired"&&(
                <div className="text-center">
                  <p className="text-white/20 text-[8px] uppercase tracking-[0.3em] mb-2">{t("home.arenaCode")}</p>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 mb-3">
                    <span className="text-2xl font-mono font-black tracking-[0.4em] text-white/15 line-through">{roomCode}</span>
                  </div>
                  <p className="text-rose-400 text-xs mb-3">{t("home.expiredMsg")}</p>
                  <button onClick={clearExpired} className="w-full py-2.5 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 text-white font-bold text-sm shadow-lg shadow-rose-500/20 hover:shadow-rose-500/30 transition">
                    {t("home.expiredCta")}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Join Room */}
          <div className="flex-shrink-0 w-[calc(50%-8px)] min-w-[280px]">
            <div className={`rounded-2xl border p-5 h-full transition-all duration-300
              ${activeCard===1
                ?"border-violet-500/30 bg-gradient-to-br from-indigo-500/[0.1] to-violet-500/[0.08] shadow-lg shadow-violet-500/[0.08]"
                :"border-white/[0.06] bg-white/[0.02] opacity-70 hover:opacity-90"}`}
              onClick={()=>{if(activeCard!==1){setActiveCard(1);setMode("join");}}}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-xl">🎯</div>
                <div>
                  <h3 className="text-sm font-bold">{t("home.card.join.title")}</h3>
                  <p className="text-[10px] text-white/30">{t("home.card.join.desc")}</p>
                </div>
              </div>

              {joinErr&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-lg mb-3 text-[10px]">⚠️ {joinErr}</div>}

              {joinPhase==="validating"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-violet-400/30 border-t-violet-300 animate-spin mb-3"/><p className="text-white/40 text-xs">{t("home.validating")}</p></div>)}
              {joinPhase==="joining"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-violet-400/30 border-t-violet-300 animate-spin mb-3"/><p className="text-white/40 text-xs">{t("home.joining")}</p></div>)}
              {joinPhase==="select"&&(
                <div>
                  <p className="text-white/30 text-[11px] mb-3 font-medium">{t("home.arenaCode")}</p>
                  <input type="text" value={joinCode}
                    onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}
                    placeholder={t("home.codePlaceholder")}
                    maxLength={6}
                    disabled={joinEntryDisabled}
                    className={`w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-center text-xl font-mono font-black tracking-[0.4em] text-violet-300 placeholder:text-white/[0.08] placeholder:tracking-normal placeholder:text-xs placeholder:font-normal transition mb-3 ${joinEntryDisabled?"cursor-not-allowed opacity-40":"focus:outline-none focus:border-violet-500/30"}`}
                  />
                  {joinBlockedMsg&&<p className="text-[10px] text-white/25 mb-3">{joinBlockedMsg}</p>}
                  <button onClick={submitJoin} disabled={joinCode.length<6||joinEntryDisabled} className="btn-primary w-full py-3 font-bold text-sm disabled:!opacity-15">{t("home.join")}</button>
                </div>
              )}
              {/* Confirm dialog: no payment, just confirm joining */}
              {joinPhase==="confirm"&&(
                <div className="text-center">
                  <p className="text-white/40 text-xs mb-3">{t("home.joinConfirm")}</p>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 mb-4">
                    <span className="text-xl font-mono font-black tracking-[0.4em] text-gradient">{joinCode}</span>
                  </div>
                  <p className="text-white/25 text-[10px] mb-4">{joinValidInfo?t("home.joinPlayersInRoom",{n:joinValidInfo.current,total:joinValidInfo.total}):""}</p>
                  <div className="flex gap-2">
                    <button onClick={()=>{setJoinPhase("select");setJoinValidInfo(null);}} className="flex-1 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] text-white/30 text-xs transition">{t("home.cancel")}</button>
                    <button onClick={confirmJoin} className="flex-1 btn-primary !py-2.5 !text-sm font-bold">{t("home.join")}</button>
                  </div>
                </div>
              )}
              {(joinPhase==="waiting"||joinPhase==="paid_waiting"||joinPhase==="preparing")&&(
                <div className="text-center">
                  <p className="text-white/20 text-[8px] uppercase tracking-[0.3em] mb-2">{t("home.joinedArena")}</p>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 mb-3">
                    <span className="text-xl font-mono font-black tracking-[0.4em] text-gradient">{joinCode}</span>
                  </div>
                  <TeamSlots total={joinRoom.total} players={joinRoom.players}/>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"/>
                    <span className="text-white/30 font-mono">{joinPhase==="preparing" ? t("home.preparingPayment") : joinPaid && paymentProgress.total ? `${paymentProgress.paidCount}/${paymentProgress.total} ${t("home.paid")}` : `${joinRoom.current}/${joinRoom.total} ${t("home.waiting")}`}</span>
                  </div>
                  {/* Join room expiry countdown */}
                  {joinCountdown!==null&&joinCountdown>0&&joinRoom.current<joinRoom.total&&(
                    <div className={`mt-2 flex items-center justify-center gap-1.5 ${joinCountdown<=30?"text-rose-400":"text-violet-300"}`}>
                      <span className="text-sm">⏱️</span>
                      <span className="text-sm font-mono font-bold">{fmtCountdown(joinCountdown)}</span>
                      <span className="text-[9px] text-white/25 ml-1">{t("home.remaining")}</span>
                    </div>
                  )}
                  {/* Payment countdown (after full, 60s) */}
                  {paymentCountdown!==null&&paymentCountdown>0&&joinPhase==="paid_waiting"&&(
                    <div className={`mt-2 flex items-center justify-center gap-1.5 ${paymentCountdown<=10?"text-rose-400":"text-violet-300"}`}>
                      <span className="text-sm">💰</span>
                      <span className="text-sm font-mono font-bold">{paymentCountdown}s</span>
                      <span className="text-[9px] text-white/25 ml-1">{t("home.payment.countdown")}</span>
                    </div>
                  )}
                  <button onClick={leaveRoom} disabled={joinPhase==="preparing"} className="mt-3 w-full py-2 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-rose-500/[0.06] hover:text-rose-400 transition text-[10px] text-white/20 disabled:opacity-30 disabled:cursor-not-allowed">{t("home.leave")}</button>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Quick Match */}
          <div className="flex-shrink-0 w-[calc(50%-8px)] min-w-[280px]">
            <div className={`rounded-2xl border p-5 h-full transition-all duration-300
              ${activeCard===2
                ?"border-violet-500/30 bg-gradient-to-br from-indigo-500/[0.1] to-violet-500/[0.08] shadow-lg shadow-violet-500/[0.08]"
                :"border-white/[0.06] bg-white/[0.02] opacity-70 hover:opacity-90"}`}
              onClick={()=>activeCard!==2&&goCard(2)}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-xl">⚔️</div>
                <div>
                  <h3 className="text-sm font-bold">{t("home.card.match.title")}</h3>
                  <p className="text-[10px] text-white/30">{t("home.card.match.desc")}</p>
                </div>
              </div>

              {matchErr&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-lg mb-3 text-[10px]">⚠️ {matchErr}</div>}

              {matchPhase==="select"&&(
                <SizeSelector label={t("home.teamSize")} selectedSize={matchTeamSize} onSelect={setMatchTeamSize} onAction={startMatch} actionLabel="Match" disabled={isCreateBusy||isJoinBusy}/>
              )}
              {matchPhase==="matching"&&(
                <div>
                  <MatchAnimation teamSize={matchTeamSize} current={matchInfo.current} countdown={cd} status="matching"/>
                  <button onClick={cancelMatch} className="w-full mt-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition text-[10px] text-white/20">{t("home.cancel")}</button>
                </div>
              )}
              {matchPhase==="preparing"&&(
                <div>
                  <MatchAnimation teamSize={matchTeamSize} current={matchTeamSize} status="preparing"/>
                  <p className="mt-3 text-center text-[10px] text-white/25">{t("home.preparingNote")}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dot indicators + swipe hint */}
        <div className="flex items-center justify-center gap-3 mt-4">
          {activeCard>0&&<span className="text-white/15 text-[10px] mr-1">{t("home.swipe.left")}</span>}
          {CARDS.map((_,i)=>(
            <button key={i} onClick={()=>{goCard(i);if(i>=2)scrollToCard(1);else scrollToCard(0);}}
              className={`rounded-full transition-all duration-300
                ${activeCard===i?"w-6 h-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500":"w-2 h-2 bg-white/15 hover:bg-white/25"}`}
            />
          ))}
          {activeCard<2&&<span className="text-white/15 text-[10px] ml-1">{t("home.swipe.right")}</span>}
        </div>
      </div>

      {/* Payment modal — shown when room is full (both creator and joiner) or quick match */}
      <PaymentModal
        visible={showPayment}
        onConfirm={paymentFailureDialog?closePaymentFailureDialog:onPayConfirm}
        onCancel={paymentFailureDialog?undefined:onPayCancel}
        loading={loading}
        mode={paymentModalMode}
        title={paymentFailureDialog
          ?t(isFailureCancelled?"home.payment.cancelledTitle":"home.payment.timedOutTitle")
          :isWaitingPaymentPhase
          ?t("home.payment.confirmedTitle")
          :isRoomPreparing
            ?t("home.payment.preparingTitle")
          :isMatchPreparing
            ?t("home.payment.matchFoundTitle")
          :isRoomPaymentPhase
            ?t("home.payment.roomFullTitle")
            :t("home.payment.enterMatchTitle")}
        subtitle={paymentFailureDialog
          ?t(isFailureCancelled?"home.payment.cancelledSubtitle":"home.payment.timedOutSubtitle")
          :isWaitingPaymentPhase
          ?t("home.payment.waitingSubtitle")
          :isRoomPreparing
            ?t("home.payment.preparingRoomSubtitle",{n:paymentProgress.total||0})
          :isMatchPreparing
            ?t("home.payment.preparingMatchSubtitle",{n:preparingMatchTotal})
          :isRoomPaymentPhase
            ?t("home.payment.roomFullSubtitle",{n:paymentProgress.total,t:paymentCountdown||PAYMENT_TIMEOUT})
            :t("home.payment.enterMatchSubtitle")}
        actionLabel={paymentFailureDialog?t("home.payment.confirm"):t("home.payment.action")}
        amount="1 USDC"
        error={failureInfo?failureInfo.text:paymentErr}
        notice={paymentNotice}
        hint={isWaitingPaymentPhase
          ?t("home.payment.waitingHint",{n:paymentProgress.total||0,mock:shouldUseMockPayment?t("home.payment.mockAppend"):""})
          :isRoomPreparing
            ?t("home.payment.preparingRoomHint")
          :isMatchPreparing
            ?t("home.payment.preparingMatchHint")
          :isRoomPaymentPhase
            ?`${paymentProgress.paidCount}/${paymentProgress.total} ${t("home.paid")}${shouldUseMockPayment?t("home.payment.roomFullHint.suffix"):""}`
            :shouldUseMockPayment
              ?t("home.payment.mockHint")
              :t("home.payment.walletHint")}
        countdown={paymentFailureDialog?null:(isRoomPaymentPhase||isWaitingPaymentPhase||isMatchPaymentPhase)?paymentCountdown:null}
        countdownLabel={(isRoomPaymentPhase||isWaitingPaymentPhase||isMatchPaymentPhase)?t("home.payment.countdownLabel"):null}
        paidCount={paymentProgress.paidCount}
        totalCount={isMatchPreparing?preparingMatchTotal:paymentProgress.total}
        singleAction={!!paymentFailureDialog}
      />

      {/* Bottom row */}
      <div className="card !p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">{t("home.history.title")}</h3>
          <div className="flex gap-1">
            {[["all","home.history.filter.all"],["create","home.history.filter.create"],["join","home.history.filter.join"],["random","home.history.filter.random"]].map(([k,l])=><button key={k} onClick={()=>setHistoryFilter(k)} className={`px-2 py-1 rounded-lg text-[10px] ${historyFilter===k?"bg-violet-500/20 text-violet-300 border border-violet-500/25":"bg-white/[0.03] text-white/25 border border-white/[0.04]"}`}>{t(l)}</button>)}
          </div>
        </div>
        {!wallet ? (
          <p className="text-white/20 text-xs">{t("home.history.connect")}</p>
        ) : history.length===0 ? (
          <p className="text-white/20 text-xs">{t("home.history.empty")}</p>
        ) : (()=>{
          const filtered = history.filter(g=>historyFilter==="all"?true:historyFilter==="create"?(g.mode==="room"&&g.is_owner):historyFilter==="join"?(g.mode==="room"&&!g.is_owner):g.mode==="random");
          const pageSize = 6;
          const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
          const page = Math.min(historyPage, totalPages);
          const pageItems = filtered.slice((page-1)*pageSize, page*pageSize);
          return <div className="space-y-2">
            {pageItems.map(g=>{
              const isRoom = g.mode === "room";
              const title = isRoom ? (g.is_owner ? t("home.history.createRoom") : t("home.history.joinRoom")) : t("home.history.randomMatch");
              const result = translateHistoryResult(g);
              const time = new Date(g.settled_at || g.failed_at || g.started_at || g.created_at).toLocaleString();
              const canClaim = !!g.claimable;
              const isClaiming = claimingHistoryId === g.id && claiming;
              const isClaimed = !!g.claimed;
              const actionLabel = translateHistoryLabel(g.claimLabel, t("home.history.claim"));
              const claimedLabel = translateHistoryLabel(g.claimedLabel, t("home.history.claimed"));
              return (
                <div key={g.id} className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-none">{title}</p>
                      <p className="text-[10px] text-white/25 mt-1">{time}</p>
                    </div>
                    <div className="flex-1 text-center min-w-0 px-2">
                      <p className="text-[10px] text-white/30">{t("home.arenaCode")}</p>
                      <p className="text-[11px] font-mono text-violet-300 truncate">{isRoom && g.invite_code ? g.invite_code : "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-white/35">{g.max_players}P</p>
                      <p className={`text-xs font-bold mt-1 ${getHistoryResultClass(result)}`}>{result}</p>
                    </div>
                  </div>
                  {g.error_message&&g.state==="failed"&&(
                    <p className="mt-2 text-[10px] text-violet-200/80 leading-relaxed">{g.error_message}</p>
                  )}
                  {(canClaim||isClaimed||isClaiming) && <div className="mt-3 flex justify-end">
                    <button
                      onClick={()=>claimHistoryReward(g)}
                      disabled={!canClaim||isClaiming}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition ${
                        isClaimed
                          ?"bg-emerald-500/10 border border-emerald-500/15 text-emerald-300 cursor-default"
                          : canClaim
                            ?"bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow shadow-emerald-500/20 disabled:opacity-60"
                            :"bg-white/[0.03] border border-white/[0.05] text-white/35 cursor-default"
                      }`}
                    >
                      {isClaiming ? t("home.history.claiming") : isClaimed ? claimedLabel : actionLabel}
                    </button>
                  </div>}
                </div>
              );
            })}
            {totalPages > 1 && <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={()=>setHistoryPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-2 py-1 rounded-lg text-[10px] bg-white/[0.03] border border-white/[0.04] text-white/35 disabled:opacity-30">{t("home.history.prev")}</button>
              <span className="text-[10px] text-white/35">{page} / {totalPages}</span>
              <button onClick={()=>setHistoryPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-2 py-1 rounded-lg text-[10px] bg-white/[0.03] border border-white/[0.04] text-white/35 disabled:opacity-30">{t("home.history.next")}</button>
            </div>}
          </div>;
        })()}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="card !p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">{t("home.quickRules")}</h3>
            <button onClick={()=>nav("/how-to-play")} className="text-[10px] text-violet-300/60 hover:text-violet-300 transition font-semibold">{t("home.learnMore")}</button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-white/45">
            <div className="bg-white/[0.02] rounded-lg px-3 py-2.5 flex items-center gap-2"><span>💰</span>{t("home.rule.entry",{fee:ENTRY_FEE})}</div>
            <div className="bg-white/[0.02] rounded-lg px-3 py-2.5 flex items-center gap-2"><span>⏱️</span>{t("home.rule.predict")}</div>
            <div className="bg-white/[0.02] rounded-lg px-3 py-2.5 flex items-center gap-2"><span>📊</span>{t("home.rule.settle")}</div>
            <div className="bg-white/[0.02] rounded-lg px-3 py-2.5 flex items-center gap-2"><span>🏆</span>{t("home.rule.pool")}</div>
          </div>
          <div className="mt-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <button
              type="button"
              onClick={()=>setPayoutRulesOpen(v=>!v)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="text-xs text-white/55 flex items-center gap-2"><span>📐</span>{t("home.payout.quickRules")}</span>
              <span className="text-white/35 text-[10px]">{payoutRulesOpen?"▴":"▾"}</span>
            </button>
            {payoutRulesOpen&&<div className="px-3 pb-3 pt-2 border-t border-white/[0.04] space-y-3">
              <div>
                <div className="font-mono text-[11px] text-white/70 bg-white/[0.03] rounded-lg px-3 py-2 leading-relaxed">{t("home.payout.formula")}</div>
                <div className="mt-1.5 text-[10px] text-white/40 leading-relaxed">{t("home.payout.legend")}</div>
              </div>
              <div className="pt-2 border-t border-white/[0.04]">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-1.5">{t("home.payout.exampleLabel")}</p>
                <div className="font-mono text-[11px] text-emerald-300 mb-1">{t("home.payout.exampleCalc")}</div>
                <p className="text-[10px] text-white/45 leading-relaxed">{t("home.payout.exampleNote")}</p>
              </div>
              <div className="text-[10px] text-white/35 leading-relaxed">{t("home.payout.quickRulesNote")}</div>
            </div>}
          </div>
        </div>
      </div>

    </div>
  );
}
