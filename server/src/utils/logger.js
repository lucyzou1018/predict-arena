const L = { debug: 0, info: 1, warn: 2, error: 3 };
const CUR = L[process.env.LOG_LEVEL || "info"];
function fmt(l, m, msg, d) { const t = new Date().toISOString().slice(11, 23); return d !== undefined ? `${t} [${l.toUpperCase()}] [${m}] ${msg} ${JSON.stringify(d)}` : `${t} [${l.toUpperCase()}] [${m}] ${msg}`; }
export function createLogger(m) {
  return { debug: (msg, d) => CUR <= 0 && console.log(fmt("debug", m, msg, d)), info: (msg, d) => CUR <= 1 && console.log(fmt("info", m, msg, d)), warn: (msg, d) => CUR <= 2 && console.warn(fmt("warn", m, msg, d)), error: (msg, d) => CUR <= 3 && console.error(fmt("error", m, msg, d)) };
}
