import config from "../config/index.js";
import { query, withTransaction } from "../config/database.js";
import { generateInviteCode } from "../utils/inviteCode.js";
import contractService from "./contract.js";
import gameService from "./game.js";

class RoomService {
  constructor() { this.rooms = {}; this.pendingCreates = {}; this.io = null; }
  setIO(io) { this.io = io; }

  _findSocketIdByWallet(wallet) {
    if (!wallet || !this.io?.sockets?.sockets) return null;
    const matchedSocket = [...this.io.sockets.sockets.values()].find((candidate) => candidate.data?.wallet === wallet);
    return matchedSocket?.id || null;
  }

  _clearRoomTimer(room) {
    if (room?.timer) clearTimeout(room.timer);
    if (room) room.timer = null;
  }

  _scheduleRoomExpiry(code, delayMs) {
    const room = this.rooms[code];
    if (!room) return null;
    if (delayMs <= 0) {
      room.timer = setTimeout(() => this._expire(code), 0);
      return room.timer;
    }
    room.timer = setTimeout(() => this._expire(code), delayMs);
    return room.timer;
  }

  getRoomByWallet(wallet) {
    for (const [inviteCode, room] of Object.entries(this.rooms)) {
      const player = room.players.find((entry) => entry.wallet === wallet);
      if (player) return { inviteCode, room, player };
    }
    return null;
  }

  isInRoom(wallet) {
    return !!this.getRoomByWallet(wallet);
  }

  getPendingCreateByWallet(wallet) {
    for (const pending of Object.values(this.pendingCreates)) {
      if (pending?.wallet === wallet) return pending;
    }
    return null;
  }

  isCreatingRoom(wallet) {
    return !!this.getPendingCreateByWallet(wallet);
  }

  rebindPlayerSocket(wallet, socketId) {
    if (!wallet || !socketId) return null;
    const located = this.getRoomByWallet(wallet);
    if (!located) return null;
    located.player.socketId = socketId;
    const payment = gameService.getRoomPayment(located.room.gameId);
    if (payment?.players?.length) {
      const paymentPlayer = payment.players.find((player) => player.wallet === wallet);
      if (paymentPlayer) paymentPlayer.socketId = socketId;
    }
    return {
      inviteCode: located.inviteCode,
      gameId: located.room.gameId,
      chainGameId: located.room.chainGameId,
      phase: payment
        ? ((payment.chainGameId || located.room.chainGameId || wallet === located.room.owner) ? "payment" : "preparing")
        : "waiting",
    };
  }

  async createRoom(maxPlayers, wallet, socketId) {
    for (const c in this.rooms) { if (this.rooms[c].players.find(p => p.wallet === wallet)) return { error: "Already in a room" }; }
    const code = generateInviteCode();
    const createdAt = Date.now();
    const expiresAt = createdAt + config.game.roomExpiry;
    const res = await query(`INSERT INTO games (mode, max_players, invite_code, state) VALUES ('room', $1, $2, 'waiting') RETURNING id`, [maxPlayers, code]);
    const gameId = res.rows[0].id;
    await query(
      `INSERT INTO game_players (game_id, wallet_address, paid, is_owner)
       VALUES ($1, $2, false, true)
       ON CONFLICT DO NOTHING`,
      [gameId, wallet]
    );
    const room = {
      gameId,
      chainGameId: null,
      maxPlayers,
      players: [{ wallet, socketId }],
      owner: wallet,
      createdAt,
      expiresAt,
      timer: setTimeout(() => this._expire(code), config.game.roomExpiry),
      paid: {},
      transitioning: false,
      preparing: false,
      prepareStartedAt: null,
      _preparePromise: null,
    };
    this.rooms[code] = room;
    return { status: "created", inviteCode: code, gameId, chainGameId: null, maxPlayers, expiresAt };
  }

