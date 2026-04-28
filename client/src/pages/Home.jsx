import{useState,useEffect,useCallback,useRef}from"react";
import{createPortal}from"react-dom";
import{useNavigate}from"react-router-dom";
import{useWallet}from"../context/WalletContext";
import{useSocket}from"../hooks/useSocket";
import{SERVER_URL}from"../config/constants";
import{useGame}from"../context/GameContext";
import{useContract}from"../hooks/useContract";
import{useBtcPrice}from"../hooks/useBtcPrice";
import{BtcTicker,TeamSlots,MatchAnimation,PaymentModal,RoomTransition}from"../components";
import{ENTRY_FEE,TEAM_SIZES,PAYMENT_TIMEOUT}from"../config/constants";
import{useT}from"../context/LangContext";
import{Trophy,XCircle,TrendingUp}from"lucide-react";
import{clearQuickMatchSession,readQuickMatchSession,writeQuickMatchSession}from"../utils/quickMatchSession";

const EMPTY_STATS={wins:0,losses:0,total_earned:0,total_lost:0};

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
  if(result==="Failed")return"text-fuchsia-300";
  if(result==="Expired")return"text-fuchsia-300";
  if(result==="Cancelled")return"text-white/30";
  if(result==="Waiting")return"text-fuchsia-300";
  if(result==="Playing")return"text-sky-300";
  if(result==="Refund Ready"||result==="Refunded")return"text-fuchsia-300";
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
                ?"border border-fuchsia-400/30 bg-gradient-to-br from-[#6a2147] via-[#8f3f72] to-[#c04bd3] text-white shadow-[0_0_24px_rgba(236,72,153,0.18)] -translate-y-0.5"
                :"bg-white/[0.03] border border-white/[0.06] text-white/20 hover:bg-white/[0.06] hover:text-white/40"}
              ${disabled?"!opacity-30 cursor-not-allowed":""}`}
          >{s}P</button>
        ))}
      </div>
      <button onClick={onAction} disabled={disabled} className={`dashboard-primary-btn w-full py-3 font-bold text-sm ${disabled?"!opacity-30 cursor-not-allowed":""}`}>{actionLabel}</button>
    </div>
  );
}

function RoomGlyph({ className = "w-5 h-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8.5 12 4l8 4.5v8L12 20l-8-3.5v-8Z" />
      <path d="M12 4v16" />
      <path d="M4 8.5 12 13l8-4.5" />
    </svg>
  );
}

function JoinGlyph({ className = "w-5 h-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
      <path d="M5 19c1.5-3.1 4-4.8 7-4.8s5.5 1.7 7 4.8" />
      <path d="M18 8h3" />
      <path d="M19.5 6.5v3" />
    </svg>
  );
}

function MatchGlyph({ className = "w-5 h-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 6h4l2 3-2 3H7l-2-3 2-3Z" />
      <path d="M17 12h-4l-2 3 2 3h4l2-3-2-3Z" />
      <path d="M11 9h2" />
      <path d="M11 15h2" />
    </svg>
  );
}

function TeamSizeGrid({ selectedSize, onSelect, disabled }) {
  const t = useT();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-5">
      {TEAM_SIZES.map((size) => (
        <button
          key={size}
          type="button"
          onClick={() => onSelect(size)}
          disabled={disabled}
          className={`rounded-[18px] min-h-[68px] sm:min-h-[76px] px-3 py-2.5 border transition-all text-left ${
            selectedSize === size
              ? "border-fuchsia-400/34 bg-gradient-to-br from-[#59203f]/90 via-[#7a2f59]/88 to-[#ae47be]/82 shadow-[0_0_28px_rgba(236,72,153,0.14)] -translate-y-0.5"
              : "border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.05] hover:border-white/[0.12]"
            } ${disabled ? "!opacity-30 cursor-not-allowed" : ""}`}
        >
          <div className="text-[7px] uppercase tracking-[0.16em] text-white/34 mb-1">{t("home.teamLabel")}</div>
          <div className="text-[1.25rem] sm:text-[1.4rem] font-black leading-none text-white">{size}P</div>
        </button>
      ))}
    </div>
  );
}

function CreateRoomSelectorCard({ selectedSize, onSelect, onAction, disabled, blockedMsg }) {
  const t = useT();

  return (
    <>
      <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/28 mb-2">
        {t("home.card.create.kicker")}
      </div>
      <div className="text-white text-[1.3rem] sm:text-[1.55rem] font-black leading-[1.08] mb-2">
        {t("home.card.create.title")}
      </div>
      <p className="max-w-2xl text-[12px] sm:text-[13px] text-white/48 leading-6 mb-5">
        {t("home.card.create.selectorDesc")}
      </p>
      {blockedMsg && <p className="text-[10px] text-white/25 -mt-2 mb-4">{blockedMsg}</p>}

      <div className="flex items-center gap-2 mb-3.5">
        <p className="text-white/32 text-[10px] font-medium uppercase tracking-[0.18em]">{t("home.teamSize")}</p>
        <PayoutInfo />
      </div>

      <TeamSizeGrid selectedSize={selectedSize} onSelect={onSelect} disabled={disabled} />

      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className={`dashboard-primary-btn w-full !py-3.5 !text-[15px] ${disabled ? "!opacity-30 cursor-not-allowed" : ""}`}
      >
        {t("home.card.create.cta")}
      </button>
    </>
  );
}

function JoinRoomSelectorCard({ value, onChange, onSubmit, disabled, blockedMsg }) {
  const t = useT();

  return (
    <>
      <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/28 mb-2">
        {t("home.card.join.kicker")}
      </div>
      <div className="text-white text-[1.3rem] sm:text-[1.55rem] font-black leading-[1.08] mb-2">
        {t("home.card.join.title")}
      </div>
      <p className="max-w-2xl text-[12px] sm:text-[13px] text-white/48 leading-6 mb-5">
        {t("home.card.join.selectorDesc")}
      </p>

      <div className="text-white/32 text-[10px] font-medium uppercase tracking-[0.18em] mb-3.5">
        {t("home.arenaCode")}
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        placeholder={t("home.codePlaceholder")}
        maxLength={6}
        disabled={disabled}
        className={`w-full min-h-[68px] sm:min-h-[76px] rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center text-[1.45rem] font-mono font-black tracking-[0.4em] text-fuchsia-300 placeholder:text-white/[0.12] placeholder:tracking-normal placeholder:text-xs placeholder:font-normal transition mb-5 ${disabled ? "cursor-not-allowed opacity-40" : "focus:outline-none focus:border-fuchsia-500/30 focus:bg-white/[0.04]"}`}
      />
      {blockedMsg && <p className="text-[10px] text-white/25 -mt-2 mb-4">{blockedMsg}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={value.length < 6 || disabled}
        className="dashboard-primary-btn w-full !py-3.5 !text-[15px] disabled:!opacity-30"
      >
        {t("home.card.join.cta")}
      </button>
    </>
  );
}

function QuickMatchSelectorCard({ selectedSize, onSelect, onAction, disabled, blockedMsg }) {
  const t = useT();

  return (
    <>
      <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/28 mb-2">
        {t("home.card.match.kicker")}
      </div>
      <div className="text-white text-[1.3rem] sm:text-[1.55rem] font-black leading-[1.08] mb-2">
        {t("home.card.match.title")}
      </div>
      <p className="max-w-2xl text-[12px] sm:text-[13px] text-white/48 leading-6 mb-5">
        {t("home.card.match.selectorDesc")}
      </p>
      {blockedMsg && <p className="text-[10px] text-white/25 -mt-2 mb-4">{blockedMsg}</p>}

      <div className="flex items-center gap-2 mb-3.5">
        <p className="text-white/32 text-[10px] font-medium uppercase tracking-[0.18em]">{t("home.teamSize")}</p>
        <PayoutInfo />
      </div>

      <TeamSizeGrid selectedSize={selectedSize} onSelect={onSelect} disabled={disabled} />

      <button
        type="button"
        disabled
        className="dashboard-primary-btn w-full !py-3.5 !text-[15px] !opacity-30 cursor-not-allowed"
      >
        Coming Soon
      </button>
    </>
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
  const titlePre=t("home.hero.title.pre");
  const titleHighlight=t("home.hero.title.highlight");
  const titleFull=`${titlePre} ${titleHighlight}`;

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
  const[stats,setStats]=useState(EMPTY_STATS);
  const[claimingHistoryId,setClaimingHistoryId]=useState(null);
  const[createTransitioning,setCreateTransitioning]=useState(false);
  const[joinTransitioning,setJoinTransitioning]=useState(false);
  const[visibleTitleLength,setVisibleTitleLength]=useState(()=>Math.min(2,titleFull.length));
  const titleTypingTimerRef=useRef(null);

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
  const[suppressRestoredPaymentModal,setSuppressRestoredPaymentModal]=useState(false);
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

  const visibleTitle=titleFull.slice(0,visibleTitleLength);
  const typedTitlePre=visibleTitle.slice(0,Math.min(visibleTitle.length,titlePre.length));
  const showTitleGap=visibleTitle.length>titlePre.length;
  const typedTitleHighlight=visibleTitle.length>titlePre.length+1?visibleTitle.slice(titlePre.length+1):"";

  useEffect(()=>{
    setVisibleTitleLength(Math.min(2,titleFull.length));
    if(titleTypingTimerRef.current){
      clearInterval(titleTypingTimerRef.current);
      titleTypingTimerRef.current=null;
    }
    if(titleFull.length<=2)return;
    titleTypingTimerRef.current=window.setInterval(()=>{
      setVisibleTitleLength((prev)=>{
        const next=Math.min(prev+2,titleFull.length);
        if(next>=titleFull.length&&titleTypingTimerRef.current){
          clearInterval(titleTypingTimerRef.current);
          titleTypingTimerRef.current=null;
        }
        return next;
      });
    },150);
    return()=>{
      if(titleTypingTimerRef.current){
        clearInterval(titleTypingTimerRef.current);
        titleTypingTimerRef.current=null;
      }
    };
  },[titleFull]);
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
  const joinValidInfoRef=useRef(joinValidInfo); joinValidInfoRef.current=joinValidInfo;
  const walletRef=useRef(wallet); walletRef.current=wallet;
  const roomRef=useRef(room); roomRef.current=room;
  const joinRoomRef=useRef(joinRoom); joinRoomRef.current=joinRoom;
  const matchInfoRef=useRef(matchInfo); matchInfoRef.current=matchInfo;
  const pendingRef=useRef(pending); pendingRef.current=pending;
  const createTeamSizeRef=useRef(createTeamSize); createTeamSizeRef.current=createTeamSize;
  const matchTeamSizeRef=useRef(matchTeamSize); matchTeamSizeRef.current=matchTeamSize;
  const roomCodeRef=useRef(roomCode); roomCodeRef.current=roomCode;
  const createCancelPendingRef=useRef(false);
  const createPhaseBeforeCancelRef=useRef("select");
  const paymentResumeRequestAtRef=useRef(0);
  const paymentStartedAtRef=useRef(null);
  const paymentFailureDialogRef=useRef(null);
  const pendingCreatedRoomRef=useRef(null);
  const createTransitionDoneRef=useRef(false);
  const createTransitioningRef=useRef(false); createTransitioningRef.current=createTransitioning;
  const pendingJoinedRoomRef=useRef(null);
  const joinTransitionDoneRef=useRef(false);
  const joinTransitioningRef=useRef(false); joinTransitioningRef.current=joinTransitioning;
  const previousWalletRef=useRef(wallet);

  const goToCreatedRoom=useCallback((payload=null)=>{
    const roomPayload=payload||pendingCreatedRoomRef.current;
    if(!roomPayload?.inviteCode)return;
    nav(`/room/${roomPayload.inviteCode}`,{
      state:{
        fromCreate:true,
        inviteCode:roomPayload.inviteCode,
        expiresAt:roomPayload.expiresAt,
        teamSize:roomPayload.teamSize||createTeamSizeRef.current,
        current:1,
        players:walletRef.current?[walletRef.current]:[],
        phase:"waiting",
      }
    });
  },[nav]);

  const goToJoinedRoom=useCallback((payload=null)=>{
    const roomPayload=payload||pendingJoinedRoomRef.current;
    if(!roomPayload?.inviteCode)return;
    nav(`/room/${roomPayload.inviteCode}`,{
      state:{
        fromJoin:true,
        inviteCode:roomPayload.inviteCode,
        expiresAt:roomPayload.expiresAt||null,
        teamSize:roomPayload.teamSize||joinRoomRef.current.total||joinValidInfoRef.current?.total||0,
        current:roomPayload.current||0,
        players:Array.isArray(roomPayload.players)?roomPayload.players:[],
        phase:roomPayload.phase||"waiting",
      }
    });
  },[nav]);

  const handleRoomTransitionComplete=useCallback(()=>{
    if(createTransitioningRef.current){
      createTransitionDoneRef.current=true;
      if(pendingCreatedRoomRef.current)goToCreatedRoom();
      return;
    }
    if(joinTransitioningRef.current){
      joinTransitionDoneRef.current=true;
      if(pendingJoinedRoomRef.current)goToJoinedRoom();
    }
  },[goToCreatedRoom,goToJoinedRoom]);

  const maybeStartJoinTransition=useCallback((d={},phaseHint)=>{
    if(joinPhaseRef.current!=="joining"&&joinPhaseRef.current!=="waiting"&&joinPhaseRef.current!=="preparing")return false;
    const total=Number(d?.total||d?.players?.length||0);
    const current=Number(d?.current||d?.players?.length||total||0);
    const players=Array.isArray(d?.players)?d.players:[];
    const paymentOpen=!!(d?.paymentOpen||d?.chainGameId);
    const resolvedPhase=phaseHint||(paymentOpen?"payment":(d?.status==="full"||(total&&current>=total))?"preparing":"waiting");
    const payload={
      inviteCode:d?.inviteCode||joinCodeRef.current||"",
      expiresAt:resolvedPhase==="waiting"?(d?.expiresAt||null):null,
      teamSize:total,
      current,
      players,
      phase:resolvedPhase,
    };
    if(!payload.inviteCode)return false;
    pendingJoinedRoomRef.current=payload;
    if(joinTransitionDoneRef.current){
      goToJoinedRoom(payload);
    }else if(!joinTransitioningRef.current){
      joinTransitionDoneRef.current=false;
      setJoinTransitioning(true);
    }
    return true;
  },[goToJoinedRoom]);
  const maybeStartJoinTransitionRef=useRef(maybeStartJoinTransition);
  maybeStartJoinTransitionRef.current=maybeStartJoinTransition;

  const failCreateStart=useCallback((message=t("home.err.serverUnavailable"))=>{
    if(createTimeoutRef.current){clearTimeout(createTimeoutRef.current);createTimeoutRef.current=null;}
    createCancelPendingRef.current=false;
    pendingCreatedRoomRef.current=null;
    createTransitionDoneRef.current=false;
    setCreateTransitioning(false);
    setCreateHint(null);
    setCreatePhase("select");
    setCreateErr(message);
  },[t]);

  const failJoinStart=useCallback((message=t("home.err.serverUnavailable"))=>{
    if(joinTimeoutRef.current){clearTimeout(joinTimeoutRef.current);joinTimeoutRef.current=null;}
    pendingJoinedRoomRef.current=null;
    joinTransitionDoneRef.current=false;
    setJoinTransitioning(false);
    setJoinPhase("select");
    setJoinErr(message);
  },[t]);

  const resetMatchState=useCallback((message=null,{cancelQueue=false}={})=>{
    if(cancelQueue)emit("match:cancel");
    clearQuickMatchSession(walletRef.current);
    setPending(null);
    setMatchInfo({current:0});
    setPaymentStartedAt(null);
    setMatchPhase("select");
    setMatchErr(message);
  },[emit]);

  const rememberQuickMatchRoom=useCallback((payload={})=>{
    const inviteCode=(payload.inviteCode||"").trim();
    const players=Array.isArray(payload.players)?payload.players:[];
    const total=Number(payload.teamSize||payload.total||players.length||matchTeamSizeRef.current||2);
    const current=Number(payload.current||players.length||total||1);
    const normalized={
      ...payload,
      wallet:walletRef.current||"",
      inviteCode,
      teamSize:total,
      total,
      current,
      players,
      phase:payload.phase||"preparing",
      readyForPayment:!!(payload.readyForPayment||payload.gameId||payload.chainGameId),
    };
    if(inviteCode)writeQuickMatchSession(normalized);
    return normalized;
  },[]);

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
    setPaymentStartedAt(prev=>prev||d?.paymentStartedAt||Date.now());
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

  const restoreOpenRoom=useCallback(async(targetWallet=walletRef.current,options={})=>{
    if(!targetWallet)return null;
    try{
      const response=await fetch(`${SERVER_URL}/api/users/${targetWallet}/open-room`,options?.signal?{signal:options.signal}:undefined);
      const d=await response.json();
      const ownedRoom=d.room?.is_owner?d.room:null;
      setOpenRoom(ownedRoom);
      if(!d.room?.invite_code){
        setSuppressRestoredPaymentModal(false);
        return null;
      }
      const code=d.room.invite_code;
      const players=d.room.players?.length?d.room.players:Array.from({length:d.room.current_players||1},(_,i)=> i===0 ? targetWallet : `player-${i}`);
      const total=d.room.max_players;
      const current=d.room.current_players||players.length||1;
      const expiresAt=(d.room.expires_at?new Date(d.room.expires_at).getTime():new Date(d.room.created_at).getTime()+300000);
      const isExpired=expiresAt<=Date.now();
      const isPaymentPhase=d.room.phase==="payment"||d.room.phase==="paid_waiting";
      const isPreparingPhase=d.room.phase==="preparing";
      const nextPaymentStartedAt=d.room.payment_started_at?new Date(d.room.payment_started_at).getTime():null;
      setSuppressRestoredPaymentModal(isPaymentPhase||isPreparingPhase);
      if(isPaymentPhase||isPreparingPhase){
        setRoomFullInfo({gameId:d.room.game_id||d.room.id,chainGameId:d.room.chain_game_id||null,inviteCode:code,maxPlayers:total,owner:d.room.owner||null,auth:d.room.auth||null,players,paymentTimeout:d.room.payment_timeout_ms});
        setPaymentProgress({paidCount:d.room.paid_count||0,total:d.room.total_players||total});
        setPaymentStartedAt(isPaymentPhase?nextPaymentStartedAt:null);
      }else{
        setRoomFullInfo(null);
        setPaymentProgress({paidCount:0,total:0});
        setPaymentStartedAt(null);
      }
      if(d.room.is_owner){
        if(createTimeoutRef.current){clearTimeout(createTimeoutRef.current);createTimeoutRef.current=null;}
        setCreateTeamSize(total);
        setRoomCode(code);
        setRoom({current,total,players});
        setCreateErr(null);
        setCreateHint(null);
        if(createPhaseRef.current==="creating"||createTransitioningRef.current){
          pendingCreatedRoomRef.current={inviteCode:code,expiresAt,teamSize:total};
          if(createTransitionDoneRef.current){goToCreatedRoom(pendingCreatedRoomRef.current);}
          return "owner";
        }
        if(isPaymentPhase||isPreparingPhase){
          setCreatePaid(d.room.phase==="paid_waiting");
          setCreatePhase(d.room.phase);
          setRoomExpiresAt(null);
        }else if(isExpired){
          setCreatePhase("expired");
        }else{
          setCreatePhase("waiting");
          setRoomExpiresAt(expiresAt);
        }
        return "owner";
      }else{
        setJoinCode(code);
        setJoinRoom({current,total,players});
        const joinRoomPayload={inviteCode:code,expiresAt:isPaymentPhase||isPreparingPhase?null:expiresAt,teamSize:total,current,players,phase:isPaymentPhase?d.room.phase:(isPreparingPhase?"preparing":"waiting")};
        if(joinPhaseRef.current==="joining"||joinTransitioningRef.current){
          pendingJoinedRoomRef.current=joinRoomPayload;
          if(joinTransitionDoneRef.current){goToJoinedRoom(pendingJoinedRoomRef.current);}
          else if(!joinTransitioningRef.current){
            joinTransitionDoneRef.current=false;
            setJoinTransitioning(true);
          }
          return "guest";
        }
        if(isPaymentPhase||isPreparingPhase){
          setJoinPaid(d.room.phase==="paid_waiting");
          setJoinPhase(d.room.phase);
          setJoinExpiresAt(null);
        }else if(isExpired){
          setJoinErr(t("home.expiredMsg"));
          setJoinPhase("select");
        }else{
          setJoinPhase("waiting");
          setJoinExpiresAt(expiresAt);
        }
        return "guest";
      }
    }catch{
      setSuppressRestoredPaymentModal(false);
      return null;
    }
  },[goToCreatedRoom,goToJoinedRoom,t]);
  const reloadHistoryRef=useRef(reloadHistory); reloadHistoryRef.current=reloadHistory;
  const restoreOpenRoomRef=useRef(restoreOpenRoom); restoreOpenRoomRef.current=restoreOpenRoom;

  const isPaymentClosureReason=useCallback((reason="")=>/timed out|timeout|window closed|did not complete payment|room has been dissolved/i.test(String(reason)),[]);

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
    setCreateErr(null);
    setJoinErr(null);
    reloadHistory(walletRef.current);
  },[refund,reloadHistory]);

  // Panel focus state
  const scrollRef=useRef(null);
  const[activeCard,setActiveCard]=useState(0);
  const[focusedCard,setFocusedCard]=useState(0);
  const[isDesktopCarousel,setIsDesktopCarousel]=useState(()=>typeof window!=="undefined"&&window.innerWidth>=768);
  const CARDS=["create","join","match"];
  const pageCount=isDesktopCarousel?2:CARDS.length;
  const maxPageIndex=pageCount-1;

  useEffect(()=>{
    if(typeof window==="undefined")return;
    const syncViewport=()=>setIsDesktopCarousel(window.innerWidth>=768);
    syncViewport();
    window.addEventListener("resize",syncViewport);
    return()=>window.removeEventListener("resize",syncViewport);
  },[]);

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
    const pos=Math.max(0,Math.min(maxPageIndex,Math.round(el.scrollLeft/(cardWidth+gap))));
    if(scrollPosRef.current===pos)return;
    scrollPosRef.current=pos;
    setActiveCard(pos);
    if(!isDesktopCarousel){
      setFocusedCard(pos);
      setMode(CARDS[pos]);
    }
  };

  const goCard=(idx)=>{
    const next=Math.max(0,Math.min(maxPageIndex,idx));
    scrollPosRef.current=next;
    setActiveCard(next);
    if(!isDesktopCarousel){
      setFocusedCard(next);
      setMode(CARDS[next]);
    }
    scrollToCard(next);
  };

  const focusCard=(idx)=>{
    const next=Math.max(0,Math.min(CARDS.length-1,idx));
    setFocusedCard(next);
    setMode(CARDS[next]);
  };

  const scrollRight=()=>goCard(activeCard+1);
  const scrollLeft=()=>goCard(activeCard-1);

  useEffect(()=>{
    if(activeCard<=maxPageIndex)return;
    scrollPosRef.current=maxPageIndex;
    setActiveCard(maxPageIndex);
    if(!isDesktopCarousel){
      setFocusedCard(maxPageIndex);
      setMode(CARDS[maxPageIndex]);
    }
    requestAnimationFrame(()=>scrollToCard(maxPageIndex));
  },[activeCard,isDesktopCarousel,maxPageIndex]);

  // Room expiry countdown timer
  useEffect(()=>{
    if(!roomExpiresAt||createPhase!=="waiting"){setRoomCountdown(null);return;}
    let iv=null;
    const tick=()=>{
      const rem=Math.max(0,Math.ceil((roomExpiresAt-Date.now())/1000));
      setRoomCountdown(rem);
      if(rem<=0&&iv)clearInterval(iv);
    };
    tick();
    iv=setInterval(tick,1000);
    return()=>clearInterval(iv);
  },[roomExpiresAt,createPhase]);

  useEffect(()=>{
    if(createPhase!=="waiting"||roomCountdown!==0)return;
    setRoomExpiresAt(null);
    setRoomCountdown(null);
    setCreateHint(null);
    setCreateErr(null);
    setCreatePhase("expired");
  },[createPhase,roomCountdown]);

  // Join room expiry countdown timer
  useEffect(()=>{
    if(!joinExpiresAt||joinPhase!=="waiting"){setJoinCountdown(null);return;}
    let iv=null;
    const tick=()=>{
      const rem=Math.max(0,Math.ceil((joinExpiresAt-Date.now())/1000));
      setJoinCountdown(rem);
      if(rem<=0&&iv)clearInterval(iv);
    };
    tick();
    iv=setInterval(tick,1000);
    return()=>clearInterval(iv);
  },[joinExpiresAt,joinPhase]);

  useEffect(()=>{
    if(joinPhase!=="waiting"||joinCountdown!==0)return;
    setJoinExpiresAt(null);
    setJoinCountdown(null);
    setJoinPhase("select");
    setJoinErr(t("home.expiredMsg"));
  },[joinPhase,joinCountdown,t]);

  // Payment countdown timer (60s after room full)
  useEffect(()=>{
    paymentStartedAtRef.current=paymentStartedAt;
    if(!paymentStartedAt){setPaymentCountdown(null);return;}
    let iv=null;
    const tick=()=>{
      const rem=Math.max(0,Math.ceil((paymentStartedAt+PAYMENT_TIMEOUT*1000-Date.now())/1000));
      setPaymentCountdown(rem);
      if(rem<=0&&iv)clearInterval(iv);
    };
    tick();
    iv=setInterval(tick,1000);
    return()=>clearInterval(iv);
  },[paymentStartedAt]);

  useEffect(()=>{
    const previousWallet=previousWalletRef.current;
    if(previousWallet&&!wallet){
      nav("/login?next=/dashboard",{replace:true});
    }
    previousWalletRef.current=wallet;
  },[wallet,nav]);

  useEffect(()=>{
    // Reset ALL state on wallet disconnect or switch
    setHistory([]);setStats(EMPTY_STATS);
    setCreateTransitioning(false);pendingCreatedRoomRef.current=null;createTransitionDoneRef.current=false;
    setJoinTransitioning(false);pendingJoinedRoomRef.current=null;joinTransitionDoneRef.current=false;
    setSuppressRestoredPaymentModal(false);
    setCreatePhase("select");setCreateErr(null);setCreatePaid(false);setRoomCode("");setRoom({current:0,total:0,players:[]});setOpenRoom(null);setRoomExpiresAt(null);setRoomCountdown(null);
    setJoinPhase("select");setJoinErr(null);setJoinPaid(false);setJoinCode("");setJoinRoom({current:0,total:0,players:[]});setJoinExpiresAt(null);setJoinCountdown(null);setJoinValidInfo(null);
    setMatchPhase("select");setMatchErr(null);setMatchInfo({current:0});setPending(null);
    setPaymentStartedAt(null);setPaymentCountdown(null);setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});setPaymentErr(null);
    if(!wallet) return;
    reloadHistoryRef.current(wallet);
    fetch(`${SERVER_URL}/api/users/${wallet}`).then(r=>r.json()).then(data=>setStats({
      wins:Number(data?.wins||0),
      losses:Number(data?.losses||0),
      total_earned:Number(data?.total_earned||0),
      total_lost:Number(data?.total_lost||0),
    })).catch(()=>setStats(EMPTY_STATS));
    restoreOpenRoomRef.current(wallet);
  },[wallet]);

  // ===== SOCKET EVENT LISTENERS =====
  // Uses refs to read latest state — deps are only stable references, so listeners are never torn down mid-flight
  useEffect(()=>{
    const refreshHistory=()=>reloadHistory(walletRef.current);
    const u=[
      on("connect_error",()=>{
        const msg=t("home.err.serverUnavailable");
        if((createPhaseRef.current==="creating"||createTransitioningRef.current)&&!pendingCreatedRoomRef.current)failCreateStart(msg);
        if((joinPhaseRef.current==="validating"||joinPhaseRef.current==="joining"||joinTransitioningRef.current)&&!pendingJoinedRoomRef.current)failJoinStart(msg);
      }),
      on("disconnect",()=>{
        const msg=t("home.err.serverUnavailable");
        if((createPhaseRef.current==="creating"||createTransitioningRef.current)&&!pendingCreatedRoomRef.current)failCreateStart(msg);
        if((joinPhaseRef.current==="validating"||joinPhaseRef.current==="joining"||joinTransitioningRef.current)&&!pendingJoinedRoomRef.current)failJoinStart(msg);
      }),
      on("room:created",d=>{
        if(createTimeoutRef.current){clearTimeout(createTimeoutRef.current);createTimeoutRef.current=null;}
        createCancelPendingRef.current=false;
        createPhaseBeforeCancelRef.current="select";
        setCreateErr(null);
        setCreateHint(null);
        pendingCreatedRoomRef.current={inviteCode:d.inviteCode,expiresAt:d.expiresAt,teamSize:createTeamSizeRef.current};
        if(createTransitionDoneRef.current){goToCreatedRoom();}
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
        const roomIsFull=d.status==="full"||(d.total&&d.current>=d.total);
        if(roomIsFull){
          if(d.paymentOpen||d.chainGameId){
            if(maybeStartJoinTransitionRef.current(d,"payment"))return;
            enterRoomPayment(d);
          }else {
            if(maybeStartJoinTransitionRef.current(d,"preparing"))return;
            if(createPhaseRef.current==="waiting"||createPhaseRef.current==="creating")setCreatePhase("preparing");
            if(joinPhaseRef.current==="waiting"||joinPhaseRef.current==="joining")setJoinPhase("preparing");
          }
        }
      }),
      on("room:preparing",d=>{
        if(maybeStartJoinTransitionRef.current(d,"preparing"))return;
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
        if(maybeStartJoinTransitionRef.current(d,d?.paymentOpen||d?.chainGameId?"payment":"preparing"))return;
        if(d.paymentOpen||d.chainGameId)enterRoomPayment(d);
        else {
          if(createPhaseRef.current==="waiting"||createPhaseRef.current==="creating")setCreatePhase("preparing");
          if(joinPhaseRef.current==="waiting"||joinPhaseRef.current==="joining")setJoinPhase("preparing");
        }
      }),
      on("room:payment:opened",d=>{
        if(maybeStartJoinTransitionRef.current(d,"payment"))return;
        enterRoomPayment(d);
      }),
      on("room:error",d=>{
        if(createTimeoutRef.current){clearTimeout(createTimeoutRef.current);createTimeoutRef.current=null;}
        if(joinTimeoutRef.current){clearTimeout(joinTimeoutRef.current);joinTimeoutRef.current=null;}
        const uiMsg=formatPaymentUiError(d.message);
        if(/already in a room/i.test(String(d?.message||""))){
          restoreOpenRoom(walletRef.current);
          return;
        }
        if(createPhaseRef.current==="creating"){
          setCreateTransitioning(false);
          pendingCreatedRoomRef.current=null;
          createTransitionDoneRef.current=false;
        }
        if(createPhaseRef.current==="dissolving"){
          createCancelPendingRef.current=false;
          setCreatePhase(createPhaseBeforeCancelRef.current==="paid_waiting"?"paid_waiting":"waiting");
        }
        if(joinPhaseRef.current==="joining"){
          setJoinTransitioning(false);
          pendingJoinedRoomRef.current=null;
          joinTransitionDoneRef.current=false;
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
        if(wasCreateFlow && d&&d.reason && !selfCancelledCreate && !isPaymentClosureReason(d.reason))setCreateErr(d.reason);
        if(selfCancelledCreate)setCreateErr(null);
        if(wasJoinFlow && d&&d.reason && !isPaymentClosureReason(d.reason))setJoinErr(d.reason);
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
        const reason=d?.reason||"A player did not complete payment. This room has been dissolved.";
        if(isPaymentClosureReason(reason)){
          handleRoomPaymentFailure(reason);
          return;
        }
        const uiMsg=translateUiError(formatPaymentUiError(reason));
        setPaymentStartedAt(null);setPaymentCountdown(null);
        setRoomFullInfo(null);setPaymentProgress({paidCount:0,total:0});
        setPaymentErr(uiMsg);setPaymentNotice(null);
        if(createPhaseRef.current!=="select")setCreateErr(uiMsg);
        if(joinPhaseRef.current!=="select")setJoinErr(uiMsg);
        setCreatePhase(prev=>(prev==="payment"||prev==="paid_waiting"||prev==="preparing")?"select":prev);
        setJoinPhase(prev=>(prev==="payment"||prev==="paid_waiting"||prev==="preparing")?"select":prev);
      }),
      on("room:joined",d=>{
        if(joinTimeoutRef.current){clearTimeout(joinTimeoutRef.current);joinTimeoutRef.current=null;}
        if(d.error){setJoinErr(d.error);if(joinPaidRef.current){refund(ENTRY_FEE);setJoinPaid(false);}setJoinPhase("select");return;}
        const total=d.total||d.players?.length||0;
        const current=d.current||d.players?.length||0;
        setJoinRoom({current,total,players:d.players});
        if(d.expiresAt)setJoinExpiresAt(d.expiresAt);
        setJoinErr(null);
        setJoinValidInfo(null);
        pendingJoinedRoomRef.current={
          inviteCode:d.inviteCode||joinCodeRef.current,
          expiresAt:d.status==="full"||d.paymentOpen||d.chainGameId?null:d.expiresAt||null,
          teamSize:total,
          current,
          players:Array.isArray(d.players)?d.players:[],
          phase:d.paymentOpen||d.chainGameId?"payment":d.status==="full"?"preparing":"waiting",
        };
        joinTransitionDoneRef.current=false;
        setJoinTransitioning(true);
      }),
      on("game:start",d=>{
        updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players.length,players:d.players,phase:"predicting",basePrice:d.basePrice,countdown:Math.round((d.predictTimeout||60000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null});
        setPaymentStartedAt(null);
        setTimeout(()=>nav("/game"),50);
      }),
      on("game:resume",d=>{
        updateGame({gameId:d.gameId,chainGameId:d.chainGameId||d.gameId,mode:"room",teamSize:d.players?.length||d.totalPlayers||0,players:d.players||[],phase:d.phase==="settling"?"settling":"predicting",basePrice:d.basePrice,countdown:d.remaining||Math.round((d.predictTimeout||60000)/1000),predictSafeBuffer:Math.round((d.predictSafeBuffer||5000)/1000),predictionDeadline:d.predictionDeadline||null,currentPrice:d.currentPrice||d.basePrice});
        setPaymentStartedAt(null);
        setTimeout(()=>nav("/game"),50);
      }),
    ];
    return()=>u.forEach(f=>f());
  },[on,updateGame,nav,handleRoomPaymentFailure,isPaymentClosureReason,restoreOpenRoom,failCreateStart,failJoinStart,t]);

  // Check if any mode is currently active (not in idle "select" state)
  const isCreateBusy=createPhase!=="select";
  const isJoinBusy=joinPhase!=="select";
  const isMatchBusy=matchPhase!=="select";
  const createEntryDisabled=isJoinBusy||isMatchBusy;
  const createBlockedMsg=isJoinBusy
    ?t("home.err.createBlocked.join")
    :isMatchBusy
      ?t("home.err.createBlocked.match")
      :null;
  const joinEntryDisabled=isCreateBusy||isMatchBusy;
  const joinBlockedMsg=isCreateBusy
    ?t("home.err.joinBlocked.create")
    :isMatchBusy
      ?t("home.err.joinBlocked.match")
      :null;
  const matchEntryDisabled=isCreateBusy||isJoinBusy;
  const matchBlockedMsg=isCreateBusy
    ?t("home.err.matchBlocked.create")
    :isJoinBusy
      ?t("home.err.matchBlocked.join")
      :null;

  const createRoom=()=>{
    if(isJoinBusy||isMatchBusy){setCreateErr(t("home.err.finishFirst"));return;}
    if(isCreateBusy){setCreateErr(t("home.err.alreadyCreating"));return;}
    if(!mockMode && (!wallet || !provider || !signer)){connect({type:"create-room"});return;}
    createCancelPendingRef.current=false;
    createPhaseBeforeCancelRef.current="select";
    pendingCreatedRoomRef.current=null;
    createTransitionDoneRef.current=false;
    setCreateErr(null);
    setCreateHint(null);
    setCreatePhase("creating");
    setCreateTransitioning(true);
    if(createTimeoutRef.current)clearTimeout(createTimeoutRef.current);
    createTimeoutRef.current=setTimeout(async()=>{
      createTimeoutRef.current=null;
      if(createPhaseRef.current!=="creating"||pendingCreatedRoomRef.current)return;
      setCreateHint(t("home.err.baseSlow"));
      const controller=new AbortController();
      const abortTimer=setTimeout(()=>controller.abort(),3000);
      const restored=await restoreOpenRoom(walletRef.current,{signal:controller.signal});
      clearTimeout(abortTimer);
      if(!restored&&createPhaseRef.current==="creating"&&!pendingCreatedRoomRef.current){
        failCreateStart(t("home.err.serverUnavailable"));
      }
    },12000);
    emit("room:create",{teamSize:createTeamSize});
  };
  const payCreate=useCallback(async()=>{try{setPaymentErr(null);setPaymentNotice(null);if(!roomFullInfo?.gameId||!wallet)throw new Error("Missing game id");const startedAt=paymentStartedAtRef.current;const deadline=startedAt?startedAt+PAYMENT_TIMEOUT*1000:null;if((deadline&&Date.now()>=deadline)||paymentFailureDialogRef.current){handleRoomPaymentFailure(t("home.err.windowClosed"));return;}const paymentResult=await payForRoomEntry({inviteCode:roomCode,chainGameId:roomFullInfo?.chainGameId||null});const nowDeadline=paymentStartedAtRef.current?paymentStartedAtRef.current+PAYMENT_TIMEOUT*1000:deadline;if((nowDeadline&&Date.now()>=nowDeadline)||paymentFailureDialogRef.current){if(paymentResult?.paid)refund(ENTRY_FEE);handleRoomPaymentFailure(t("home.err.windowClosed"));return;}if(paymentResult?.chainGameId){setRoomFullInfo(prev=>prev?{...prev,chainGameId:paymentResult.chainGameId}:prev);}setPaymentProgress(prev=>({paidCount:Math.min(prev.total||roomFullInfo?.maxPlayers||1,Math.max(prev.paidCount||0,1)),total:prev.total||roomFullInfo?.maxPlayers||1}));setCreatePaid(true);setCreateErr(null);emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:paymentResult?.chainGameId||roomFullInfo?.chainGameId||null,inviteCode:roomCode,wallet});setCreatePhase("paid_waiting");}catch(e){const startedAtCatch=paymentStartedAtRef.current;const deadlineCatch=startedAtCatch?startedAtCatch+PAYMENT_TIMEOUT*1000:null;const timedOut=(deadlineCatch&&Date.now()>=deadlineCatch)||!!paymentFailureDialogRef.current;if(timedOut)return;const msg=formatPaymentUiError(e?.message||"Payment failed");setCreateErr(msg);setPaymentErr(msg);}},[payForRoomEntry,roomFullInfo,roomCode,emit,wallet,refund,handleRoomPaymentFailure]);
  const beginCreateRoomCancel=()=>{createCancelPendingRef.current=true;createPhaseBeforeCancelRef.current=createPhaseRef.current;setCreateErr(null);setCreateHint(t("home.cancelling"));setRoomCountdown(null);setCreatePhase("dissolving");emit("room:dissolve",{inviteCode:roomCodeRef.current||roomCode});};
  const cancelCreate=()=>{beginCreateRoomCancel();};
  const dissolveRoom=()=>{beginCreateRoomCancel();};
  const enterCreatedRoom=useCallback(()=>{
    const inviteCode=(roomCodeRef.current||roomCode||openRoom?.invite_code||roomFullInfo?.inviteCode||"").trim();
    if(!inviteCode)return;
    const players=Array.isArray(room.players)&&room.players.length
      ? room.players
      : Array.isArray(roomFullInfo?.players)&&roomFullInfo.players.length
        ? roomFullInfo.players
        : walletRef.current
          ? [walletRef.current]
          : [];
    const total=room.total||roomFullInfo?.maxPlayers||createTeamSizeRef.current||createTeamSize;
    const current=room.current||players.length||1;
    const phase=["payment","paid_waiting","preparing"].includes(createPhaseRef.current)?createPhaseRef.current:"waiting";
    nav(`/room/${inviteCode}`,{
      state:{
        fromCreate:true,
        inviteCode,
        expiresAt:phase==="waiting"?roomExpiresAt:null,
        teamSize:total,
        current,
        players,
        phase,
      }
    });
  },[createTeamSize,nav,openRoom,room,roomCode,roomExpiresAt,roomFullInfo]);
  const enterJoinedRoom=useCallback(()=>{
    const inviteCode=(joinCodeRef.current||joinCode||roomFullInfo?.inviteCode||"").trim();
    if(!inviteCode)return;
    const players=Array.isArray(joinRoom.players)&&joinRoom.players.length
      ? joinRoom.players
      : Array.isArray(roomFullInfo?.players)&&roomFullInfo.players.length
        ? roomFullInfo.players
        : [];
    const total=joinRoom.total||roomFullInfo?.maxPlayers||joinValidInfoRef.current?.total||players.length||0;
    const current=joinRoom.current||players.length||0;
    const phase=["payment","paid_waiting","preparing"].includes(joinPhaseRef.current)?joinPhaseRef.current:"waiting";
    nav(`/room/${inviteCode}`,{
      state:{
        fromJoin:true,
        inviteCode,
        expiresAt:phase==="waiting"?joinExpiresAt:null,
        teamSize:total,
        current,
        players,
        phase,
      }
    });
  },[joinCode,joinExpiresAt,joinRoom,nav,roomFullInfo]);
  const clearExpired=()=>{setCreatePhase("select");setRoomCode("");setRoom({current:0,total:0,players:[]});setOpenRoom(null);setCreateErr(null);reloadHistory(wallet);};
  const copyCode=()=>{navigator.clipboard.writeText(roomCode);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const shareTwitter=()=>{const url=typeof window!=="undefined"?window.location.origin:"";const text=t("home.share.text",{code:roomCode,url});const intent=`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;if(typeof window!=="undefined")window.open(intent,"_blank","noopener,noreferrer");};

  // Join flow: confirm dialog (no payment), then join directly
  const submitJoin=()=>{if(isCreateBusy||isMatchBusy){setJoinErr(t("home.err.finishFirst"));return;}if(isJoinBusy){setJoinErr(t("home.err.alreadyJoin"));return;}if(!mockMode && (!wallet || !provider || !signer)){connect({type:"join-room",code:joinCode});return;}if(joinCode.length<6)return setJoinErr(t("home.err.incompleteCode"));setJoinErr(null);setJoinPhase("validating");if(joinTimeoutRef.current)clearTimeout(joinTimeoutRef.current);joinTimeoutRef.current=setTimeout(()=>{setJoinErr(t("home.err.invalidCode"));setJoinPhase("select");},4000);emit("room:validate",{inviteCode:joinCode.toUpperCase()});};
  const confirmJoin=()=>{
    if(joinTimeoutRef.current)clearTimeout(joinTimeoutRef.current);
    joinTimeoutRef.current=setTimeout(()=>{
      joinTimeoutRef.current=null;
      if(joinPhaseRef.current==="joining"&&!pendingJoinedRoomRef.current){
        failJoinStart(t("home.err.serverUnavailable"));
      }
    },8000);
    emit("room:join",{inviteCode:joinCode.toUpperCase()});
    setJoinPhase("joining");
  };
  const payJoin=useCallback(async()=>{try{setPaymentErr(null);setPaymentNotice(null);if(!roomFullInfo?.gameId||!wallet)throw new Error("Missing game id");const startedAt=paymentStartedAtRef.current;const deadline=startedAt?startedAt+PAYMENT_TIMEOUT*1000:null;if((deadline&&Date.now()>=deadline)||paymentFailureDialogRef.current){handleRoomPaymentFailure(t("home.err.windowClosed"));return;}const paymentResult=await payForRoomEntry({inviteCode:roomFullInfo.inviteCode||joinCode,chainGameId:roomFullInfo?.chainGameId||null});const nowDeadline=paymentStartedAtRef.current?paymentStartedAtRef.current+PAYMENT_TIMEOUT*1000:deadline;if((nowDeadline&&Date.now()>=nowDeadline)||paymentFailureDialogRef.current){if(paymentResult?.paid)refund(ENTRY_FEE);handleRoomPaymentFailure(t("home.err.windowClosed"));return;}if(paymentResult?.chainGameId){setRoomFullInfo(prev=>prev?{...prev,chainGameId:paymentResult.chainGameId}:prev);}setPaymentProgress(prev=>({paidCount:Math.min(prev.total||roomFullInfo?.maxPlayers||1,Math.max(prev.paidCount||0,1)),total:prev.total||roomFullInfo?.maxPlayers||1}));setJoinPaid(true);setJoinErr(null);emit("room:payment:confirm",{gameId:roomFullInfo.gameId,chainGameId:paymentResult?.chainGameId||roomFullInfo?.chainGameId||null,inviteCode:roomFullInfo.inviteCode||joinCode,wallet});setJoinPhase("paid_waiting");}catch(e){const startedAtCatch=paymentStartedAtRef.current;const deadlineCatch=startedAtCatch?startedAtCatch+PAYMENT_TIMEOUT*1000:null;const timedOut=(deadlineCatch&&Date.now()>=deadlineCatch)||!!paymentFailureDialogRef.current;if(timedOut)return;const msg=formatPaymentUiError(e?.message||"Payment failed");setJoinErr(msg);setPaymentErr(msg);}},[joinCode,payForRoomEntry,emit,roomFullInfo,wallet,refund,handleRoomPaymentFailure]);
  const leaveRoom=()=>{emit("room:leave");if(joinPaid){refund(ENTRY_FEE);setJoinPaid(false);}setJoinPhase("select");setJoinExpiresAt(null);};

  // ===== QUICK MATCH =====
  useEffect(()=>{if(matchPhase!=="matching")return;setCd(15);const t=setInterval(()=>setCd(c=>{if(c<=1){clearInterval(t);return 0;}return c-1;}),1000);return()=>clearInterval(t);},[matchPhase]);

  useEffect(()=>{
    if(!wallet)return;
    const stored=readQuickMatchSession(wallet);
    const isFresh=!stored?.updatedAt||Date.now()-Number(stored.updatedAt)<10*60*1000;
    if(stored?.inviteCode&&isFresh&&matchPhaseRef.current==="select"){
      const restored=rememberQuickMatchRoom(stored);
      setMatchTeamSize(restored.teamSize||matchTeamSizeRef.current);
      setMatchInfo(restored);
      setMatchErr(null);
      setMatchPhase("preparing");
    }else if(stored?.inviteCode&&!isFresh){
      clearQuickMatchSession(wallet);
    }
    emit("match:resume");
  },[wallet,emit,rememberQuickMatchRoom]);

  useEffect(()=>{
    const u=[
      on("match:update",d=>{setMatchInfo(prev=>({...prev,current:d.current,total:d.total||prev.total||matchTeamSizeRef.current,teamSize:d.teamSize||d.total||prev.teamSize||matchTeamSizeRef.current,players:Array.isArray(d.players)?d.players:(prev.players||[])}));if(typeof d.remaining==="number")setCd(d.remaining);}),
      on("match:queued",d=>{const total=d.teamSize||d.total||matchTeamSizeRef.current;setMatchTeamSize(total);setMatchInfo({current:d.current||1,total,teamSize:total,players:Array.isArray(d.players)?d.players:[]});setMatchErr(null);setMatchPhase("matching");if(typeof d.remaining==="number")setCd(d.remaining);}),
      on("match:active",d=>{if(!d.inviteCode)return;const total=d.teamSize||d.total||d.players?.length||matchTeamSizeRef.current;const players=Array.isArray(d.players)?d.players:[];const payload=rememberQuickMatchRoom({inviteCode:d.inviteCode,teamSize:total,total,current:d.current||players.length||total,players,gameId:d.gameId||null,chainGameId:d.chainGameId||null,phase:"preparing",readyForPayment:!!(d.gameId||d.chainGameId)});setMatchTeamSize(total);setMatchInfo(payload);setPending(d.gameId?payload:null);setMatchErr(null);setMatchPhase("preparing");}),
      on("match:full",d=>{const total=d.teamSize||d.total||matchTeamSizeRef.current;const players=Array.isArray(d.players)?d.players:[];const payload=rememberQuickMatchRoom({inviteCode:d.inviteCode||"",teamSize:total,total,current:d.current||total,players,phase:"preparing"});setMatchErr(null);setMatchInfo(payload);setMatchPhase("preparing");if(d.inviteCode){nav(`/room/${d.inviteCode}`,{state:{fromQuickMatch:true,inviteCode:d.inviteCode,teamSize:total,current:d.current||total,players,phase:"preparing"}});}}),
      on("match:found",d=>{if(d.inviteCode){const total=d.teamSize||matchTeamSizeRef.current;const players=Array.isArray(d.players)?d.players:[];const payload=rememberQuickMatchRoom({inviteCode:d.inviteCode,teamSize:total,total,current:d.current||players.length||total,players,gameId:d.gameId,chainGameId:d.chainGameId,phase:"preparing",readyForPayment:true});setMatchInfo(payload);setPending(payload);setMatchErr(null);setMatchPhase("preparing");nav(`/room/${d.inviteCode}`,{state:{fromQuickMatch:true,inviteCode:d.inviteCode,teamSize:total,current:payload.current,players,gameId:d.gameId,chainGameId:d.chainGameId,phase:"preparing",readyForPayment:true}});return;}setPending(d);setPaymentProgress({paidCount:0,total:d.players?.length||0});setPaymentErr(null);setPaymentStartedAt(Date.now());if(mockMode){mockPay().then(()=>{updateGame({gameId:d.gameId,chainGameId:d.chainGameId,mode:"random",teamSize:d.teamSize||matchTeamSizeRef.current,players:d.players,phase:"predicting"});nav("/game");});}else setMatchPhase("payment");}),
      on("match:failed",()=>resetMatchState(t("home.err.noOpponents"))),
      on("match:cancelled",()=>resetMatchState(null)),
      on("match:error",d=>resetMatchState(d.message)),
      on("disconnect",()=>{
        if(matchPhaseRef.current==="matching"||matchPhaseRef.current==="preparing"){
          resetMatchState(t("home.err.lostConn"));
        }
      }),
    ];
    return()=>u.forEach(f=>f());
  },[on,mockMode,mockPay,updateGame,nav,resetMatchState,rememberQuickMatchRoom]);

  useEffect(()=>{
    if(matchPhase!=="matching"||cd!==0)return;
    const timer=setTimeout(()=>{
      if(matchPhaseRef.current==="matching"){
        resetMatchState(t("home.err.noOpponents"),{cancelQueue:true});
      }
    },1200);
    return()=>clearTimeout(timer);
  },[matchPhase,cd,resetMatchState]);

  const startMatch=()=>{if(isCreateBusy||isJoinBusy){setMatchErr(t("home.err.finishFirst"));return;}if(isMatchBusy){setMatchErr(t("home.err.alreadyMatching"));return;}if(!mockMode && (!wallet || !provider || !signer)){connect({type:"random-match"});return;}clearQuickMatchSession(walletRef.current);setPending(null);setMatchErr(null);setMatchPhase("matching");setMatchInfo({current:1,total:matchTeamSize,teamSize:matchTeamSize,players:walletRef.current?[walletRef.current]:[]});emit("match:join",{teamSize:matchTeamSize});};
  const cancelMatch=()=>resetMatchState(null,{cancelQueue:true});
  const enterMatchedRoom=useCallback(()=>{
    const cached=readQuickMatchSession(walletRef.current)||{};
    const currentInfo=matchInfoRef.current||{};
    const pendingInfo=pendingRef.current||{};
    const inviteCode=(currentInfo.inviteCode||pendingInfo.inviteCode||cached.inviteCode||"").trim();
    if(!inviteCode)return;
    const players=Array.isArray(currentInfo.players)&&currentInfo.players.length
      ?currentInfo.players
      :Array.isArray(pendingInfo.players)&&pendingInfo.players.length
        ?pendingInfo.players
        :Array.isArray(cached.players)?cached.players:[];
    const total=Number(currentInfo.teamSize||currentInfo.total||pendingInfo.teamSize||cached.teamSize||players.length||matchTeamSizeRef.current||2);
    const gameId=currentInfo.gameId||pendingInfo.gameId||cached.gameId||null;
    const chainGameId=currentInfo.chainGameId||pendingInfo.chainGameId||cached.chainGameId||null;
    const payload=rememberQuickMatchRoom({inviteCode,teamSize:total,total,current:currentInfo.current||pendingInfo.current||cached.current||players.length||total,players,gameId,chainGameId,phase:"preparing",readyForPayment:!!(currentInfo.readyForPayment||pendingInfo.readyForPayment||cached.readyForPayment||gameId||chainGameId)});
    nav(`/room/${inviteCode}`,{
      state:{
        fromQuickMatch:true,
        inviteCode,
        teamSize:total,
        current:payload.current,
        players,
        gameId,
        chainGameId,
        phase:"preparing",
        readyForPayment:payload.readyForPayment,
      }
    });
  },[nav,rememberQuickMatchRoom]);
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
  const storedQuickMatch=readQuickMatchSession(wallet);
  const activeQuickMatchInvite=(matchInfo.inviteCode||pending?.inviteCode||storedQuickMatch?.inviteCode||"").trim();
  const canEnterMatchedRoom=!!activeQuickMatchInvite&&matchPhase!=="select";
  const isWaitingPaymentPhase=isRoomPaidWaiting||isMatchPaidWaiting;
  const showRoomPayment=(isRoomPreparing||isRoomPaymentPhase||isRoomPaidWaiting)&&!suppressRestoredPaymentModal;
  const showPayment=showRoomPayment||(isMatchPreparing&&!canEnterMatchedRoom)||isMatchPaymentPhase||isMatchPaidWaiting||!!paymentFailureDialog;
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
  const closePaymentFailureDialog=useCallback(()=>{
    setPaymentFailureDialog(null);
    paymentFailureDialogRef.current=null;
    setPaymentErr(null);
    setPaymentNotice(null);
    setCreateErr(null);
    setJoinErr(null);
    setMatchErr(null);
  },[]);
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
  const hasGeneratedRoom=(createPhase==="waiting"||createPhase==="paid_waiting"||createPhase==="preparing"||createPhase==="expired"||!!openRoom);
  const showCreateRoomCountdown=roomCountdown!==null&&roomCountdown>0&&room.current<createRoomTotal;
  const showCreatePaymentCountdown=paymentCountdown!==null&&paymentCountdown>0&&(createPhase==="payment"||createPhase==="paid_waiting");
  const createCountdownLabel=showCreatePaymentCountdown?t("home.countdown.payment"):t("home.countdown.expires");
  const createCountdownValue=showCreatePaymentCountdown?`${paymentCountdown}s`:fmtCountdown(roomCountdown);
  const createdRoomInviteCode=(roomCode||openRoom?.invite_code||roomFullInfo?.inviteCode||"").trim();
  const canEnterCreatedRoom=!!createdRoomInviteCode&&["waiting","preparing","payment","paid_waiting"].includes(createPhase);
  const joinedRoomInviteCode=(joinCode||roomFullInfo?.inviteCode||"").trim();
  const canEnterJoinedRoom=!!joinedRoomInviteCode&&["waiting","preparing","payment","paid_waiting"].includes(joinPhase);

  const renderCreatePanel=()=>(
    <div
      onPointerDownCapture={()=>focusCard(0)}
      onFocusCapture={()=>focusCard(0)}
      className={`relative transition-all duration-300 ${focusedCard===0?"[filter:drop-shadow(0_0_22px_rgba(217,70,239,0.22))]":"hover:[filter:drop-shadow(0_0_18px_rgba(217,70,239,0.18))]"}`}
    >
      <div className="dashboard-room-card h-full min-h-[340px] sm:min-h-[360px] w-full !p-4 sm:!p-5">
        {hasGeneratedRoom&&(
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-fuchsia-500/18 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-100/80 shrink-0">
                <RoomGlyph />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{t("home.card.create.generated")}</h3>
              </div>
            </div>
            {(showCreateRoomCountdown||showCreatePaymentCountdown)&&(
              <div className={`shrink-0 inline-flex items-center gap-2 rounded-[18px] border px-3.5 py-2 backdrop-blur-sm shadow-[0_0_20px_rgba(168,85,247,0.14)] ${
                showCreatePaymentCountdown
                  ? paymentCountdown<=10
                    ? "border-rose-500/28 bg-rose-500/[0.10] text-rose-200"
                    : "border-fuchsia-500/22 bg-fuchsia-500/[0.10] text-fuchsia-100"
                  : roomCountdown<=30
                    ? "border-rose-500/28 bg-rose-500/[0.10] text-rose-200"
                    : "border-fuchsia-500/22 bg-fuchsia-500/[0.10] text-fuchsia-100"
              }`}>
                <span className={`w-2 h-2 rounded-full ${showCreatePaymentCountdown?(paymentCountdown<=10?"bg-rose-300":"bg-fuchsia-300"):(roomCountdown<=30?"bg-rose-300":"bg-fuchsia-300")} ${showCreatePaymentCountdown||roomCountdown<=30?"animate-pulse":""}`}/>
                <div className="flex flex-col items-end leading-none">
                  <span className="text-[8px] uppercase tracking-[0.22em] text-white/45">{createCountdownLabel}</span>
                  <span className="mt-1 font-mono font-black text-[0.98rem] sm:text-[1.08rem] tracking-[0.08em] text-white">{createCountdownValue}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {createErr&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-lg mb-3 text-[10px]">⚠️ {createErr}</div>}
        {createHint&&<div className="bg-white/[0.03] border border-white/[0.06] text-white/45 px-3 py-2 rounded-lg mb-3 text-[10px]">{createHint}</div>}

        {createPhase==="select"&& !openRoom&&(
          <CreateRoomSelectorCard
            selectedSize={createTeamSize}
            onSelect={setCreateTeamSize}
            onAction={createRoom}
            disabled={createEntryDisabled}
            blockedMsg={createBlockedMsg}
          />
        )}
        {createPhase==="creating"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-300 animate-spin mb-3"/><p className="text-white/40 text-xs">{t("home.creating")}</p></div>)}
        {createPhase==="dissolving"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-300 animate-spin mb-3"/><p className="text-white/40 text-xs">{t("home.cancelling")}</p></div>)}
        {(createPhase==="waiting"||createPhase==="payment"||createPhase==="paid_waiting"||createPhase==="preparing")&&(
          <div className="text-center">
            <div className="dashboard-room-subcard px-5 py-4 mb-3 text-left">
              <div className="flex items-start justify-between gap-3 mb-1">
                <p className="text-white/34 text-[9px] uppercase tracking-[0.28em]">{t("home.arenaCode")}</p>
                <button
                  type="button"
                  onClick={shareTwitter}
                  aria-label={t("home.share.twitter")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/55 transition hover:bg-sky-500/10 hover:border-sky-500/25 hover:text-sky-300"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                    <path d="M18.244 2H21l-6.52 7.45L22 22h-6.828l-4.76-6.23L4.8 22H2l7.02-8.02L2 2h6.91l4.29 5.68L18.244 2Zm-2.397 18h1.86L7.24 4H5.3l10.547 16Z"/>
                  </svg>
                  <span>{t("home.share.twitter")}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={copyCode}
                aria-label={t("home.copy.cta")}
                className={`group w-full text-left transition ${copied?"text-emerald-300":"text-white hover:text-white"}`}
              >
                <span className="block -mt-2 text-[1.65rem] sm:text-[1.95rem] font-mono font-black tracking-[0.24em] text-gradient-fuchsia">{roomCode}</span>
                <span className={`mt-1.5 block text-[10px] leading-5 ${copied?"text-emerald-400":"text-white/42 group-hover:text-white/58"}`}>
                  {copied?t("home.copy.done"):t("home.card.create.generatedDesc")}
                </span>
              </button>
            </div>
            <TeamSlots total={createRoomTotal} players={room.players} current={room.current}/>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[10px]">
              <div className="dashboard-room-chip inline-flex items-center gap-1.5 px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse"/>
                <span className="text-white/34 font-mono">{createPhase==="preparing" ? t("home.preparingPayment") : createPaid && paymentProgress.total ? `${paymentProgress.paidCount}/${paymentProgress.total} ${t("home.paid")}` : `${room.current}/${createRoomTotal} ${t("home.ready")}`}</span>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={dissolveRoom} className={`dashboard-secondary-btn danger ${canEnterCreatedRoom?"flex-1":"w-full"} py-2 text-[10px]`}>
                {t("home.cancel")}
              </button>
              {canEnterCreatedRoom&&(
                <button onClick={enterCreatedRoom} className="dashboard-secondary-btn flex-1 py-2 text-[10px] !text-fuchsia-100 hover:!text-white">
                  {t("home.enterRoom")}
                </button>
              )}
            </div>
          </div>
        )}
        {createPhase==="expired"&&(
          <div className="text-center">
            <p className="text-white/20 text-[8px] uppercase tracking-[0.3em] mb-2">{t("home.arenaCode")}</p>
            <div className="dashboard-room-subcard px-4 py-3 mb-3">
              <span className="text-2xl font-mono font-black tracking-[0.4em] text-white/15 line-through">{roomCode}</span>
            </div>
            <p className="text-rose-400 text-xs mb-3">{t("home.expiredMsg")}</p>
            <button onClick={clearExpired} className="dashboard-primary-btn w-full py-2.5 font-bold text-sm">
              {t("home.expiredCta")}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderJoinPanel=()=>(
    <div
      onPointerDownCapture={()=>focusCard(1)}
      onFocusCapture={()=>focusCard(1)}
      className={`relative transition-all duration-300 ${focusedCard===1?"[filter:drop-shadow(0_0_22px_rgba(217,70,239,0.22))]":"hover:[filter:drop-shadow(0_0_18px_rgba(217,70,239,0.18))]"}`}
    >
      <div className="dashboard-room-card h-full min-h-[340px] sm:min-h-[360px] w-full !p-4 sm:!p-5">
        {joinPhase!=="select"&&(
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-500/18 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-100/80 shrink-0">
              <JoinGlyph />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{t("home.card.join.title")}</h3>
              <p className="text-[12px] text-white/42 leading-6">{t("home.card.join.desc")}</p>
            </div>
          </div>
        )}

        {joinErr&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-lg mb-3 text-[10px]">⚠️ {joinErr}</div>}

        {joinPhase==="validating"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-300 animate-spin mb-3"/><p className="text-white/40 text-xs">{t("home.validating")}</p></div>)}
        {joinPhase==="joining"&&(<div className="text-center py-10"><div className="w-8 h-8 mx-auto rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-300 animate-spin mb-3"/><p className="text-white/40 text-xs">{t("home.joining")}</p></div>)}
        {joinPhase==="select"&&(
          <JoinRoomSelectorCard
            value={joinCode}
            onChange={setJoinCode}
            onSubmit={submitJoin}
            disabled={joinEntryDisabled}
            blockedMsg={joinBlockedMsg}
          />
        )}
        {joinPhase==="confirm"&&(
          <div className="text-center">
            <p className="text-white/40 text-xs mb-3">{t("home.joinConfirm")}</p>
            <div className="dashboard-room-subcard px-4 py-3 mb-4">
              <span className="text-xl font-mono font-black tracking-[0.4em] text-gradient-fuchsia">{joinCode}</span>
            </div>
            <p className="text-white/25 text-[10px] mb-4">{joinValidInfo?t("home.joinPlayersInRoom",{n:joinValidInfo.current,total:joinValidInfo.total}):""}</p>
            <div className="flex gap-2">
              <button onClick={()=>{setJoinPhase("select");setJoinValidInfo(null);}} className="dashboard-secondary-btn flex-1 py-2.5 text-xs">{t("home.cancel")}</button>
              <button onClick={confirmJoin} className="dashboard-primary-btn flex-1 !py-2.5 !text-sm font-bold">{t("home.join")}</button>
            </div>
          </div>
        )}
        {(joinPhase==="waiting"||joinPhase==="payment"||joinPhase==="paid_waiting"||joinPhase==="preparing")&&(
          <div className="text-center">
            <p className="text-white/20 text-[8px] uppercase tracking-[0.3em] mb-2">{t("home.joinedArena")}</p>
            <div className="dashboard-room-subcard px-4 py-3 mb-3">
              <span className="text-xl font-mono font-black tracking-[0.4em] text-gradient-fuchsia">{joinCode}</span>
            </div>
            <TeamSlots total={joinRoom.total} players={joinRoom.players}/>
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse"/>
              <span className="text-white/30 font-mono">
                {joinPhase==="preparing"
                  ? t("home.preparingPayment")
                  : (joinPhase==="payment"||joinPhase==="paid_waiting") && paymentProgress.total
                    ? `${paymentProgress.paidCount}/${paymentProgress.total} ${t("home.paid")}`
                    : `${joinRoom.current}/${joinRoom.total} ${t("home.waiting")}`}
              </span>
            </div>
            {joinCountdown!==null&&joinCountdown>0&&joinRoom.current<joinRoom.total&&(
              <div className={`mt-2 flex items-center justify-center gap-1.5 ${joinCountdown<=30?"text-rose-400":"text-fuchsia-300"}`}>
                <span className="text-sm">⏱️</span>
                <span className="text-sm font-mono font-bold">{fmtCountdown(joinCountdown)}</span>
                <span className="text-[9px] text-white/25 ml-1">{t("home.remaining")}</span>
              </div>
            )}
            {paymentCountdown!==null&&paymentCountdown>0&&(joinPhase==="payment"||joinPhase==="paid_waiting")&&(
              <div className={`mt-2 flex items-center justify-center gap-1.5 ${paymentCountdown<=10?"text-rose-400":"text-fuchsia-300"}`}>
                <span className="text-sm">💰</span>
                <span className="text-sm font-mono font-bold">{paymentCountdown}s</span>
                <span className="text-[9px] text-white/25 ml-1">{t("home.payment.countdown")}</span>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button onClick={leaveRoom} disabled={joinPhase==="preparing"} className={`dashboard-secondary-btn danger ${canEnterJoinedRoom?"flex-1":"w-full"} py-2 text-[10px] disabled:opacity-30 disabled:cursor-not-allowed`}>{t("home.leave")}</button>
              {canEnterJoinedRoom&&(
                <button onClick={enterJoinedRoom} className="dashboard-secondary-btn flex-1 py-2 text-[10px] !text-fuchsia-100 hover:!text-white">
                  {t("home.enterRoom")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderMatchPanel=()=>(
    <div
      onPointerDownCapture={()=>focusCard(2)}
      onFocusCapture={()=>focusCard(2)}
      className={`relative transition-all duration-300 ${focusedCard===2?"[filter:drop-shadow(0_0_22px_rgba(217,70,239,0.22))]":"hover:[filter:drop-shadow(0_0_18px_rgba(217,70,239,0.18))]"}`}
    >
      <div className="dashboard-room-card h-full min-h-[340px] sm:min-h-[360px] w-full !p-4 sm:!p-5">
        {matchPhase!=="select"&&(
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-500/18 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-100/80 shrink-0">
              <MatchGlyph />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{t("home.card.match.title")}</h3>
              <p className="text-[12px] text-white/42 leading-6">{t("home.card.match.desc")}</p>
            </div>
          </div>
        )}

        {matchErr&&<div className="bg-rose-500/10 border border-rose-500/15 text-rose-400 px-3 py-2 rounded-lg mb-3 text-[10px]">⚠️ {matchErr}</div>}

        {matchPhase==="select"&&(
          <QuickMatchSelectorCard
            selectedSize={matchTeamSize}
            onSelect={setMatchTeamSize}
            onAction={startMatch}
            disabled={matchEntryDisabled}
            blockedMsg={matchBlockedMsg}
          />
        )}
        {matchPhase==="matching"&&(
          <div>
            <MatchAnimation teamSize={matchTeamSize} current={matchInfo.current} countdown={cd} status="matching"/>
            <div className="mt-3 flex gap-2">
              <button onClick={cancelMatch} className={`dashboard-secondary-btn danger ${canEnterMatchedRoom?"flex-1":"w-full"} py-2 text-[10px]`}>{t("home.cancel")}</button>
              {canEnterMatchedRoom&&(
                <button onClick={enterMatchedRoom} className="dashboard-secondary-btn flex-1 py-2 text-[10px] !text-fuchsia-100 hover:!text-white">
                  {t("home.enterRoom")}
                </button>
              )}
            </div>
          </div>
        )}
        {matchPhase==="preparing"&&(
          <div>
            <MatchAnimation teamSize={matchTeamSize} current={matchTeamSize} status="preparing"/>
            <p className="mt-3 text-center text-[10px] text-white/25">{t("home.preparingNote")}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={cancelMatch} className={`dashboard-secondary-btn danger ${canEnterMatchedRoom?"flex-1":"w-full"} py-2 text-[10px]`}>{t("home.cancel")}</button>
              {canEnterMatchedRoom&&(
                <button onClick={enterMatchedRoom} className="dashboard-secondary-btn flex-1 py-2 text-[10px] !text-fuchsia-100 hover:!text-white">
                  {t("home.enterRoom")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return(
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="landing-bg" aria-hidden="true">
        <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      </div>
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">

      {/* Top section */}
      <div className="grid grid-cols-1 mb-8">
        <div>
          <span className="dashboard-kicker mb-3 block">{t("home.dashboard.kicker")}</span>
          <h1 className="dashboard-title text-2xl sm:text-3xl mb-2 uppercase">
            {typedTitlePre}
            {showTitleGap?" ":""}
            {typedTitleHighlight?<span className="dashboard-title-highlight">{typedTitleHighlight}</span>:null}
          </h1>
          <p className="text-white/50 text-sm leading-relaxed max-w-lg">
            {t("home.hero.desc", { fee: ENTRY_FEE })}
          </p>
          {mockMode&&<div className="inline-flex items-center gap-1.5 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-full px-3 py-1 mt-3">
            <span className="text-fuchsia-300/80 text-[10px] font-bold">{t("home.demoBadge")}</span>
          </div>}
          {!wallet&&!mockMode&&<p className="text-white/30 text-xs mt-3">
            {window.ethereum?t("home.hint.connectWallet"):t("home.hint.noWallet")}
          </p>}
        </div>
        {/* BTC price panel — hidden */}
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-6 mb-6 px-1">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-emerald-400/70"/>
          <span className="text-xs text-white/35 uppercase tracking-wider">{t("home.stats.wins")}</span>
          <span className="text-base font-black text-emerald-400">{stats.wins}</span>
        </div>
        <div className="w-px h-5 bg-white/10"/>
        <div className="flex items-center gap-2">
          <XCircle size={18} className="text-rose-400/70"/>
          <span className="text-xs text-white/35 uppercase tracking-wider">{t("home.stats.losses")}</span>
          <span className="text-base font-black text-rose-400">{stats.losses}</span>
        </div>
        <div className="w-px h-5 bg-white/10"/>
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className={parseFloat(stats.total_earned)-parseFloat(stats.total_lost)>=0?"text-emerald-400/70":"text-rose-400/70"}/>
          <span className="text-xs text-white/35 uppercase tracking-wider">{t("home.stats.profit")}</span>
          <span className={`text-base font-black ${parseFloat(stats.total_earned)-parseFloat(stats.total_lost)>=0?"text-emerald-400":"text-rose-400"}`}>{(parseFloat(stats.total_earned)-parseFloat(stats.total_lost)).toFixed(2)}</span>
        </div>
      </div>

      {/* ===== Action Panels ===== */}
      <div className="relative mb-8">
        <button onClick={scrollLeft}
          disabled={activeCard===0}
          className="dashboard-secondary-btn absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 !rounded-full flex items-center justify-center backdrop-blur-sm disabled:opacity-25 disabled:cursor-not-allowed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button onClick={scrollRight}
          disabled={activeCard===maxPageIndex}
          className="dashboard-secondary-btn absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 !rounded-full flex items-center justify-center backdrop-blur-sm disabled:opacity-25 disabled:cursor-not-allowed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        <div ref={scrollRef} onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto scroll-smooth pb-2 hide-scrollbar"
          style={{scrollbarWidth:"none",msOverflowStyle:"none"}}
        >
          <div className="flex-shrink-0 w-full min-w-full md:w-[calc(50%-8px)] md:min-w-[calc(50%-8px)] self-stretch">{renderCreatePanel()}</div>
          <div className="flex-shrink-0 w-full min-w-full md:w-[calc(50%-8px)] md:min-w-[calc(50%-8px)] self-stretch">{renderJoinPanel()}</div>
          <div className="flex-shrink-0 w-full min-w-full md:w-[calc(50%-8px)] md:min-w-[calc(50%-8px)] self-stretch">{renderMatchPanel()}</div>
        </div>

        <div className="flex items-center justify-center gap-3 mt-4">
          {activeCard>0&&<span className="text-white/40 text-[10px] mr-1">{t("home.swipe.left")}</span>}
          {Array.from({length:pageCount}).map((_,i)=>(
            <button key={i} onClick={()=>goCard(i)}
              className={`rounded-full transition-all duration-300
                ${activeCard===i?"w-7 h-2.5 bg-gradient-to-r from-[#8f3f72] via-[#c04bd3] to-[#ec4899]":"w-2.5 h-2.5 bg-white/35 hover:bg-white/55"}`}
            />
          ))}
          {activeCard<maxPageIndex&&<span className="text-white/40 text-[10px] ml-1">{t("home.swipe.right")}</span>}
        </div>
      </div>

      {/* Payment modal — shown when room is full (both creator and joiner) or quick match */}
      <PaymentModal
        visible={showPayment}
        onConfirm={paymentFailureDialog?closePaymentFailureDialog:onPayConfirm}
        onCancel={paymentFailureDialog?undefined:onPayCancel}
        loading={loading}
        mode={paymentModalMode}
        variant={isMatchPreparing&&!paymentFailureDialog?"quickPreparing":"default"}
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

      {/* History */}
      <div className="dashboard-room-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="dashboard-kicker">{t("home.history.title")}</span>
          <div className="flex gap-1">
            {[["all","home.history.filter.all"],["create","home.history.filter.create"],["join","home.history.filter.join"],["random","home.history.filter.random"]].map(([k,l])=><button key={k} onClick={()=>setHistoryFilter(k)} className={`dashboard-ghost-btn px-2 py-1 text-[10px] ${historyFilter===k?"is-active":""}`}>{t(l)}</button>)}
          </div>
        </div>
        <div>
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
                <div key={g.id} className={`dashboard-room-list-item px-3 py-2.5 border-l-2 ${result==="Win"?"border-l-emerald-500/60":result==="Lose"?"border-l-rose-500/60":result==="Playing"?"border-l-sky-500/60":"border-l-fuchsia-500/40"}`}>
                  <div className="grid grid-cols-[minmax(0,1fr)_148px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_168px_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-none">{title}</p>
                      <p className="text-[10px] text-white/25 mt-1">{time}</p>
                    </div>
                    <div className="min-w-0 self-center text-center">
                      <p className="text-[10px] text-white/88">{t("home.arenaCode")}</p>
                      <p className="text-[11px] font-mono text-fuchsia-300 truncate">{isRoom && g.invite_code ? g.invite_code : "—"}</p>
                    </div>
                    <div className="min-w-0 justify-self-end text-right">
                      <p className="text-[10px] text-white/35">{g.max_players}P</p>
                      <span className={`text-[10px] font-bold mt-1 px-2 py-0.5 rounded-full inline-block border ${result==="Win"?"bg-emerald-500/15 text-white border-emerald-500/25":result==="Lose"?"bg-rose-500/15 text-white border-rose-500/25":result==="Playing"?"bg-sky-500/15 text-white border-sky-500/25":"bg-fuchsia-500/15 text-white border-fuchsia-500/25"}`}>{result}</span>
                    </div>
                  </div>
                  {g.error_message&&g.state==="failed"&&(
                    <p className="mt-2 text-[10px] text-fuchsia-200/80 leading-relaxed">{g.error_message}</p>
                  )}
                  {(canClaim||isClaimed||isClaiming) && <div className="mt-3 flex justify-end">
                    <button
                      onClick={()=>claimHistoryReward(g)}
                      disabled={!canClaim||isClaiming}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition ${
                        isClaimed
                          ?"bg-emerald-500/10 border border-emerald-500/15 text-emerald-300 cursor-default"
                          : canClaim
                            ?"dashboard-primary-btn !rounded-lg !border-fuchsia-300/22 !bg-gradient-to-r !from-[#7a3a64] !via-[#ab4bc2] !to-[#db5a9f] text-white disabled:opacity-60"
                            :"dashboard-secondary-btn !rounded-lg text-white/35 cursor-default"
                      }`}
                    >
                      {isClaiming ? t("home.history.claiming") : isClaimed ? claimedLabel : actionLabel}
                    </button>
                  </div>}
                </div>
              );
            })}
            {totalPages > 1 && <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={()=>setHistoryPage(p=>Math.max(1,p-1))} disabled={page===1} className="dashboard-ghost-btn px-2 py-1 text-[10px] disabled:opacity-30">{t("home.history.prev")}</button>
              <span className="text-[10px] text-white/35">{page} / {totalPages}</span>
              <button onClick={()=>setHistoryPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="dashboard-ghost-btn px-2 py-1 text-[10px] disabled:opacity-30">{t("home.history.next")}</button>
            </div>}
          </div>;
        })()}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="dashboard-room-card p-4">
          <div>
          <div className="flex items-center justify-between mb-3">
            <span className="dashboard-kicker">{t("home.quickRules")}</span>
            <button onClick={()=>nav("/how-to-play")} className="text-[10px] text-fuchsia-300/60 hover:text-fuchsia-300 transition font-semibold">{t("home.learnMore")}</button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-white/55">
            <div className="flex items-center gap-2 py-1"><span>💰</span>{t("home.rule.entry",{fee:ENTRY_FEE})}</div>
            <div className="flex items-center gap-2 py-1"><span>⏱️</span>{t("home.rule.predict")}</div>
            <div className="flex items-center gap-2 py-1"><span>📊</span>{t("home.rule.settle")}</div>
            <div className="flex items-center gap-2 py-1"><span>🏆</span>{t("home.rule.pool")}</div>
          </div>
          <div className="dashboard-room-subcard mt-2">
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
                <div className="dashboard-room-subcard font-mono text-[11px] text-white/70 px-3 py-2 leading-relaxed">{t("home.payout.formula")}</div>
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

      </div>
      <RoomTransition visible={createTransitioning||joinTransitioning} onComplete={handleRoomTransitionComplete}/>
    </div>
  );
}
