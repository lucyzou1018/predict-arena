import config from "../config/index.js";
import { query } from "../config/database.js";
import { generateInviteCode } from "../utils/inviteCode.js";

class RoomService {
  constructor() { this.rooms = {}; this.io = null; }
  setIO(io) { this.io = io; }

  async createRoom(maxPlayers, wallet, socketId) {
    for (const c in this.rooms) { if (this.rooms[c].players.find(p => p.wallet === wallet)) return { error: "Already in a room" }; }
    const code = generateInviteCode();
    const res = await query(`INSERT INTO games (mode, max_players, invite_code, state) VALUES ('room', $1, $2, 'waiting') RETURNING id`, [maxPlayers, code]);
    const gameId = res.rows[0].id;
    await query(`UPDATE games SET chain_game_id = $1 WHERE id = $2`, [gameId, gameId]);
    await query(`INSERT INTO game_players (game_id, wallet_address, paid, is_owner) VALUES ($1, $2, false, true) ON CONFLICT DO NOTHING`, [gameId, wallet]);
    const expiresAt = Date.now() + config.game.roomExpiry;
    this.rooms[code] = { gameId, chainGameId: gameId, maxPlayers, players: [{ wallet, socketId }], owner: wallet, createdAt: Date.now(), expiresAt, timer: setTimeout(() => this._expire(code), config.game.roomExpiry), paid: {} };
    return { inviteCode: code, gameId, chainGameId: gameId, maxPlayers, expiresAt };
  }

  async joinRoom(code, wallet, socketId) {
    const r = this.rooms[code]; if (!r) return { error: "房间不存在" }; if (r.players.length >= r.maxPlayers) return { error: "房间已满" };
    if (r.players.find(p => p.wallet === wallet)) return { error: "已在房间中" };
    for (const c in this.rooms) { if (c !== code && this.rooms[c].players.find(p => p.wallet === wallet)) return { error: "已在其他房间中" }; }
    r.players.push({ wallet, socketId });
    await query(`INSERT INTO game_players (game_id, wallet_address, paid) VALUES ($1, $2, false) ON CONFLICT DO NOTHING`, [r.gameId, wallet]);
    this._broadcast(code);
    if (r.players.length === r.maxPlayers) { clearTimeout(r.timer); return { status: "full", gameId: r.gameId, chainGameId: r.chainGameId, players: r.players.map(p => p.wallet) }; }
    return { status: "joined", gameId: r.gameId, current: r.players.length, total: r.maxPlayers, players: r.players.map(p => p.wallet), expiresAt: r.expiresAt };
  }

  async leaveRoom(wallet) {
    for (const c in this.rooms) { const r = this.rooms[c]; const i = r.players.findIndex(p => p.wallet === wallet); if (i !== -1) { r.players.splice(i, 1); this._broadcast(c); if (wallet === r.owner) await this._dissolve(c, "房主已离开"); return true; } }
    return false;
  }

  leaveBySocket(sid) {
    for (const c in this.rooms) { const r = this.rooms[c]; const i = r.players.findIndex(p => p.socketId === sid); if (i !== -1) { const w = r.players[i].wallet; r.players.splice(i, 1); this._broadcast(c); if (w === r.owner) this._dissolve(c, "房主断线"); return; } }
  }

  async dissolveRoom(code, wallet) {
    const r = this.rooms[code]; if (!r) return { error: "房间不存在" }; if (r.owner !== wallet) return { error: "只有房主可以解散" };
    await this._dissolve(code, "房主解散了房间"); return { status: "dissolved" };
  }

  async _dissolve(code, reason) {
    const r = this.rooms[code]; if (!r) return;
    for (const p of r.players) { this.io?.to(p.socketId).emit("room:dissolved", { reason }); }
    await contractService.cancelGame(r.chainGameId);
    await query(`UPDATE games SET state = 'cancelled' WHERE id = $1`, [r.gameId]);
    clearTimeout(r.timer); delete this.rooms[code];
    return { status: "cancelled", gameId: r.gameId };
  }

  async _expire(code) {
    const r = this.rooms[code]; if (!r) return;
    for (const p of r.players) { this.io?.to(p.socketId).emit("room:expired", { reason: "Room expired" }); }
    await contractService.cancelGame(r.chainGameId);
    await query(`UPDATE games SET state = 'expired' WHERE id = $1`, [r.gameId]);
    clearTimeout(r.timer); delete this.rooms[code];
  }

  _broadcast(code) {
    const r = this.rooms[code]; if (!r) return;
    for (const p of r.players) { this.io?.to(p.socketId).emit("room:update", { inviteCode: code, current: r.players.length, total: r.maxPlayers, players: r.players.map(pl => pl.wallet), owner: r.owner, expiresAt: r.expiresAt }); }
  }

  getRoom(code) { return this.rooms[code] || null; }
}
export default new RoomService();