  async joinRoom(code, wallet, socketId) {
    const r = this.rooms[code]; if (!r) return { error: "房间不存在" }; if (r.players.length >= r.maxPlayers) return { error: "房间已满" };
    if (r.transitioning) return { error: "房间正在更新，请稍后重试" };
    if (r.players.find(p => p.wallet === wallet)) return { error: "已在房间中" };
    for (const c in this.rooms) { if (c !== code && this.rooms[c].players.find(p => p.wallet === wallet)) return { error: "已在其他房间中" }; }
    r.players.push({ wallet, socketId });
    await query(`INSERT INTO game_players (game_id, wallet_address, paid) VALUES ($1, $2, false) ON CONFLICT DO NOTHING`, [r.gameId, wallet]);
    if (r.players.length === r.maxPlayers) {
      await query(`UPDATE games SET state = 'payment' WHERE id = $1`, [r.gameId]);
      return {
        status: "full",
        inviteCode: code,
        gameId: r.gameId,
        chainGameId: r.chainGameId,
        paymentOpen: !!r.chainGameId,
        owner: r.owner,
        current: r.players.length,
        total: r.maxPlayers,
        players: r.players.map((p) => p.wallet),
        paymentTimeout: config.game.paymentTimeout,
      };
    }
    this._broadcast(code);
    return { status: "joined", gameId: r.gameId, current: r.players.length, total: r.maxPlayers, players: r.players.map(p => p.wallet), expiresAt: r.expiresAt };
  }

  async awaitChainReady(code) {
    const r = this.rooms[code];
    if (!r) return;
    if (r._preparePromise) await r._preparePromise;
  }

  setChainGameId(code, chainGameId) {
    const room = this.rooms[code];
    if (!room || !chainGameId) return null;
    room.chainGameId = chainGameId;
    const payment = gameService.getRoomPayment(room.gameId);
    if (payment) {
      payment.chainGameId = chainGameId;
      payment.paymentOpen = true;
    }
    return room;
  }

  clearRoomExpiry(code) {
    const room = this.rooms[code];
    if (!room) return false;
    this._clearRoomTimer(room);
    return true;
  }

  async _closeRoom(code, reason, state = "cancelled", event = "room:dissolved") {
    const r = this.rooms[code];
    if (!r) return false;
    if (r.transitioning) return false;
    r.transitioning = true;
    const players = [...r.players];
    const chainGameId = r.chainGameId;
    const gameId = r.gameId;

    // Immediately clean up memory and notify players
    this._clearRoomTimer(r);
    delete this.rooms[code];
    gameService.clearRoomPayment(gameId);
    for (const p of players) {
      if (p?.socketId) this.io?.to(p.socketId).emit(event, { reason });
    }

    // DB update and chain cancel run in background
    query(`UPDATE games SET state = $1 WHERE id = $2`, [state, gameId]).catch((error) => {
      console.error("[Room] failed to update game state on close", { code, gameId, state, error: error?.message || error });
    });
    if (chainGameId) {
      contractService.cancelGame(chainGameId).catch((error) => {
        console.error("[Room] background cancelGame failed", { code, chainGameId, error: error?.message || error });
      });
    }
    return true;
  }

  async _abortPaymentRoom(code, reason) {
    return this._closeRoom(code, reason, "failed", "room:payment:failed");
  }

