export function PaymentModal({visible,onConfirm,onCancel,loading,title="Confirm Entry",actionLabel="Pay 1 USDC",amount="1 USDC",subtitle="Entry fee for this round",hint="You'll confirm this payment in your wallet.",countdown=null}){
  if(!visible)return null;
  return<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl">
    <div className="max-w-sm w-full mx-4 animate-slideUp rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[#22160f] via-[#17110d] to-[#120d0a] shadow-2xl shadow-orange-900/20 p-6">
      <div className="text-center mb-4">
        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 border border-orange-500/15 flex items-center justify-center text-2xl animate-float">💰</div>
        <h3 className="text-lg font-black">{title}</h3>
        <p className="text-white/35 text-xs mt-1">{subtitle}</p>
      </div>
      {amount&&<div className="bg-gradient-to-br from-amber-500/[0.08] to-orange-500/[0.06] border border-amber-500/20 rounded-xl p-4 mb-3 text-center">
        <div className="text-3xl font-black text-gradient">{amount}</div>
        <p className="text-white/20 text-[10px] mt-1">Platform fee included</p>
      </div>}
      {countdown!==null&&countdown>0&&<div className="text-center mb-3">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${countdown<=10?"bg-rose-500/10 border-rose-500/20":"bg-amber-500/10 border-amber-500/20"}`}>
          <span className="text-lg">⏱️</span>
          <span className={`text-xl font-mono font-black ${countdown<=10?"text-rose-400":"text-amber-400"}`}>{countdown}s</span>
        </div>
      </div>}
      {hint&&<p className="text-white/25 text-[11px] text-center mb-4">{hint}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition text-xs text-white/30">Cancel</button>
        <button onClick={onConfirm} disabled={loading} className="flex-1 btn-primary !py-2.5 !text-sm">{loading?"Processing...":actionLabel}</button>
      </div>
    </div>
  </div>;
}
