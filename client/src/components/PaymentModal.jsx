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
}){
  if(!visible)return null;
  const isWaiting=mode==="waiting";
  const isPreparing=mode==="preparing";
  const remainingPlayers=Math.max(0,totalCount-paidCount);
  const progressPct=totalCount?Math.min(100,Math.round((paidCount/totalCount)*100)):0;
  return<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
    <div className={`max-w-sm w-full max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain animate-slideUp rounded-2xl border shadow-2xl p-6 ${isWaiting?"border-emerald-500/20 bg-gradient-to-br from-[#102016] via-[#131a14] to-[#0f130f] shadow-emerald-950/30":"border-amber-500/20 bg-gradient-to-br from-[#22160f] via-[#17110d] to-[#120d0a] shadow-orange-900/20"}`}>
      <div className="text-center mb-4">
        <div className={`w-14 h-14 mx-auto mb-3 rounded-2xl border flex items-center justify-center text-2xl ${isWaiting?"bg-gradient-to-br from-emerald-500/15 to-teal-500/15 border-emerald-500/20":"bg-gradient-to-br from-amber-500/15 to-orange-500/15 border-orange-500/15 animate-float"}`}>{isWaiting?"✅":isPreparing?"⚔️":"💰"}</div>
        <h3 className="text-lg font-black">{title}</h3>
        <p className="text-white/35 text-xs mt-1">{subtitle}</p>
      </div>
      {amount&&<div className={`border rounded-xl p-4 mb-3 text-center ${isWaiting?"bg-gradient-to-br from-emerald-500/[0.08] to-teal-500/[0.05] border-emerald-500/20":"bg-gradient-to-br from-amber-500/[0.08] to-orange-500/[0.06] border-amber-500/20"}`}>
        <div className="text-3xl font-black text-gradient">{amount}</div>
        <p className="text-white/20 text-[10px] mt-1">{isWaiting?"Your payment is locked in for this round":isPreparing?"Payment will unlock as soon as setup finishes":"Platform fee included"}</p>
      </div>}
      {totalCount>0&&!isPreparing&&<div className={`rounded-xl border p-3 mb-3 ${isWaiting?"bg-emerald-500/[0.06] border-emerald-500/15":"bg-white/[0.03] border-white/[0.06]"}`}>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/35 mb-2">
          <span>Payment Progress</span>
          <span>{paidCount}/{totalCount} paid</span>
        </div>
        <div className="h-2 rounded-full bg-black/20 overflow-hidden mb-2">
          <div className={`h-full rounded-full transition-all duration-500 ${isWaiting?"bg-gradient-to-r from-emerald-400 to-teal-400":"bg-gradient-to-r from-amber-400 to-orange-500"}`} style={{width:`${progressPct}%`}}/>
        </div>
        {isWaiting&&<p className="text-[11px] text-emerald-200/80">{remainingPlayers>0?`Waiting for ${remainingPlayers} more ${remainingPlayers===1?"player":"players"} to confirm.`:"All players paid. Starting match..."}</p>}
      </div>}
      {isPreparing&&<div className="mb-4 rounded-xl border border-amber-500/15 bg-white/[0.03] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"/>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-amber-200/90">Preparing on-chain payment step</p>
            <p className="text-[10px] text-white/30 mt-1">The `Pay 1 USDC` action will appear automatically in this dialog.</p>
          </div>
        </div>
      </div>}
      {countdown!==null&&countdown>0&&<div className="text-center mb-3">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${countdown<=10?"bg-rose-500/10 border-rose-500/20":"bg-amber-500/10 border-amber-500/20"}`}>
          <span className="text-lg">⏱️</span>
          <span className={`text-xl font-mono font-black ${countdown<=10?"text-rose-400":"text-amber-400"}`}>{countdown}s</span>
        </div>
        {countdownLabel&&<p className="text-[10px] text-white/25 mt-2">{countdownLabel}</p>}
      </div>}
      {notice&&<div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">{notice}</div>}
      {error&&<div className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">{error}</div>}
      {hint&&<p className="text-white/25 text-[11px] text-center mb-4">{hint}</p>}
      {isPreparing?(
        <div className="grid grid-cols-2 gap-2">
          <button disabled className="py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/20 text-amber-300 text-xs font-bold">Match Locked</button>
          <button disabled className="py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/45 text-xs font-bold">Preparing...</button>
        </div>
      ):isWaiting?(
        <div className="grid grid-cols-2 gap-2">
          <button disabled className="py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-xs font-bold">Payment Sent</button>
          <button disabled className="py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/45 text-xs font-bold">Waiting For Others</button>
        </div>
      ):(
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition text-xs text-white/30">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 btn-primary !py-2.5 !text-sm">{loading?"Processing...":actionLabel}</button>
        </div>
      )}
    </div>
  </div>;
}
