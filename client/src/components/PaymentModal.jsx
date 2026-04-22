export function PaymentModal({
  visible,
  onConfirm,
  onCancel,
  loading,
  title="Confirm Entry",
  actionLabel="Pay 1 USDC",
  amount="1 USDC",
  subtitle="Entry fee for this round",
  hint="You'll confirm this payment in your wallet.",
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
  preparingPrimaryLabel="Match Locked",
  preparingSecondaryLabel="Preparing...",
  singleAction=false,
}){
  if(!visible)return null;
  const isWaiting=mode==="waiting";
  const isPreparing=mode==="preparing";
  const remainingPlayers=Math.max(0,totalCount-paidCount);
  const progressPct=totalCount?Math.min(100,Math.round((paidCount/totalCount)*100)):0;
  const amountNote=amountCaption||(
    isWaiting
      ?"Your payment is locked in for this round"
      :isPreparing
        ?"Payment will unlock as soon as setup finishes"
        :"Platform fee included"
  );
  return<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
    <div className="landing-story-card max-w-[28rem] sm:max-w-[30rem] w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-slideUp !p-4 sm:!p-5 shadow-[0_26px_72px_rgba(8,6,24,0.72)]">
      <div className="text-center mb-4">
        <h3 className="text-[1.35rem] sm:text-[1.55rem] font-black tracking-tight text-white leading-[1.08]">{title}</h3>
        <p className="max-w-[25rem] mx-auto text-white/40 text-[12px] leading-5 mt-2">{subtitle}</p>
      </div>
      {amount&&<div className="mb-3 rounded-[24px] border border-white/[0.08] bg-white/[0.03] px-4 py-4 text-center">
        <div className="text-[2rem] sm:text-[2.3rem] font-black tracking-tight text-gradient">{amount}</div>
        <p className="text-white/24 text-[10px] mt-1.5">{amountNote}</p>
      </div>}
      {totalCount>0&&!isPreparing&&<div className={`rounded-[20px] border px-4 py-3 mb-3 ${isWaiting?"bg-fuchsia-500/[0.06] border-fuchsia-500/15":"bg-white/[0.03] border-white/[0.06]"}`}>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/35 mb-2.5">
          <span>Payment Progress</span>
          <span>{paidCount}/{totalCount} paid</span>
        </div>
        <div className="h-2 rounded-full bg-black/20 overflow-hidden mb-2.5">
          <div className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-purple-400 via-fuchsia-400 to-purple-400" style={{width:`${progressPct}%`}}/>
        </div>
        {isWaiting&&<p className="text-[11px] leading-5 text-fuchsia-200/80">{remainingPlayers>0?`Waiting for ${remainingPlayers} more ${remainingPlayers===1?"player":"players"} to confirm.`:"All players paid. Starting match..."}</p>}
      </div>}
      {isPreparing&&<div className="mb-3 rounded-[20px] border border-fuchsia-500/15 bg-white/[0.03] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="w-2 h-2 mt-1.5 rounded-full bg-fuchsia-400 animate-pulse shrink-0"/>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-fuchsia-100/90">{preparingTitle||"Preparing on-chain payment step"}</p>
            <p className="text-[11px] leading-5 text-white/34 mt-1">{preparingMessage||"The `Pay 1 USDC` action will appear automatically in this dialog."}</p>
          </div>
        </div>
      </div>}
      {countdown!==null&&countdown>0&&<div className="text-center mb-2.5">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${countdown<=10?"bg-rose-500/10 border-rose-500/20":"bg-fuchsia-500/10 border-fuchsia-500/20"}`}>
          <span className={`text-[0.95rem] font-mono font-black ${countdown<=10?"text-rose-400":"text-fuchsia-300"}`}>{countdown}s</span>
        </div>
        {countdownLabel&&<p className="text-[10px] text-white/25 mt-1.5 leading-5">{countdownLabel}</p>}
      </div>}
      {notice&&<div className="mb-2.5 rounded-[18px] border border-fuchsia-500/20 bg-fuchsia-500/10 px-3.5 py-2.5 text-[11px] leading-5 text-fuchsia-200">{notice}</div>}
      {error&&<div className="mb-2.5 rounded-[18px] border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-[11px] leading-5 text-rose-300">{error}</div>}
      {hint&&<p className="text-white/26 text-[10px] leading-5 text-center mb-4 max-w-[25rem] mx-auto">{hint}</p>}
      {singleAction?(
        <button onClick={onConfirm} disabled={loading} className="w-full btn-primary !py-2.5 !text-sm">{loading?"Processing...":actionLabel}</button>
      ):isPreparing?(
        <div className="space-y-2">
          <div className="w-full py-2 rounded-xl bg-fuchsia-500/12 border border-fuchsia-500/18 text-fuchsia-300 text-[11px] font-bold text-center">{preparingPrimaryLabel}</div>
          <button disabled className="w-full py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/45 text-sm font-bold">{preparingSecondaryLabel}</button>
        </div>
      ):isWaiting?(
        <button disabled className="w-full py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/45 text-sm font-bold">Waiting For Others</button>
      ):(
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition text-sm text-white/30">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 btn-primary !py-2.5 !text-sm">{loading?"Processing...":actionLabel}</button>
        </div>
      )}
    </div>
  </div>;
}