  async _rebuildWaitingRoom(code, removedWallet, leaveReason) {
    const room = this.rooms[code];
    if (!room) return false;
    const removedPlayer = room.players.find((player) => player.wallet === removedWallet) || null;

    const remainingPlayers = room.players
      .filter((player) => player.wallet !== removedWallet)
      .map((player) => ({ ...player }));

    if (remainingPlayers.length === 0) {
      return this._closeRoom(code, leaveReason);
    }

    const remainingMs = room.expiresAt - Date.now();
    if (remainingMs <= 0) {
      return this._expire(code);
    }

    const newOwner = remainingPlayers.find((player) => player.wallet === room.owner)?.wallet || remainingPlayers[0].wallet;
    const fallbackReason = "A player left and the room could not be refreshed. Please create a new room.";
    let newGameId = null;
    let newChainGameId = null;
    let oldChainCancelled = false;

    room.transitioning = true;
    this._clearRoomTimer(room);

    if (!room.chainGameId) {
      try {
        await withTransaction(async (db) => {
          await db.query(
            `UPDATE games
             SET state = 'cancelled', error_message = $1
             WHERE id = $2`,
            [leaveReason, room.gameId],
          );

          const nextGame = await db.query(
            `INSERT INTO games (mode, max_players, invite_code, state, created_at)
             VALUES ('room', $1, $2, 'waiting', $3)
             RETURNING id`,
            [room.maxPlayers, code, new Date(room.createdAt)],
          );

          newGameId = nextGame.rows[0].id;

          for (const player of remainingPlayers) {
            await db.query(
              `INSERT INTO game_players (game_id, wallet_address, paid, is_owner)
               VALUES ($1, $2, false, $3)`,
              [newGameId, player.wallet, player.wallet === newOwner],
            );
          }
        });

        const rebuiltRoom = {
          gameId: newGameId,
          chainGameId: null,
          maxPlayers: room.maxPlayers,
          players: remainingPlayers,
          owner: newOwner,
          createdAt: room.createdAt,
          expiresAt: room.expiresAt,
          timer: null,
          paid: {},
          transitioning: false,
          preparing: false,
          prepareStartedAt: null,
          _preparePromise: null,
        };
        this.rooms[code] = rebuiltRoom;
        this._scheduleRoomExpiry(code, remainingMs);
        gameService.clearRoomPayment(room.gameId);
        this._broadcast(code);
        return true;
      } catch (error) {
        console.error("[Room] waiting room local rebuild failed", { inviteCode: code, removedWallet, error: error?.message || error });
        for (const player of remainingPlayers) {
          if (player?.socketId) this.io?.to(player.socketId).emit("room:dissolved", { reason: fallbackReason });
        }
        delete this.rooms[code];
        gameService.clearRoomPayment(room.gameId);
        return false;
      }
    }

    try {
      await contractService.cancelGame(room.chainGameId);
      oldChainCancelled = true;
      newChainGameId = await contractService.ownerCreateRoom(room.maxPlayers, code, newOwner);

      await withTransaction(async (db) => {
        await db.query(
          `UPDATE games
           SET state = 'cancelled', error_message = $1
           WHERE id = $2`,
          [leaveReason, room.gameId],
        );

        const nextGame = await db.query(
          `INSERT INTO games (chain_game_id, mode, max_players, invite_code, state, created_at)
           VALUES ($1, 'room', $2, $3, 'waiting', $4)
           RETURNING id`,
          [newChainGameId, room.maxPlayers, code, new Date(room.createdAt)],
        );

        newGameId = nextGame.rows[0].id;

        if (!newChainGameId) {
          newChainGameId = newGameId;
          await db.query(`UPDATE games SET chain_game_id = $1 WHERE id = $2`, [newChainGameId, newGameId]);
        }

        for (const player of remainingPlayers) {
          await db.query(
            `INSERT INTO game_players (game_id, wallet_address, paid, is_owner)
             VALUES ($1, $2, false, $3)`,
            [newGameId, player.wallet, player.wallet === newOwner],
          );
        }
      });

      for (const player of remainingPlayers) {
        if (player.wallet === newOwner) continue;
        await contractService.ownerJoinRoom(code, player.wallet);
      }

      this.rooms[code] = {
        gameId: newGameId,
        chainGameId: newChainGameId,
        maxPlayers: room.maxPlayers,
        players: remainingPlayers,
        owner: newOwner,
        createdAt: room.createdAt,
        expiresAt: room.expiresAt,
        timer: null,
        paid: {},
        transitioning: false,
        preparing: false,
        prepareStartedAt: null,
        _preparePromise: null,
      };
      this._scheduleRoomExpiry(code, remainingMs);
      gameService.clearRoomPayment(room.gameId);
      this._broadcast(code);
      return true;
    } catch (error) {
      console.error("[Room] waiting room rebuild failed", { inviteCode: code, removedWallet, error: error?.message || error });

      if (!oldChainCancelled) {
        const retryReason = "Room update failed. Please try again.";
        room.transitioning = false;
        this._scheduleRoomExpiry(code, remainingMs);
        if (removedPlayer?.socketId) this.io?.to(removedPlayer.socketId).emit("room:error", { message: retryReason });
        for (const player of room.players) {
          if (player.wallet === removedWallet || !player?.socketId) continue;
          this.io?.to(player.socketId).emit("room:error", { message: retryReason });
        }
        this._broadcast(code);
        return false;
      }

      if (newGameId) {
        try {
          await query(
            `UPDATE games
             SET state = 'cancelled', error_message = $1
             WHERE id = $2`,
            [fallbackReason, newGameId],
          );
        } catch (dbError) {
          console.error("[Room] failed to mark rebuilt room as cancelled", { inviteCode: code, gameId: newGameId, error: dbError?.message || dbError });
        }
      }

      if (newChainGameId) {
        try {
          await contractService.cancelGame(newChainGameId);
        } catch (chainError) {
          console.error("[Room] failed to cancel rebuilt chain room", { inviteCode: code, chainGameId: newChainGameId, error: chainError?.message || chainError });
        }
      }

      try {
        await query(
          `UPDATE games
           SET state = 'cancelled', error_message = $1
           WHERE id = $2`,
          [fallbackReason, room.gameId],
        );
      } catch (dbError) {
        console.error("[Room] failed to persist waiting-room rebuild failure", { inviteCode: code, gameId: room.gameId, error: dbError?.message || dbError });
      }

      for (const player of remainingPlayers) {
        if (player?.socketId) this.io?.to(player.socketId).emit("room:dissolved", { reason: fallbackReason });
      }
      delete this.rooms[code];
      gameService.clearRoomPayment(room.gameId);
      return false;
    }
  }

