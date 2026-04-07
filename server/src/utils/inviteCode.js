const C = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateInviteCode(len = 6) { let s = ""; for (let i = 0; i < len; i++) s += C[Math.floor(Math.random() * C.length)]; return s; }
