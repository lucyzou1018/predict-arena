export const QUICK_MATCH_SESSION_KEY = "alphamatch.quickMatchRoom";

function normalizeWallet(wallet) {
  return wallet?.toLowerCase?.() || "";
}

export function readQuickMatchSession(wallet) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(QUICK_MATCH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const target = normalizeWallet(wallet);
    if (target && normalizeWallet(parsed.wallet) !== target) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeQuickMatchSession(payload) {
  if (typeof window === "undefined" || !payload?.inviteCode) return;
  try {
    window.sessionStorage.setItem(
      QUICK_MATCH_SESSION_KEY,
      JSON.stringify({ ...payload, updatedAt: Date.now() }),
    );
  } catch {}
}

export function clearQuickMatchSession(wallet = null) {
  if (typeof window === "undefined") return;
  try {
    if (wallet) {
      const existing = readQuickMatchSession(wallet);
      if (!existing) return;
    }
    window.sessionStorage.removeItem(QUICK_MATCH_SESSION_KEY);
  } catch {}
}