  async leaveRoom(wallet) {
    for (const c in this.rooms) {
      const r = this.rooms[c];
      if (r.transitioning) continue;
      const i = r.players.findIndex(p => p.wallet === wallet);
      if (i === -1) continue;
      const payment = gameService.getRoomPayment(r.gameId);
      if (payment) {
        r.players.splice(i, 1);
        const reason = wallet === r.owner ? "Host left during payment" : "A player left during payment";
        await this._abortPaymentRoom(c, reason);
        return true;
      }
      const reason = wallet === r.owner ? "Host left the room" : "A player left the room";
      await this._rebuildWaitingRoom(c, wallet, reason);
      return true;
    }
    return false;
  }

  leaveBySocket(sid) {
    for (const c in this.rooms) {
      const r = this.rooms[c];
      if (r.transitioning) continue;
      const i = r.players.findIndex(p => p.socketId === sid);
      if (i === -1) continue;
      const w = r.players[i].wallet;
      const payment = gameService.getRoomPayment(r.gameId);
      if (payment) {
        r.players[i].socketId = null;
        const paymentPlayer = payment.players.find((player) => player.wallet === w);
        if (paymentPlayer) paymentPlayer.socketId = null;
        return;
      }
      const reason = w === r.owner ? "Host disconnected" : "A player disconnected";
      void this._rebuildWaitingRoom(c, w, reason).catch((error) => {
        console.error("[Room] waiting room rebuild on disconnect failed", { inviteCode: c, error: error?.message || error });
      });
      return;
    }
  }

  async dissolveRoom(code, wallet) {
    const r = this.rooms[code]; if (!r) return { error: "房间不存在" }; if (r.transitioning) return { error: "房间正在更新，请稍后重试" }; if (r.owner !== wallet) return { error: "只有房主可以解散" };
    await this._closeRoom(code, "Host dissolved the room"); return { status: "dissolved" };
  }

  async _expire(code) {
    const r = this.rooms[code]; if (!r) return;
    await this._closeRoom(code, "Room expired", "expired", "room:expired");
  }

  _broadcast(code) {
    const r = this.rooms[code]; if (!r) return;
    const isFull = r.players.length >= r.maxPlayers;
    const payload = {
      inviteCode: code,
      gameId: r.gameId,
      chainGameId: r.chainGameId,
      paymentOpen: !!r.chainGameId,
      current: r.players.length,
      total: r.maxPlayers,
      players: r.players.map(pl => pl.wallet),
      owner: r.owner,
      expiresAt: isFull ? null : r.expiresAt,
      status: isFull ? "full" : "waiting",
      paymentTimeout: config.game.paymentTimeout,
    };
    for (const p of r.players) {
      if (p?.socketId) this.io?.to(p.socketId).emit("room:update", payload);
    }
  }

  getRoom(code) { return this.rooms[code] || null; }
}
export default new RoomService();
