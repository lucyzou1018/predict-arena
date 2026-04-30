import{useState}from"react";import{useT}from"../context/LangContext";

const isNetworkSwitchError=(message="")=>/wallet network is incorrect|switch wallet to|switch to .* before continuing/i.test(String(message));

function LoadingLabel({ label = null }){
  const t=useT();
  const displayLabel=String(label||t("payment.processing")).replace(/\s*(?:\.{3}|…)\s*$/,"");
  return (
    <span className="inline-flex items-end justify-center gap-0.5">
      <span>{displayLabel}</span>
      <span className="loading-ellipsis" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  );
}

export function PaymentModal({
  visible,
  onConfirm,
  onCancel,
  loading,
  title=null,
  actionLabel=null,
  amount="1 USDC",
  subtitle=null,
  hint=undefined,
  notice=null,
  error=null,
  countdown=null,
  mode="confirm",
  paidCount=0,
  totalCount=0,
  countdownLabel=null,
  amountCaption=null,
  preparingTitle=null,
  preparingMessage=null,
  preparingPrimaryLabel=null,
  preparingSecondaryLabel=null,
  singleAction=false,
  variant="default",
  eyebrow=null,
  cancelLabel=null,
  onSwitchNetwork=null,
  switchNetworkLabel=null,
}){
  const t=useT();
  const[switchingNetwork,setSwitchingNetwork]=useState(false);
  if(!visible)return null;
  const isWaiting=mode==="waiting";
  const isPreparing=mode==="preparing";
  const isLobby=variant==="lobby";
  const isQuickPreparing=variant==="quickPreparing"&&isPreparing;
  const remainingPlayers=Math.max(0,totalCount-paidCount);
  const everyonePaid=isWaiting&&totalCount>0&&remainingPlayers===0;
  const progressPct=totalCount?Math.min(100,Math.round((paidCount/totalCount)*100)):0;
  const lobbyActionWrapClass=singleAction?"mt-1":"pt-1";
  const singleActionPrimaryClass="dashboard-primary-btn w-full !py-2.5 !text-sm";
  const showLobbyDetail=!!amount||(totalCount>0&&!isPreparing);
  const displayTitle=title||t("payment.title");
  const displayActionLabel=actionLabel||t("payment.action");
  const displaySubtitle=subtitle||t("payment.subtitle");
  const displayHint=hint===undefined?t("payment.defaultHint"):hint;
  const displayAmountCaption=amountCaption===undefined?t("payment.amountCaption"):amountCaption;
  const displayPreparingPrimary=preparingPrimaryLabel||t("payment.preparingPrimary");
  const displayPreparingSecondary=preparingSecondaryLabel||t("payment.preparingSecondary");
  const displayCancelLabel=cancelLabel||t("payment.cancel");
  const displaySwitchNetworkLabel=switchNetworkLabel||t("nav.switchChain");
  const shouldSwitchNetwork=!!onSwitchNetwork&&!isPreparing&&!isWaiting&&isNetworkSwitchError(error);
  const enteringGameLabel=t("payment.enteringGame");
  const waitingOthersLabel=t("payment.waitingOthers");
  const paidLabel=t("payment.paid");
  const progressMessage=isPreparing
    ?(preparingMessage||t("payment.preparingDefaultMessage"))
    :isWaiting
      ?(remainingPlayers>0?t("payment.waitingMore",{n:remainingPlayers}):t("payment.waitingAllPaid"))
      :(totalCount>0?(paidCount>0?t("payment.everyoneHerePaid",{paid:paidCount,total:totalCount}):t("payment.confirmEntry")):t("payment.confirmWalletContinue"));
  const handlePrimaryAction=async()=>{
    if(!shouldSwitchNetwork){onConfirm?.();return;}
    setSwitchingNetwork(true);
    try{await onSwitchNetwork();}
    finally{setSwitchingNetwork(false);}
  };
  const primaryActionLabel=shouldSwitchNetwork?displaySwitchNetworkLabel:displayActionLabel;
  if(isQuickPreparing){
    return<div className="payment-modal-backdrop payment-modal-backdrop-lobby fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="payment-modal-card payment-modal-card-lobby dashboard-modal-card w-full max-w-[23rem] overflow-hidden overscroll-contain animate-slideUp">
        <div className="p-6 sm:p-7">
        <div className="text-center">
          <h3 className="text-[1.45rem] sm:text-[1.7rem] font-black tracking-tight text-white leading-[1.08]">{t("payment.quickPreparing.title")}</h3>
          <p className="mt-3 text-white/48 text-[13px] leading-6">{t("payment.quickPreparing.subtitle")}</p>
        </div>
        <button disabled className="mt-7 w-full py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/45 text-sm font-bold cursor-not-allowed">
          <LoadingLabel label={t("payment.quickPreparing.action")} />
        </button>
        </div>
      </div>
    </div>;
  }
  if(isLobby){
    return<div className="payment-modal-backdrop payment-modal-backdrop-lobby fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="payment-modal-card payment-modal-card-lobby dashboard-modal-card w-full max-w-[25.5rem] overflow-hidden overscroll-contain animate-slideUp">
        <div className="flex flex-col gap-3.5 p-5 sm:p-6">
          {(eyebrow||countdown!==null&&countdown>0)&&<div className="flex flex-wrap items-center justify-between gap-3">
            {eyebrow&&<span className="dashboard-room-chip inline-flex items-center gap-2 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/85">{eyebrow}</span>}
            {countdown!==null&&countdown>0&&<span className={`dashboard-room-chip inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold ${countdown<=10?"!border-rose-400/30 !bg-rose-500/10 !text-rose-200":"!border-cyan-300/20 !bg-cyan-300/[0.08] !text-cyan-100/85"}`}>
              <span className="text-[8px] uppercase tracking-[0.2em] text-white/45">{countdownLabel||t("payment.window")}</span>
              <span className="font-mono text-[1.05rem] font-black tracking-tight">{countdown}s</span>
            </span>}
          </div>}

          <div className="mx-auto max-w-[26rem] text-center">
            <h3 className="text-[1.2rem] sm:text-[1.45rem] font-black tracking-[-0.04em] text-white leading-[1.06]">{displayTitle}</h3>
            <p className="mt-1.5 text-[11px] sm:text-[12px] leading-5 text-white/58">{displaySubtitle}</p>
          </div>

          {showLobbyDetail&&<div className="dashboard-modal-row rounded-[22px] px-3.5 py-3.5">
            <div className="flex flex-col items-center text-center">
              <div className="min-w-0">
                {amount&&<>
                  <div className="text-[9px] uppercase tracking-[0.22em] text-white/38">{t("payment.roundEntry")}</div>
                  <div className="mt-1.5 text-[1.25rem] sm:text-[1.45rem] font-black tracking-[-0.03em] text-gradient">{amount}</div>
                </>}
              </div>
            </div>

            {totalCount>0&&!isPreparing&&<div className="mt-4">
              <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-white/35 mb-2">
                <span>{t("payment.progress")}</span>
                <span>{paidCount}/{totalCount} {paidLabel}</span>
              </div>
                <div className="h-2.5 overflow-hidden rounded-full border border-white/[0.05] bg-white/[0.06] shadow-[inset_0_1px_3px_rgba(0,0,0,0.42)]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#8f3f72] via-[#c04bd3] to-[#ec4899] transition-all duration-500" style={{width:`${progressPct}%`}}/>
                </div>
              </div>}
          </div>}

          {notice&&<div className="rounded-[16px] border border-cyan-300/15 bg-cyan-300/[0.07] px-3 py-2.5 text-[10px] leading-5 text-cyan-100/88">{notice}</div>}
          {error&&<div className="rounded-[16px] border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-[10px] leading-5 text-rose-200">{error}</div>}
          {displayHint&&<p className="text-[10px] leading-5 text-white/46">{displayHint}</p>}

          <div className={lobbyActionWrapClass}>
          {singleAction?(
            <button onClick={handlePrimaryAction} disabled={loading||switchingNetwork} className={singleActionPrimaryClass}>{loading||switchingNetwork?<LoadingLabel label={shouldSwitchNetwork?displaySwitchNetworkLabel:null} />:primaryActionLabel}</button>
          ):isPreparing?(
            <div className="space-y-2">
              <div className="dashboard-room-subcard w-full px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-100/82">{displayPreparingPrimary}</div>
              <button disabled className="dashboard-secondary-btn w-full px-4 py-2.5 text-sm font-bold !text-white/45"><LoadingLabel label={displayPreparingSecondary} /></button>
            </div>
          ):isWaiting?(
            <button disabled className="dashboard-secondary-btn w-full px-4 py-2.5 text-sm font-bold !text-white/45">{everyonePaid?<LoadingLabel label={enteringGameLabel} />:waitingOthersLabel}</button>
          ):(
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button onClick={onCancel} disabled={loading} className="dashboard-secondary-btn flex-1 px-4 py-2.5 text-sm font-semibold !text-white/48 disabled:opacity-40">{displayCancelLabel}</button>
              <button onClick={handlePrimaryAction} disabled={loading||switchingNetwork} className="dashboard-primary-btn flex-[1.18] !py-2.5 !text-sm">{loading||switchingNetwork?<LoadingLabel label={shouldSwitchNetwork?displaySwitchNetworkLabel:null} />:primaryActionLabel}</button>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>;
  }
  return<div className="payment-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="payment-modal-card landing-story-card w-full max-w-[23.5rem] sm:max-w-[25.5rem] min-h-[32rem] sm:min-h-[35rem] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-slideUp !p-5 sm:!p-6 shadow-[0_26px_72px_rgba(8,6,24,0.72)]">
      <div className="text-center mb-5 sm:mb-6">
        <h3 className="text-[1.35rem] sm:text-[1.55rem] font-black tracking-tight text-white leading-[1.08]">{displayTitle}</h3>
        <p className="max-w-[25rem] mx-auto text-white/40 text-[12px] leading-5 mt-2">{displaySubtitle}</p>
      </div>
      {amount&&<div className="mb-4 rounded-[24px] border border-white/[0.08] bg-white/[0.03] px-4 py-5 sm:py-6 text-center">
        <div className="text-[2rem] sm:text-[2.3rem] font-black tracking-tight text-gradient">{amount}</div>
        <p className="text-white/24 text-[10px] mt-1.5">{displayAmountCaption}</p>
      </div>}
      {totalCount>0&&!isPreparing&&<div className={`rounded-[20px] border px-4 py-3.5 mb-4 ${isWaiting?"bg-fuchsia-500/[0.06] border-fuchsia-500/15":"bg-white/[0.03] border-white/[0.06]"}`}>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/35 mb-2.5">
          <span>{t("payment.progress")}</span>
          <span>{paidCount}/{totalCount} {paidLabel}</span>
        </div>
        <div className="h-2 rounded-full bg-black/20 overflow-hidden mb-2.5">
          <div className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-purple-400 via-fuchsia-400 to-purple-400" style={{width:`${progressPct}%`}}/>
        </div>
        {isWaiting&&<p className="text-[11px] leading-5 text-fuchsia-200/80">{progressMessage}</p>}
      </div>}
      {isPreparing&&<div className="mb-4 rounded-[20px] border border-fuchsia-500/15 bg-white/[0.03] px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="w-2 h-2 mt-1.5 rounded-full bg-fuchsia-400 animate-pulse shrink-0"/>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-fuchsia-100/90">{preparingTitle||t("payment.preparingTitle")}</p>
            <p className="text-[11px] leading-5 text-white/34 mt-1">{preparingMessage||t("payment.preparingMessage")}</p>
          </div>
        </div>
      </div>}
      {countdown!==null&&countdown>0&&<div className="text-center mb-3.5">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${countdown<=10?"bg-rose-500/10 border-rose-500/20":"bg-fuchsia-500/10 border-fuchsia-500/20"}`}>
          <span className={`text-[0.95rem] font-mono font-black ${countdown<=10?"text-rose-400":"text-fuchsia-300"}`}>{countdown}s</span>
        </div>
        {countdownLabel&&<p className="text-[10px] text-white/25 mt-1.5 leading-5">{countdownLabel}</p>}
      </div>}
      {notice&&<div className="mb-3 rounded-[18px] border border-fuchsia-500/20 bg-fuchsia-500/10 px-3.5 py-2.5 text-[11px] leading-5 text-fuchsia-200">{notice}</div>}
      {error&&<div className="mb-3 rounded-[18px] border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-[11px] leading-5 text-rose-300">{error}</div>}
      {displayHint&&<p className="text-white/26 text-[10px] leading-5 text-center mb-5 max-w-[25rem] mx-auto">{displayHint}</p>}
      {singleAction?(
        <button onClick={handlePrimaryAction} disabled={loading||switchingNetwork} className={singleActionPrimaryClass}>{loading||switchingNetwork?<LoadingLabel label={shouldSwitchNetwork?displaySwitchNetworkLabel:null} />:primaryActionLabel}</button>
      ):isPreparing?(
        <div className="space-y-2">
          <div className="w-full py-2 rounded-xl bg-fuchsia-500/12 border border-fuchsia-500/18 text-fuchsia-300 text-[11px] font-bold text-center">{displayPreparingPrimary}</div>
          <button disabled className="w-full py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/45 text-sm font-bold"><LoadingLabel label={displayPreparingSecondary} /></button>
        </div>
      ):isWaiting?(
        <button disabled className="w-full py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/45 text-sm font-bold">{everyonePaid?<LoadingLabel label={enteringGameLabel} />:waitingOthersLabel}</button>
      ):(
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition text-sm text-white/30">{displayCancelLabel}</button>
          <button onClick={handlePrimaryAction} disabled={loading||switchingNetwork} className="flex-1 btn-primary !py-2.5 !text-sm">{loading||switchingNetwork?<LoadingLabel label={shouldSwitchNetwork?displaySwitchNetworkLabel:null} />:primaryActionLabel}</button>
        </div>
      )}
    </div>
  </div>;
}
