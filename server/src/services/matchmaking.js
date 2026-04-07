import config from "../config/index.js";
import { query } from "../config/database.js";
import contractService from "./contract.js";

class MatchmakingService {
  constructor() { this.queues = { 2: [], 3: [], 4: [], 5: [] }; this.timers = {}; this.io = null; }
  setIO(io) { this.io = io; }

  addPlayer(teamSize, wallet, socketId) {
    const q = this.queues[teamSize];
    if (!q) return { error: "Invalid team size" };
    if (q.find(p => p.wallet === wallet)) return { error: "Already in queue" };
    for (const s in this.queues) { if (this.queues[s].find(p => p.wallet === wallet)) return { error: "Already in another queue" }; }
    q.push({ wallet, socketId, joinedAt: Date.now() });
    this._broadcast(teamSize);
    if (q.length === teamSize) return this._formTeam(teamSize);
    if (q.length === 1) { this.timers[teamSize] = setTimeout(() => this._timeout(teamSize), config.game.matchTimeout); }
    return { status: "queued", position: q.length, total: teamSize };
  }

  removePlayer(wallet) {
    for (const s in this.queues) { const i = this.queues[s].findIndex(p => p.wallet === wallet); if (i !== -1) { this.queues[s].splice(i, 1); this._broadcast(parseInt(s)); return true; } }
    return false;
  }

  removeBySocket(sid) {
    for (const s in this.queues) { const i = this.queues[s].findIndex(p => p.socketId === sid); if (i !== -1) { this.queues[s].splice(i, 1); this._broadcast(parseInt(s)); return; } }
  }

  async _formTeam(teamSize) {
    const q = this.queues[teamSize]; const players = q.splice(0, teamSize);
    if (this.timers[teamSize]) { clearTimeout(this.timers[teamSize]); delete this.timers[teamSize]; }
    const res = await query(`INSERT INTO games (mode, max_players, state) VALUES ('random', $1, 'matching') RETURNING id`, [teamSize]);
    const gameId = res.rows[0].id;
    const chain = await contractService.createGame(teamSize);
    await query(`UPDATE games SET chain_game_id = $1 WHERE id = $2`, [chain.gameId, gameId]);
    const list = players.map(p => ({ wallet: p.wallet, socketId: p.socketId }));
    for (const p of players) { this.io?.to(p.socketId).emit("match:found", { gameId, chainGameId: chain.gameId, players: list.map(pl => pl.wallet), teamSize }); }
    return { status: "matched", gameId, players: list };
  }

  _timeout(teamSize) {
    const q = this.queues[teamSize];
    for (const p of q) { this.io?.to(p.socketId).emit("match:failed", { reason: "匹配超时" }); }
    this.queues[teamSize] = []; delete this.timers[teamSize];
  }

  _broadcast(teamSize) {
    const q = this.queues[teamSize];
    for (const p of q) { this.io?.to(p.socketId).emit("match:update", { current: q.length, total: teamSize, players: q.map(pl => pl.wallet) }); }
  }
}
export default new MatchmakingService();
