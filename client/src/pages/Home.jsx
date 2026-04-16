import{useState,useEffect,useCallback,useRef}from"react";
import{useNavigate}from"react-router-dom";
import{useWallet}from"../context/WalletContext";
import{useSocket}from"../hooks/useSocket";
import{SERVER_URL}from"../config/constants";
import{useGame}from"../context/GameContext";
import{useContract}from"../hooks/useContract";
import{useBtcPrice}from"../hooks/useBtcPrice";
import{BtcTicker,TeamSlots,MatchAnimation,PaymentModal}from"../components";
import{ENTRY_FEE,TEAM_SIZES,PAYMENT_TIMEOUT}from"../config/constants";

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
  if(result==="Failed")return"text-amber-300";
  if(result==="Expired")return"text-orange-400";
  if(result==="Cancelled")return"text-white/30";
  if(result==="Waiting")return"text-amber-300";
  if(result==="Playing")return"text-sky-300";
  if(result==="Refund Ready"||result==="Refunded")return"text-amber-300";
  if(result==="Settled")return"text-emerald-300";
  return"text-white/35";
}

export default function Home(){
  const nav=useNavigate();
  const{wallet,provider,signer,connect,mockMode,refund,pendingAction,setPendingAction}=useWallet();
  const{emit,on}=useSocket();
  const{updateGame}=useGame();
  const{payForGame,claimGameFunds,getGameClaimStatus,loading,claiming,mockPay,shouldUseMockPayment}=useContract();
  const price=useBtcPrice();

  const[history,setHistory]=useState([]);
  const[historyFilter,setHistoryFilter]=useState("all");
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
    setRoomFullInfo(prev=>({
      gameId:d?.gameId||prev?.gameId||null,
      chainGameId:d?.chainGameId||prev?.chainGameId||null,
      inviteCode:d?.inviteCode||prev?.inviteCode||roomCodeRef.current||joinCodeRef.current||"",
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
      if(createPhaseRef.current==="waiting"||createPhaseRef.current==="creating")setRoom({current:total,total:d?.total||total,players});
      if(joinPhaseRef.current==="waiting"||joinPhaseRef.current==="joining")setJoinRoom({current:total,total:d?.total||total,players});
    }
    if(createPhaseRef.current==="waiting"||createPhaseRef.current==="creating")setCreatePhase("payment");
    if(joinPhaseRef.current==="waiting"||joinPhaseRef.current==="joining")setJoinPhase("payment");
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

  const handleRoomPaymentFailure=useCallback((reason="Payment timeout — team disbanded")=>{
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
    setRoomFullInfo(null);
    setPaymentNotice(null);
    setPaymentErr(null);
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
          setRoomFullInfo({gameId:d.room.game_id||d.room.id,chainGameId:d.room.chain_game_id||d.room.game_id||d.room.id,inviteCode:code,players,paymentTimeout:d.room.payment_timeout_ms});
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
            setJoinErr("Room expired — team not filled in time");
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
        if(createPhaseRef.current==="waiting"||createPhaseRef.current==="paid_waiting"){
          const total=d.total||roomRef.current.total||createTeamSizeRef.current||d.players?.length||0;
          setCreateTeamSize(total||createTeamSizeRef.current);
          setRoom({current:d.current,total,players:d.players});
          if(d.expiresAt)setRoomExpiresAt(d.expiresAt);
        }
        if(joinPhaseRef.current==="waiting"||joinPhaseRef.current==="paid_waiting"){
          const total=d.total||joinRoomRef.current.total||d.players?.length||0;
          setJoinRoom({current:d.current,total,players:d.players});
          if(d.expiresAt)setJoinExpiresAt(d.expiresAt);
        }
        if((d.status==="full"||(d.total&&d.current>=d.total))&&d.chainGameId)enterRoomPayment(d);
      }),
      on("room:full",d=>{
        enterRoomPayment(d);
      }),
      on("room:error",d=>{
        if(createTimeoutRef.current){clearTimeout(createTimeoutRef.current);createTimeoutRef.current=null;}
        const uiMsg=formatPaymentUiError(d.message);
        if(createPhaseRef.current==="dissolving"){
          createCancelPendingRef.current=false;
          setCreatePhase(createPhaseBeforeCancelRef.current==="paid_waiting"?"paid_waiting":"waiting");
        }
        setCreateHint(null);
        if(createPhaseRef.current==="creating"||createPhaseRef.current==="waiting"||createPhaseRef.current==="payment"||createPhaseRef.current==="paid_waiting") {setCreateErr(uiMsg);setPaymentErr(uiMsg);}
        if(createPhaseRef.current==="dissolving") {setCreateErr(uiMsg);}
        if(joinPhaseRef.current==="select"||joinPhaseRef.current==="waiting"||joinPhaseRef.current==="joining"||joinPhaseRef.current==="payment"||joinPhaseRef.current==="paid_waiting") {setJoinErr(uiMsg);setPaymentErr(uiMsg);if(joinPhaseRef.current!=="payment"&&joinPhaseRef.current!=="paid_waiting")setJoinPhase("select");}
        setCreatePhase(prev=>prev==="creating"?"select":prev);
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
          setJoinErr("Room expired — team not filled in time");
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
        setJoinErr(d?.message||"Room not found or expired");setJoinPhase("select");
      }),
      on("room:payment:update",d=>{setPaymentProgress({paidCount:d.paidCount,total:d.total});}),
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
          setJoinPhase("payment");
        } else if(joinPhaseRef.current!=="payment"&&joinPhaseRef.current!=="paid_waiting"){
          setJoinPhase("waiting");
        }
      }),
      on("game:start",d=>{
        updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players.length,players:d.players,phase:"predicting",basePrice:d.basePrice,countdown:Math.round((d.predictTimeout||30000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null});
        setPaymentStartedAt(null);
        setTimeout(()=>nav("/game"),500);
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
    ?"You already have an active room. Cancel or finish it before joining another one."
    :isMatchBusy
      ?"Finish the current match flow before joining a room."
      :null;

  const createRoom=()=>{if(isJoinBusy||isMatchBusy){setCreateErr("Finish or cancel current action first");return;}if(isCreateBusy){setCreateErr("Already creating a room");return;}if(!mockMode && (!wallet || !provider || !signer)){connect({type:"create-room"});return;}createCancelPendingRef.current=false;createPhaseBeforeCancelRef.current="select";setCreateErr(null);setCreateHint(null);setCreatePhase("creating");if(createTimeoutRef.current)clearTimeout(createTimeoutRef.current);createTimeoutRef.current=setTimeout(()=>{createTimeoutRef.current=null;if(createPhaseRef.current==="creating")setCreateHint("Base Sepolia is taking longer than usual. Waiting for on-chain confirmation...");},12000);emit("room:create",{teamSize:createTeamSize});};
  const payCreate=useCallback(async()=>{try{setPaymentErr(null);setPaymentNotice(null);if(!roomFullInfo?.chainGameId||!roomFullInfo?.gameId||!wallet)throw new Error("Missing game id");const paymentResult=await payForGame(roomFullInfo.chainGameId);if(paymentResult?.approved&&!paymentResult?.paid){const notice="USDC approval confirmed. Tap `Pay 1 USDC` one more time to complete the entry.";setCreateErr(null);setPaymentNotice(notice);return;}setCreatePaid(true);setCreateErr(null);emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:roomFullInfo.chainGameId,inviteCode:roomCode,wallet});setCreatePhase("paid_waiting");}catch(e){const msg=formatPaymentUiError(e?.message||"Payment failed");setCreateErr(msg);setPaymentErr(msg);}},[payForGame,roomFullInfo,roomCode,emit,wallet]);
  const beginCreateRoomCancel=()=>{createCancelPendingRef.current=true;createPhaseBeforeCancelRef.current=createPhaseRef.current;setCreateErr(null);setCreateHint("Cancelling room...");setRoomCountdown(null);setCreatePhase("dissolving");emit("room:dissolve",{inviteCode:roomCodeRef.current||roomCode});};
  const cancelCreate=()=>{beginCreateRoomCancel();};
  const dissolveRoom=()=>{beginCreateRoomCancel();};
  const clearExpired=()=>{setCreatePhase("select");setRoomCode("");setRoom({current:0,total:0,players:[]});setOpenRoom(null);setCreateErr(null);reloadHistory(wallet);};
  const copyCode=()=>{navigator.clipboard.writeText(roomCode);setCopied(true);setTimeout(()=>setCopied(false),2000);};

  // Join flow: confirm dialog (no payment), then join directly
  const submitJoin=()=>{if(isCreateBusy||isMatchBusy){setJoinErr("Finish or cancel current action first");return;}if(isJoinBusy){setJoinErr("Already in join flow");return;}if(!mockMode && (!wallet || !provider || !signer)){connect({type:"join-room",code:joinCode});return;}if(joinCode.length<6)return setJoinErr("Enter complete 6-digit code");setJoinErr(null);setJoinPhase("validating");if(joinTimeoutRef.current)clearTimeout(joinTimeoutRef.current);joinTimeoutRef.current=setTimeout(()=>{setJoinErr("Invalid room code or server not responding");setJoinPhase("select");},4000);emit("room:validate",{inviteCode:joinCode.toUpperCase()});};
  const confirmJoin=()=>{emit("room:join",{inviteCode:joinCode.toUpperCase()});setJoinPhase("joining");};
  const payJoin=useCallback(async()=>{try{setPaymentErr(null);setPaymentNotice(null);if(!roomFullInfo?.chainGameId||!roomFullInfo?.gameId||!wallet)throw new Error("Missing game id");const paymentResult=await payForGame(roomFullInfo.chainGameId);if(paymentResult?.approved&&!paymentResult?.paid){const notice="USDC approval confirmed. Tap `Pay 1 USDC` one more time to complete the entry.";setJoinErr(null);setPaymentNotice(notice);return;}setJoinPaid(true);setJoinErr(null);emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:roomFullInfo.chainGameId,inviteCode:roomFullInfo.inviteCode||joinCode,wallet});setJoinPhase("paid_waiting");}catch(e){const msg=formatPaymentUiError(e?.message||"Payment failed");setJoinErr(msg);setPaymentErr(msg);}},[joinCode,payForGame,emit,roomFullInfo,wallet]);
  const leaveRoom=()=>{emit("room:leave");if(joinPaid){refund(ENTRY_FEE);setJoinPaid(false);}setJoinPhase("select");setJoinExpiresAt(null);};

  // ===== QUICK MATCH =====
  useEffect(()=>{if(matchPhase!=="matching")return;setCd(15);const t=setInterval(()=>setCd(c=>{if(c<=1){clearInterval(t);return 0;}return c-1;}),1000);return()=>clearInterval(t);},[matchPhase]);

  useEffect(()=>{
    const u=[
      on("match:update",d=>{setMatchInfo({current:d.current});if(typeof d.remaining==="number")setCd(d.remaining);}),
      on("match:full",d=>{setMatchErr(null);setMatchInfo({current:d.current||d.total||matchTeamSizeRef.current});setMatchPhase("preparing");}),
      on("match:found",d=>{setPending(d);setPaymentProgress({paidCount:0,total:d.players?.length||0});setPaymentErr(null);setPaymentStartedAt(Date.now());if(mockMode){mockPay().then(()=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId,mode:"random",teamSize:d.teamSize||matchTeamSizeRef.current,players:d.players,phase:"predicting"});nav("/game");});}else setMatchPhase("payment");}),
      on("match:failed",()=>resetMatchState("No opponents found. Try again.")),
      on("match:error",d=>resetMatchState(d.message)),
      on("disconnect",()=>{
        if(matchPhaseRef.current==="matching"||matchPhaseRef.current==="preparing"){
          resetMatchState("Connection lost during matchmaking. Please try again.");
        }
      }),
    ];
    return()=>u.forEach(f=>f());
  },[on,mockMode,mockPay,updateGame,nav,resetMatchState]);

  useEffect(()=>{
    if(matchPhase!=="matching"||cd!==0)return;
    const timer=setTimeout(()=>{
      if(matchPhaseRef.current==="matching"){
        resetMatchState("No opponents found. Try again.",{cancelQueue:true});
      }
    },1200);
    return()=>clearTimeout(timer);
  },[matchPhase,cd,resetMatchState]);

  const startMatch=()=>{if(isCreateBusy||isJoinBusy){setMatchErr("Finish or cancel current action first");return;}if(isMatchBusy){setMatchErr("Already matching");return;}if(!mockMode && (!wallet || !provider || !signer)){connect({type:"random-match"});return;}setPending(null);setMatchErr(null);setMatchPhase("matching");setMatchInfo({current:1});emit("match:join",{teamSize:matchTeamSize});};
  const cancelMatch=()=>resetMatchState(null,{cancelQueue:true});
  const payMatch=useCallback(async()=>{if(!pending)return;try{setPaymentErr(null);setPaymentNotice(null);if(!pending.gameId||!pending.chainGameId||!wallet)throw new Error("Missing game id");const paymentResult=await payForGame(pending.chainGameId);if(paymentResult?.approved&&!paymentResult?.paid){setMatchErr(null);setPaymentNotice("USDC approval confirmed. Tap `Pay 1 USDC` one more time to complete the entry.");return;}emit("room:payment:confirm",{gameId:pending.gameId,chainGameId:pending.chainGameId,wallet});setMatchPhase("paid_waiting");}catch(e){const msg=formatPaymentUiError(e?.message||"Payment failed");setMatchErr(msg);setPaymentErr(msg);setMatchPhase("select");}},[pending,payForGame,emit,wallet]);
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
  const isRoomPaymentPhase=(createPhase==="payment")||(joinPhase==="payment");
  const isRoomPaidWaiting=(createPhase==="paid_waiting")||(joinPhase==="paid_waiting");
  const isMatchPreparing=matchPhase==="preparing";
  const isMatchPaymentPhase=matchPhase==="payment";
  const isMatchPaidWaiting=matchPhase==="paid_waiting";
  const isWaitingPaymentPhase=isRoomPaidWaiting||isMatchPaidWaiting;
  const showPayment=isRoomPaymentPhase||isWaitingPaymentPhase||isMatchPreparing||isMatchPaymentPhase;
  const paymentModalMode=isWaitingPaymentPhase?"waiting":isMatchPreparing?"preparing":"confirm";
  const preparingMatchTotal=matchInfo.current||matchTeamSize;
  const onPayConfirm=createPhase==="payment"?payCreate:joinPhase==="payment"?payJoin:payMatch;
  const onPayCancel=()=>{
    if(createPhase==="payment")cancelCreate();
    else if(joinPhase==="payment")leaveRoom();
    else{setMatchPhase("select");setPending(null);}
    setPaymentNotice(null);
    setPaymentErr(null);
  };

  useEffect(()=>{
    if(paymentCountdown!==0)return;
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
      if(paymentStillOpen)handleRoomPaymentFailure("Payment timeout — team disbanded");
    },1200);
    return()=>clearTimeout(timer);
  },[paymentCountdown,handleRoomPaymentFailure]);

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
  const SizeSelector=({selectedSize,onSelect,onAction,actionLabel,disabled})=>(
    <div>
      <p className="text-white/30 text-[11px] mb-3 font-medium">Team Size</p>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {TEAM_SIZES.map(s=>(
          <button key={s} onClick={()=>onSelect(s)} disabled={disabled}
            className={`py-3 rounded-xl font-black text-base transition-all
              ${selectedSize===s
                ?"bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/20 -translate-y-0.5"
                :"bg-white/[0.03] border border-white/[0.06] text-white/20 hover:bg-white/[0.06] hover:text-white/40"}
              ${disabled?"!opacity-30 cursor-not-allowed":""}`}
          >{s}P</button>
        ))}
      </div>
      <button onClick={onAction} disabled={disabled} className={`btn-primary w-full py-3 font-bold text-sm ${disabled?"!opacity-30 cursor-not-allowed":""}`}>{actionLabel}</button>
    </div>
  );

  // Format countdown as mm:ss
  const fmtCountdown=(s)=>{if(s===null||s===undefined)return"";return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
  const createRoomTotal=room.total||createTeamSize;

  return(
    <div className="max-w-5xl mx-auto px-6 py-8 min-h-screen">

      {/* Top section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
            Choose Your <span className="text-gradient">Battle Mode</span>
          </h1>
          <p className="text-white/50 text-sm leading-relaxed max-w-lg">
            Predict BTC price direction, beat your opponent, settle on-chain in 30 seconds. Entry: {ENTRY_FEE} USDC per round.
          </p>
          {mockMode&&<div className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/15 rounded-full px-3 py-1 mt-3">
            <span className="text-amber-400/80 text-[10px] font-bold">DEMO MODE · Virtual Balance · Zero Risk</span>
          </div>}
          {!wallet&&!mockMode&&<p className="text-white/30 text-xs mt-3">
            {window.ethereum?"Connect wallet to start playing":"No wallet detected — demo mode available"}
          </p>}
        </div>
        <div className="card glow-orange flex flex-col items-center justify-center">
          <BtcTicker price={price} size="lg" label="BTC / USD Live"/>
          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
            <span className="text-white/30 text-[9px] uppercase tracking-[0.2em]">Live Market</span>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {stats&&(stats.wins>0||stats.losses>0)&&<div className="grid grid-cols-3 gap-3 mb-6">
        <div className="stat-card"><p className="text-[10px] text-white/35 uppercase tracking-wider">Wins</p><p className="text-xl font-black text-emerald-400">{stats.wins}</p></div>
        <div className="stat-card"><p className="text-[10px] text-white/35 uppercase tracking-wider">Losses</p><p className="text-xl font-black text-rose-400">{stats.losses}</p></div>
        <div className="stat-card"><p className="text-[10px] text-white/35 uppercase tracking-wider">Profit</p><p className={`text-xl font-black ${parseFloat(stats.total_earned)-parseFloat(stats.total_lost)>=0?"text-emerald-400":"text-rose-400"}`}>{(parseFloat(stats.total_earned)-parseFloat(stats.total_lost)).toFixed(2)}</p></div>
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
                ?"border-amber-500/25 bg-gradient-to-br from-amber-500/[0.08] to-orange-500/[0.06] shadow-lg shadow-amber-500/[0.05]"
                :"border-white/[0.06] bg-white/[0.02] opacity-70 hover:opacity-90"}`}
              onClick={()=>{if(activeCard!==0){setActiveCard(0);setMode("create");}}}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-xl">🏟️</div>
                <div>
                  <h3 className="text-sm font-bold">Create Room</h3>
                  <p className="text-[10px] text-white/30">Invite friends to battle</p>
                </div>
              </div>

              {createErr&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-lg mb-3 text-[10px]">⚠️ {createErr}</div>}
              {createHint&&<div className="bg-white/[0.03] border border-white/[0.06] text-white/45 px-3 py-2 rounded-lg mb-3 text-[10px]">{createHint}</div>}

              {createPhase==="select"&& !openRoom&&(
                <SizeSelector selectedSize={createTeamSize} onSelect={setCreateTeamSize} onAction={createRoom} actionLabel={`Create Arena · ${createTeamSize}P`} disabled={isJoinBusy||isMatchBusy}/>
              )}
              {createPhase==="creating"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-orange-400/30 border-t-orange-400 animate-spin mb-3"/><p className="text-white/40 text-xs">Creating arena...</p></div>)}
              {createPhase==="dissolving"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin mb-3"/><p className="text-white/40 text-xs">Cancelling room...</p></div>)}
              {(createPhase==="waiting"||createPhase==="paid_waiting")&&(
                <div className="text-center">
                  <p className="text-white/20 text-[8px] uppercase tracking-[0.3em] mb-2">Arena Code</p>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 mb-3">
                    <span className="text-2xl font-mono font-black tracking-[0.4em] text-gradient">{roomCode}</span>
                  </div>
                  <button onClick={copyCode} className={`text-[9px] px-3 py-1 rounded-full transition mb-3 ${copied?"bg-emerald-500/15 text-emerald-400":"bg-white/[0.04] text-white/25 hover:text-white/40"}`}>
                    {copied?"✓ Copied":"📋 Copy Code"}
                  </button>
                  <TeamSlots total={createRoomTotal} players={room.players} current={room.current}/>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"/>
                    <span className="text-white/30 font-mono">{createPaid && paymentProgress.total ? `${paymentProgress.paidCount}/${paymentProgress.total} paid` : `${room.current}/${createRoomTotal} ready`}</span>
                  </div>
                  {/* Room expiry countdown — only when not full */}
                  {roomCountdown!==null&&roomCountdown>0&&room.current<createRoomTotal&&(
                    <div className={`mt-2 flex items-center justify-center gap-1.5 ${roomCountdown<=30?"text-rose-400":"text-amber-400"}`}>
                      <span className="text-sm">⏱️</span>
                      <span className="text-sm font-mono font-bold">{fmtCountdown(roomCountdown)}</span>
                      <span className="text-[9px] text-white/25 ml-1">remaining</span>
                    </div>
                  )}
                  {/* Payment countdown (after full, 60s) */}
                  {paymentCountdown!==null&&paymentCountdown>0&&createPhase==="paid_waiting"&&(
                    <div className={`mt-2 flex items-center justify-center gap-1.5 ${paymentCountdown<=10?"text-rose-400":"text-amber-400"}`}>
                      <span className="text-sm">💰</span>
                      <span className="text-sm font-mono font-bold">{paymentCountdown}s</span>
                      <span className="text-[9px] text-white/25 ml-1">payment countdown</span>
                    </div>
                  )}
                  <button onClick={dissolveRoom} className="mt-3 w-full py-2 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-rose-500/[0.06] hover:text-rose-400 transition text-[10px] text-white/20">Cancel</button>
                </div>
              )}
              {/* Expired state — highlighted Expired button */}
              {createPhase==="expired"&&(
                <div className="text-center">
                  <p className="text-white/20 text-[8px] uppercase tracking-[0.3em] mb-2">Arena Code</p>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 mb-3">
                    <span className="text-2xl font-mono font-black tracking-[0.4em] text-white/15 line-through">{roomCode}</span>
                  </div>
                  <p className="text-rose-400 text-xs mb-3">Room expired — team not filled in time</p>
                  <button onClick={clearExpired} className="w-full py-2.5 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 text-white font-bold text-sm shadow-lg shadow-rose-500/20 hover:shadow-rose-500/30 transition">
                    Expired
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Join Room */}
          <div className="flex-shrink-0 w-[calc(50%-8px)] min-w-[280px]">
            <div className={`rounded-2xl border p-5 h-full transition-all duration-300
              ${activeCard===1
                ?"border-amber-500/25 bg-gradient-to-br from-amber-500/[0.08] to-orange-500/[0.06] shadow-lg shadow-amber-500/[0.05]"
                :"border-white/[0.06] bg-white/[0.02] opacity-70 hover:opacity-90"}`}
              onClick={()=>{if(activeCard!==1){setActiveCard(1);setMode("join");}}}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-xl">🎯</div>
                <div>
                  <h3 className="text-sm font-bold">Join Room</h3>
                  <p className="text-[10px] text-white/30">Enter code to join a battle</p>
                </div>
              </div>

              {joinErr&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-lg mb-3 text-[10px]">⚠️ {joinErr}</div>}

              {joinPhase==="validating"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-orange-400/30 border-t-orange-400 animate-spin mb-3"/><p className="text-white/40 text-xs">Validating code...</p></div>)}
              {joinPhase==="joining"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-orange-400/30 border-t-orange-400 animate-spin mb-3"/><p className="text-white/40 text-xs">Joining arena...</p></div>)}
              {joinPhase==="select"&&(
                <div>
                  <p className="text-white/30 text-[11px] mb-3 font-medium">Arena Code</p>
                  <input type="text" value={joinCode}
                    onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}
                    placeholder="6-digit code"
                    maxLength={6}
                    disabled={joinEntryDisabled}
                    className={`w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-center text-xl font-mono font-black tracking-[0.4em] text-orange-400 placeholder:text-white/[0.08] placeholder:tracking-normal placeholder:text-xs placeholder:font-normal transition mb-3 ${joinEntryDisabled?"cursor-not-allowed opacity-40":"focus:outline-none focus:border-orange-500/25"}`}
                  />
                  {joinBlockedMsg&&<p className="text-[10px] text-white/25 mb-3">{joinBlockedMsg}</p>}
                  <button onClick={submitJoin} disabled={joinCode.length<6||joinEntryDisabled} className="btn-primary w-full py-3 font-bold text-sm disabled:!opacity-15">Join Arena</button>
                </div>
              )}
              {/* Confirm dialog: no payment, just confirm joining */}
              {joinPhase==="confirm"&&(
                <div className="text-center">
                  <p className="text-white/40 text-xs mb-3">Join arena with code</p>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 mb-4">
                    <span className="text-xl font-mono font-black tracking-[0.4em] text-gradient">{joinCode}</span>
                  </div>
                  <p className="text-white/25 text-[10px] mb-4">{joinValidInfo?`${joinValidInfo.current}/${joinValidInfo.total} players in room`:""}</p>
                  <div className="flex gap-2">
                    <button onClick={()=>{setJoinPhase("select");setJoinValidInfo(null);}} className="flex-1 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] text-white/30 text-xs transition">Cancel</button>
                    <button onClick={confirmJoin} className="flex-1 btn-primary !py-2.5 !text-sm font-bold">Join</button>
                  </div>
                </div>
              )}
              {(joinPhase==="waiting"||joinPhase==="paid_waiting")&&(
                <div className="text-center">
                  <p className="text-white/20 text-[8px] uppercase tracking-[0.3em] mb-2">Joined Arena</p>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 mb-3">
                    <span className="text-xl font-mono font-black tracking-[0.4em] text-gradient">{joinCode}</span>
                  </div>
                  <TeamSlots total={joinRoom.total} players={joinRoom.players}/>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"/>
                    <span className="text-white/30 font-mono">{joinPaid && paymentProgress.total ? `${paymentProgress.paidCount}/${paymentProgress.total} paid` : `${joinRoom.current}/${joinRoom.total} waiting`}</span>
                  </div>
                  {/* Join room expiry countdown */}
                  {joinCountdown!==null&&joinCountdown>0&&joinRoom.current<joinRoom.total&&(
                    <div className={`mt-2 flex items-center justify-center gap-1.5 ${joinCountdown<=30?"text-rose-400":"text-amber-400"}`}>
                      <span className="text-sm">⏱️</span>
                      <span className="text-sm font-mono font-bold">{fmtCountdown(joinCountdown)}</span>
                      <span className="text-[9px] text-white/25 ml-1">remaining</span>
                    </div>
                  )}
                  {/* Payment countdown (after full, 60s) */}
                  {paymentCountdown!==null&&paymentCountdown>0&&joinPhase==="paid_waiting"&&(
                    <div className={`mt-2 flex items-center justify-center gap-1.5 ${paymentCountdown<=10?"text-rose-400":"text-amber-400"}`}>
                      <span className="text-sm">💰</span>
                      <span className="text-sm font-mono font-bold">{paymentCountdown}s</span>
                      <span className="text-[9px] text-white/25 ml-1">payment countdown</span>
                    </div>
                  )}
                  <button onClick={leaveRoom} className="mt-3 w-full py-2 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-rose-500/[0.06] hover:text-rose-400 transition text-[10px] text-white/20">Leave</button>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Quick Match */}
          <div className="flex-shrink-0 w-[calc(50%-8px)] min-w-[280px]">
            <div className={`rounded-2xl border p-5 h-full transition-all duration-300
              ${activeCard===2
                ?"border-amber-500/25 bg-gradient-to-br from-amber-500/[0.08] to-orange-500/[0.06] shadow-lg shadow-amber-500/[0.05]"
                :"border-white/[0.06] bg-white/[0.02] opacity-70 hover:opacity-90"}`}
              onClick={()=>activeCard!==2&&goCard(2)}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-xl">⚔️</div>
                <div>
                  <h3 className="text-sm font-bold">Quick Match</h3>
                  <p className="text-[10px] text-white/30">Auto-match in 15 seconds</p>
                </div>
              </div>

              {matchErr&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-lg mb-3 text-[10px]">⚠️ {matchErr}</div>}

              {matchPhase==="select"&&(
                <SizeSelector selectedSize={matchTeamSize} onSelect={setMatchTeamSize} onAction={startMatch} actionLabel={`Find Match · ${matchTeamSize}P`} disabled={isCreateBusy||isJoinBusy}/>
              )}
              {matchPhase==="matching"&&(
                <div>
                  <MatchAnimation teamSize={matchTeamSize} current={matchInfo.current} countdown={cd} status="matching"/>
                  <button onClick={cancelMatch} className="w-full mt-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition text-[10px] text-white/20">Cancel</button>
                </div>
              )}
              {matchPhase==="preparing"&&(
                <div>
                  <MatchAnimation teamSize={matchTeamSize} current={matchTeamSize} status="preparing"/>
                  <p className="mt-3 text-center text-[10px] text-white/25">Players are locked in. Preparing the payment step now.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dot indicators + swipe hint */}
        <div className="flex items-center justify-center gap-3 mt-4">
          {activeCard>0&&<span className="text-white/15 text-[10px] mr-1">← swipe</span>}
          {CARDS.map((_,i)=>(
            <button key={i} onClick={()=>{goCard(i);if(i>=2)scrollToCard(1);else scrollToCard(0);}}
              className={`rounded-full transition-all duration-300
                ${activeCard===i?"w-6 h-2 bg-gradient-to-r from-amber-500 to-orange-500":"w-2 h-2 bg-white/15 hover:bg-white/25"}`}
            />
          ))}
          {activeCard<2&&<span className="text-white/15 text-[10px] ml-1">swipe →</span>}
        </div>
      </div>

      {/* Payment modal — shown when room is full (both creator and joiner) or quick match */}
      <PaymentModal
        visible={showPayment}
        onConfirm={onPayConfirm}
        onCancel={onPayCancel}
        loading={loading}
        mode={paymentModalMode}
        title={isWaitingPaymentPhase
          ?"Payment Confirmed"
          :isMatchPreparing
            ?"Match Found"
          :isRoomPaymentPhase
            ?"Room Full — Pay to Start"
            :"Enter Match"}
        subtitle={isWaitingPaymentPhase
          ?`Your entry is confirmed. Waiting for the remaining players to pay before the prediction begins automatically.`
          :isMatchPreparing
            ?`All ${preparingMatchTotal} players are ready. We're preparing the payment step now.`
          :isRoomPaymentPhase
            ?`All ${paymentProgress.total} players joined! Pay 1 USDC within ${paymentCountdown||PAYMENT_TIMEOUT}s to start the prediction.`
            :"Pay entry fee to enter this match"}
        actionLabel="Pay 1 USDC"
        amount="1 USDC"
        error={paymentErr}
        notice={paymentNotice}
        hint={isWaitingPaymentPhase
          ?`You have already paid. The match will start as soon as all ${paymentProgress.total||0} players confirm.${shouldUseMockPayment?" Local mock payment enabled.":""}`
          :isMatchPreparing
            ?"Creating the on-chain match now. This dialog will switch to `Pay 1 USDC` automatically as soon as setup finishes."
          :isRoomPaymentPhase
            ?`${paymentProgress.paidCount}/${paymentProgress.total} paid${shouldUseMockPayment?" · local mock payment enabled":""}`
            :shouldUseMockPayment
              ?"Local mock payment enabled for this environment."
              :"You'll confirm this payment in your wallet."}
        countdown={(isRoomPaymentPhase||isWaitingPaymentPhase||isMatchPaymentPhase)?paymentCountdown:null}
        countdownLabel={(isRoomPaymentPhase||isWaitingPaymentPhase||isMatchPaymentPhase)?"Match starts automatically once everyone pays before the timer expires.":null}
        paidCount={paymentProgress.paidCount}
        totalCount={isMatchPreparing?preparingMatchTotal:paymentProgress.total}
      />

      {/* Bottom row */}
      <div className="card !p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">History</h3>
          <div className="flex gap-1">
            {[["all","All"],["create","Create"],["join","Join"],["random","Random"]].map(([k,l])=><button key={k} onClick={()=>setHistoryFilter(k)} className={`px-2 py-1 rounded-lg text-[10px] ${historyFilter===k?"bg-amber-500/15 text-amber-300 border border-amber-500/20":"bg-white/[0.03] text-white/25 border border-white/[0.04]"}`}>{l}</button>)}
          </div>
        </div>
        {!wallet ? (
          <p className="text-white/20 text-xs">Connect wallet to view history</p>
        ) : history.length===0 ? (
          <p className="text-white/20 text-xs">No battle history yet</p>
        ) : (()=>{
          const filtered = history.filter(g=>historyFilter==="all"?true:historyFilter==="create"?(g.mode==="room"&&g.is_owner):historyFilter==="join"?(g.mode==="room"&&!g.is_owner):g.mode==="random");
          const pageSize = 6;
          const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
          const page = Math.min(historyPage, totalPages);
          const pageItems = filtered.slice((page-1)*pageSize, page*pageSize);
          return <div className="space-y-2">
            {pageItems.map(g=>{
              const isRoom = g.mode === "room";
              const title = isRoom ? (g.is_owner ? "Create Room" : "Join Room") : "Random Match";
              const result = getHistoryResult(g);
              const time = new Date(g.settled_at || g.failed_at || g.started_at || g.created_at).toLocaleString();
              const canClaim = !!g.claimable;
              const isClaiming = claimingHistoryId === g.id && claiming;
              const isClaimed = !!g.claimed;
              const actionLabel = g.claimLabel || "Claim";
              const claimedLabel = g.claimedLabel || "Claimed";
              return (
                <div key={g.id} className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-none">{title}</p>
                      <p className="text-[10px] text-white/25 mt-1">{time}</p>
                    </div>
                    <div className="flex-1 text-center min-w-0 px-2">
                      <p className="text-[10px] text-white/30">Arena Code</p>
                      <p className="text-[11px] font-mono text-amber-300 truncate">{isRoom && g.invite_code ? g.invite_code : "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-white/35">{g.max_players}P</p>
                      <p className={`text-xs font-bold mt-1 ${getHistoryResultClass(result)}`}>{result}</p>
                    </div>
                  </div>
                  {g.error_message&&g.state==="failed"&&(
                    <p className="mt-2 text-[10px] text-amber-200/80 leading-relaxed">{g.error_message}</p>
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
                      {isClaiming ? "Claiming..." : isClaimed ? claimedLabel : actionLabel}
                    </button>
                  </div>}
                </div>
              );
            })}
            {totalPages > 1 && <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={()=>setHistoryPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-2 py-1 rounded-lg text-[10px] bg-white/[0.03] border border-white/[0.04] text-white/35 disabled:opacity-30">Prev</button>
              <span className="text-[10px] text-white/35">{page} / {totalPages}</span>
              <button onClick={()=>setHistoryPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-2 py-1 rounded-lg text-[10px] bg-white/[0.03] border border-white/[0.04] text-white/35 disabled:opacity-30">Next</button>
            </div>}
          </div>;
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card !p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">Quick Rules</h3>
            <button onClick={()=>nav("/how-to-play")} className="text-[10px] text-orange-400/60 hover:text-orange-400 transition font-semibold">Learn more →</button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-white/45">
            <div className="bg-white/[0.02] rounded-lg px-3 py-2.5 flex items-center gap-2"><span>💰</span>{ENTRY_FEE} USDC entry</div>
            <div className="bg-white/[0.02] rounded-lg px-3 py-2.5 flex items-center gap-2"><span>⏱️</span>30s to predict</div>
            <div className="bg-white/[0.02] rounded-lg px-3 py-2.5 flex items-center gap-2"><span>📊</span>30s settlement</div>
            <div className="bg-white/[0.02] rounded-lg px-3 py-2.5 flex items-center gap-2"><span>🏆</span>Winner takes all</div>
          </div>
        </div>
        <div className="card !p-4">
          <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">Recent Battles</h3>
          {history.length>0
            ?<div className="space-y-2">{history.map((g,i)=>{
              const dir=parseFloat(g.settlement_price)>parseFloat(g.base_price)?"up":"down";
              const isRefund=g.claimAction==="refund"||g.claimedLabel==="Refunded";
              const won=g.is_correct===true;
              const lost=g.is_correct===false;
              const failed=g.state==="failed"&&!isRefund&&!won&&!lost;
              const canClaim=!!g.claimable;
              const isClaiming=claimingHistoryId===g.id&&claiming;
              const isClaimed=!!g.claimed;
              const actionLabel=g.claimLabel||"Claim";
              const claimedLabel=g.claimedLabel||"Claimed";
              const payoutValue=Number(g.reward||0);
              const payoutText=payoutValue>0?`+${payoutValue.toFixed(2)}`:isRefund?"+0.00":failed?"Pending":"-1.00";
              const rowClass=isRefund
                ?"bg-amber-500/[0.06] border border-amber-500/[0.08]"
                :won
                  ?"bg-emerald-500/[0.06] border border-emerald-500/[0.08]"
                  :lost
                    ?"bg-rose-500/[0.06] border border-rose-500/[0.08]"
                    :failed
                      ?"bg-amber-500/[0.06] border border-amber-500/[0.08]"
                      :"bg-white/[0.03] border border-white/[0.05]";
              const icon=isRefund?"↩️":won?"🏆":lost?"💀":failed?"⚠️":"⏳";
              const tone=isRefund?"text-amber-300":won?"text-emerald-400":lost?"text-rose-400":failed?"text-amber-300":"text-white/35";
              return<div key={i} className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${rowClass}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{icon}</span>
                  <div><p className="text-[11px] font-mono text-white/50">#{g.id} · {g.mode==="random"?"Quick":"Room"} · {g.max_players}P</p>
                  <p className="text-[10px] text-white/30">{isRefund?"Emergency refund path unlocked":failed?(g.error_message||"Settlement interrupted"):(g.prediction==="up"?"LONG":g.prediction==="down"?"SHORT":"Awaiting outcome")}{isRefund||failed||!g.settlement_price||!g.base_price?"":` → BTC ${dir==="up"?"📈":"📉"}`}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold ${tone}`}>{payoutText}</span>
                  {(canClaim||isClaimed||isClaiming)&&<button
                    onClick={()=>claimHistoryReward(g)}
                    disabled={!canClaim||isClaiming}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                      isClaimed
                        ?"bg-emerald-500/10 border border-emerald-500/15 text-emerald-300 cursor-default"
                        : canClaim
                          ?"bg-gradient-to-r from-emerald-500 to-teal-500 text-white disabled:opacity-60"
                          :"bg-white/[0.03] border border-white/[0.05] text-white/35 cursor-default"
                    }`}
                  >
                    {isClaiming?"Claiming...":isClaimed?claimedLabel:actionLabel}
                  </button>}
                </div>
              </div>;
            })}</div>
            :<div className="flex flex-col items-center justify-center py-6 text-center">
              <span className="text-2xl mb-2 opacity-30">⚔️</span>
              <p className="text-white/25 text-xs">No battles yet</p>
              <p className="text-white/15 text-[10px] mt-0.5">Start a match to see your history</p>
            </div>
          }
        </div>
      </div>

      <p className="text-center text-white/10 text-[10px] mt-6 mb-2">Built on Base · USDC Settlements</p>
    </div>
  );
}
