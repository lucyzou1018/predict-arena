import config from "../config/index.js";
import { query } from "../config/database.js";
import { generateInviteCode } from "../utils/inviteCode.js";
import contractService from "./contract.js";

class MatchmakingService {
  constructor() { this.queues = { 2: [], 3: [], 4: [], 5: [] }; this.timers = {}; this.deadlines = {}; this.io = null; }
  setIO(io) { this.io = io; }

  _clearTimer(teamSize) {
    if (!this.timers[teamSize]) return;
    clearTimeout(this.timers[teamSize]);
    delete this.timers[teamSize];
  }

  _clearDeadline(teamSize) {
    delete this.deadlines[teamSize];
  }

  _setDeadline(teamSize, timeoutMs = config.game.matchTimeout) {
    this.deadlines[teamSize] = Date.now() + timeoutMs;
  }

  _getRemaining(teamSize) {
    const deadline = this.deadlines[teamSize];
    if (!deadline) return Math.ceil(config.game.matchTimeout / 1000);
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  }

  getQueueEntry(wallet) {
    for (const [teamSize, queue] of Object.entries(this.queues)) {
      const entry = queue.find((player) => player.wallet === wallet);
      if (entry) return { ...entry, teamSize: Number(teamSize) };
    }
    return null;
  }

  isQueued(wallet) {
    return !!this.getQueueEntry(wallet);
  }

  addPlayer(teamSize, wallet, socketId) {
    const q = this.queues[teamSize];
    if (!q) return { error: "Invalid team size" };
    if (q.find(p => p.wallet === wallet)) return { error: "Already in queue" };
    for (const s in this.queues) { if (this.queues[s].find(p => p.wallet === wallet)) return { error: "Already in another queue" }; }
    q.push({ wallet, socketId, joinedAt: Date.now() });
    if (q.length === 1) {
      this._setDeadline(teamSize);
      this._clearTimer(teamSize);
      this.timers[teamSize] = setTimeout(() => this._timeout(teamSize), config.game.matchTimeout);
    }
    this._broadcast(teamSize);
    if (q.length === teamSize) return this._formTeam(teamSize);
    return { status: "queued", position: q.length, total: teamSize, remaining: this._getRemaining(teamSize) };
  }

  removePlayer(wallet) {
    for (const s in this.queues) {
      const i = this.queues[s].findIndex(p => p.wallet === wallet);
      if (i !== -1) {
        this.queues[s].splice(i, 1);
        if (this.queues[s].length === 0) {
          this._clearTimer(parseInt(s, 10));
          this._clearDeadline(parseInt(s, 10));
        }
        this._broadcast(parseInt(s, 10));
        return true;
      }
    }
    return false;
  }

  removeBySocket(sid) {
    for (const s in this.queues) {
      const i = this.queues[s].findIndex(p => p.socketId === sid);
      if (i !== -1) {
        this.queues[s].splice(i, 1);
        if (this.queues[s].length === 0) {
          this._clearTimer(parseInt(s, 10));
          this._clearDeadline(parseInt(s, 10));
        }
        this._broadcast(parseInt(s, 10));
        return;
      }
    }
  }

  async _formTeam(teamSize) {
    const q = this.queues[teamSize]; const players = q.splice(0, teamSize);
    this._clearTimer(teamSize);
    this._clearDeadline(teamSize);
    const list = players.map(p => ({ wallet: p.wallet, socketId: p.socketId }));
    const inviteCode = generateInviteCode();
    for (const p of players) {
      this.io?.to(p.socketId).emit("match:full", { current: teamSize, total: teamSize, players: list.map(pl => pl.wallet), teamSize, inviteCode });
    }
    let gameId = null;
    try {
      const res = await query(`INSERT INTO games (mode, max_players, state) VALUES ('random', $1, 'matching') RETURNING id`, [teamSize]);
      gameId = res.rows[0].id;
      for (const p of players) {
        await query(
          `INSERT INTO game_players (game_id, wallet_address, paid)
           VALUES ($1, $2, false)
           ON CONFLICT DO NOTHING`,
          [gameId, p.wallet]
        );
      }
      const chainGameId = await contractService.ownerCreateGame(teamSize, players[0].wallet) || gameId;
      for (const p of players.slice(1)) await contractService.ownerJoinGame(chainGameId, p.wallet);
      await query(`UPDATE games SET chain_game_id = $1 WHERE id = $2`, [chainGameId, gameId]);
      for (const p of players) { this.io?.to(p.socketId).emit("match:found", { gameId, chainGameId, players: list.map(pl => pl.wallet), teamSize, inviteCode }); }
      return { status: "matched", gameId, chainGameId, players: list };
    } catch (error) {
      if (gameId) {
        await query(`DELETE FROM game_players WHERE game_id = $1`, [gameId]);
        await query(`DELETE FROM games WHERE id = $1`, [gameId]);
      }
      for (const p of players) {
        if (p?.socketId) this.io?.to(p.socketId).emit("match:error", { message: error?.message || "Matchmaking failed" });
      }
      error.broadcasted = true;
      throw error;
    }
  }

  _timeout(teamSize) {
    const q = this.queues[teamSize];
    for (const p of q) { this.io?.to(p.socketId).emit("match:failed", { reason: "匹配超时" }); }
    this.queues[teamSize] = [];
    this._clearTimer(teamSize);
    this._clearDeadline(teamSize);
  }

  _broadcast(teamSize) {
    const q = this.queues[teamSize];
    const remaining = this._getRemaining(teamSize);
    for (const p of q) { this.io?.to(p.socketId).emit("match:update", { current: q.length, total: teamSize, players: q.map(pl => pl.wallet), remaining }); }
  }
}
export default new MatchmakingService();
