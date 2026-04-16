import config from "../config/index.js";
import { query, withTransaction } from "../config/database.js";
import priceService from "./price.js";
import settlementService from "./settlement.js";
import contractService from "./contract.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SETTLEMENT_FAILURE_MESSAGE = "Settlement sync failed. Funds remain safe on-chain. Use this page or history to claim reward or refund when available.";
const SETTLEMENT_PRICE_FAILURE_MESSAGE = "Settlement price is temporarily unavailable. Funds remain safe on-chain. Use this page or history to claim reward or refund when available.";
const STARTUP_RECOVERY_MESSAGE = "This battle was interrupted while the server was offline. Funds remain safe on-chain. Use history to claim reward or refund when available.";

class GameService {
  constructor() { this.activeGames = {}; this.io = null; this.roomPayments = {}; this.startingGames = new Set(); }
  setIO(io) { this.io = io; }

  getRoomPaymentByWallet(wallet) {
    for (const session of Object.values(this.roomPayments)) {
      const player = session?.players?.find((entry) => entry.wallet === wallet);
      if (player) return session;
    }
    return null;
  }

  isInRoomPayment(wallet) {
    return !!this.getRoomPaymentByWallet(wallet);
  }

  getActiveGameByWallet(wallet) {
    for (const game of Object.values(this.activeGames)) {
      const player = game?.players?.find((entry) => entry.wallet === wallet);
      if (player) return game;
    }
    return null;
  }

  isInActiveGame(wallet) {
    return !!this.getActiveGameByWallet(wallet);
  }

  _getActiveGameRemaining(game) {
    if (!game) return 0;
    if (game.phase === "settling") {
      const settleStartedAt = game.settleStartedAt || Date.now();
      return Math.ceil(Math.max(0, config.game.settleDelay - (Date.now() - settleStartedAt)) / 1000);
    }
    return Math.ceil(Math.max(0, config.game.predictTimeout - (Date.now() - game.startedAt)) / 1000);
  }

  _buildActiveGameSnapshot(game) {
    if (!game) return null;
    return {
      gameId: game.gameId,
      chainGameId: game.chainGameId,
      phase: game.phase === "settling" ? "settling" : "predicting",
      basePrice: game.basePrice,
      currentPrice: priceService.getPrice() || game.basePrice,
      players: game.players.map((player) => player.wallet),
      totalPlayers: game.players.length,
      totalPredicted: Object.keys(game.predictions || {}).length,
      remaining: this._getActiveGameRemaining(game),
      predictTimeout: config.game.predictTimeout,
      predictSafeBuffer: config.game.predictSafeBuffer,
      settleDelay: config.game.settleDelay,
      predictionDeadline: game.predictionDeadline || null,
    };
  }

  rebindPlayerSocket(wallet, socket) {
    if (!wallet || !socket) return null;
    const game = this.getActiveGameByWallet(wallet);
    if (!game) return null;
    const player = game.players.find((entry) => entry.wallet === wallet);
    if (!player) return null;
    player.socketId = socket.id;
    socket.join(`game:${game.gameId}`);
    return this._buildActiveGameSnapshot(game);
  }

  _emitToPlayers(players, event, payload) {
    for (const player of players || []) {
      if (player?.socketId) this.io?.to(player.socketId).emit(event, payload);
    }
  }

  _clearGameTimers(game) {
    if (!game) return;
    if (game.predictTimer) clearTimeout(game.predictTimer);
    if (game.settleTimer) clearTimeout(game.settleTimer);
    if (game.countdownInterval) clearInterval(game.countdownInterval);
    if (game.settleInterval) clearInterval(game.settleInterval);
  }

  _cleanupActiveGame(gameId) {
    const game = this.activeGames[gameId];
    if (!game) return;
    this._clearGameTimers(game);
    delete this.activeGames[gameId];
  }

  _buildSettlementFailureMessage(error) {
    const reason = `${error?.message || ""}`.toLowerCase();
    if (reason.includes("settlement price unavailable")) return SETTLEMENT_PRICE_FAILURE_MESSAGE;
    return SETTLEMENT_FAILURE_MESSAGE;
  }

  async _markSettlementFailed(gameId, message) {
    await query(
      "UPDATE games SET state='failed',settlement_price=NULL,settled_at=NULL,failed_at=NOW(),error_message=$1 WHERE id=$2 AND state<>'settled'",
      [message, gameId],
    );
  }

  async recoverInterruptedGames() {
    const recovered = await query(
      `UPDATE games
       SET state='failed',
           settlement_price=NULL,
           settled_at=NULL,
           failed_at=COALESCE(failed_at, NOW()),
           error_message=COALESCE(NULLIF(error_message, ''), $1)
       WHERE state='active'
       RETURNING id`,
      [STARTUP_RECOVERY_MESSAGE],
    );
    if (recovered.rowCount > 0) {
      console.warn(`[Game] Recovered ${recovered.rowCount} interrupted active games after startup`);
    }
    return recovered.rowCount;
  }

  startRoomPayment(gameId, inviteCode, players) {
    this.roomPayments[gameId] = { inviteCode, players, startedAt: Date.now(), paid: new Set(), timer: null };
    return this.roomPayments[gameId];
  }

  getRoomPayment(gameId) {
    return this.roomPayments[gameId] || null;
  }

  clearRoomPayment(gameId) {
    const s = this.roomPayments[gameId];
    if (s?.timer) clearTimeout(s.timer);
    delete this.roomPayments[gameId];
  }

  async confirmRoomPayment(gameId, chainGameId, wallet) {
    const targetChainGameId = chainGameId || gameId;
    let paidOnChain = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      paidOnChain = await contractService.isPlayerPaid(targetChainGameId, wallet);
      if (paidOnChain) break;
      if (attempt < 4) await sleep(800);
    }
    if (!paidOnChain) throw new Error("On-chain payment not confirmed");
    await query("UPDATE game_players SET paid=true, paid_at=NOW() WHERE game_id=$1 AND wallet_address=$2", [gameId, wallet]);
    const r = await query("SELECT wallet_address, paid FROM game_players WHERE game_id=$1", [gameId]);
    const allPaidDb = r.rows.length > 0 && r.rows.every(x => x.paid === true);
    const allPaidChain = await contractService.allPlayersPaid(targetChainGameId);
    const allPaid = allPaidDb && allPaidChain;
    if (allPaid) await query("UPDATE games SET state='payment' WHERE id=$1", [gameId]);
    return { allPaid, paidCount: r.rows.filter(x => x.paid).length, total: r.rows.length };
  }

  async startGame(gameId, chainGameId, players) {
    if (this.activeGames[gameId]) {
      return this.activeGames[gameId].predictionDeadline || null;
    }
    if (this.startingGames.has(gameId)) {
      return null;
    }
    this.startingGames.add(gameId);
    try {
    const basePrice = priceService.getPrice();
    if (!basePrice || basePrice <= 0) {
      this._emitToPlayers(players, "game:error", { message: "BTC price unavailable" });
      return;
    }
    const chainPredictionDeadline = await contractService.startGame(chainGameId, Math.round(basePrice * 100));
    const startedAt = Date.now();
    const game = {
      gameId,
      chainGameId,
      players,
      predictions: {},
      basePrice,
      phase: "predicting",
      startedAt,
      predictionDeadline: chainPredictionDeadline || Math.floor((startedAt + config.game.predictTimeout - (config.game.predictSafeBuffer || 0)) / 1000),
    };
    this.activeGames[gameId] = game;
    await query(
      "UPDATE games SET state='active',base_price=$1,started_at=NOW(),settlement_price=NULL,settled_at=NULL,failed_at=NULL,error_message=NULL WHERE id=$2",
      [basePrice, gameId],
    );
    for (const p of players) await query("INSERT INTO game_players(game_id,wallet_address,paid)VALUES($1,$2,true)ON CONFLICT DO NOTHING", [gameId, p.wallet]);

    const room = `game:${gameId}`;
    for (const p of players) {
      if (!p.socketId) continue;
      const s = this.io?.sockets.sockets.get(p.socketId);
      if (s) s.join(room);
    }
    console.log(`[Game] #${gameId} started base=$${basePrice} players=${players.length}`);
    this.io?.to(room).emit("game:start", {
      gameId,
      chainGameId,
      basePrice,
      players: players.map(p => p.wallet),
      predictTimeout: config.game.predictTimeout,
      predictSafeBuffer: config.game.predictSafeBuffer,
      predictionDeadline: game.predictionDeadline,
    });

    game.countdownInterval = setInterval(() => {
      const rem = Math.max(0, config.game.predictTimeout - (Date.now() - game.startedAt));
      this.io?.to(room).emit("game:countdown", { phase: "predicting", remaining: Math.ceil(rem / 1000), currentPrice: priceService.getPrice() });
      if (rem <= 0) clearInterval(game.countdownInterval);
    }, 1000);
    game.predictTimer = setTimeout(() => this._endPredict(gameId), config.game.predictTimeout);
    return game.predictionDeadline;
    } finally {
      this.startingGames.delete(gameId);
    }
  }

  async confirmPrediction(gameId, wallet, prediction) {
    const g = this.activeGames[gameId]; if (!g) return { error: "Game not found" };
    if (g.phase !== "predicting") return { error: "Prediction phase ended" };
    if (!g.players.find(p => p.wallet === wallet)) return { error: "Not in this game" };
    if (prediction !== "up" && prediction !== "down") return { error: "Invalid prediction" };
    const expectedValue = prediction === "up" ? 1 : 2;

    if (g.predictions[wallet]) {
      return g.predictions[wallet] === prediction ? { status: "ok" } : { error: "Prediction already submitted" };
    }

    let onchainPrediction = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const playerState = await contractService.getPlayerPrediction(g.chainGameId, wallet);
      onchainPrediction = Number(playerState?.prediction || 0);
      if (onchainPrediction === expectedValue) break;
      if (onchainPrediction !== 0) {
        return { error: "Prediction already submitted" };
      }
      if (attempt < 5) await sleep(400);
    }

    if (onchainPrediction !== expectedValue) {
      return { error: "Prediction is not confirmed on-chain yet. Please wait for wallet confirmation and try again." };
    }

    g.predictions[wallet] = prediction;
    this.io?.to(`game:${gameId}`).emit("game:prediction", { wallet, predicted: true, totalPredicted: Object.keys(g.predictions).length, totalPlayers: g.players.length });
    if (Object.keys(g.predictions).length === g.players.length) { clearTimeout(g.predictTimer); clearInterval(g.countdownInterval); this._endPredict(gameId); }
    return { status: "ok" };
  }

  async _endPredict(gameId) {
    const g = this.activeGames[gameId]; if (!g || g.phase !== "predicting") return;
    g.phase = "settling"; clearInterval(g.countdownInterval);
    const room = `game:${gameId}`;
    this.io?.to(room).emit("game:phase", { phase: "settling", settleDelay: config.game.settleDelay });
    const t0 = Date.now();
    g.settleStartedAt = t0;
    g.settleInterval = setInterval(() => {
      const rem = Math.max(0, config.game.settleDelay - (Date.now() - t0));
      this.io?.to(room).emit("game:countdown", { phase: "settling", remaining: Math.ceil(rem / 1000), currentPrice: priceService.getPrice() });
      if (rem <= 0) clearInterval(g.settleInterval);
    }, 1000);
    g.settleTimer = setTimeout(() => {
      clearInterval(g.settleInterval);
      void this._settle(gameId);
    }, config.game.settleDelay);
  }

  async _settle(gameId) {
    const g = this.activeGames[gameId]; if (!g) return;
    try {
      const sp = priceService.getPrice();
      if (!sp || sp <= 0) {
        throw new Error("Settlement price unavailable");
      }

      if (g.chainGameId) {
        await contractService.settleGame(g.chainGameId, Math.round(sp * 100));
      }

      g.phase = "settled";
      const result = settlementService.calculate(g.players.map(p => p.wallet), g.predictions, g.basePrice, sp);

      await withTransaction(async (db) => {
        await db.query(
          "UPDATE games SET state='settled',settlement_price=$1,settled_at=NOW(),failed_at=NULL,error_message=NULL WHERE id=$2",
          [sp, gameId],
        );
        for (const playerResult of result.playerResults) {
          await db.query(
            "UPDATE game_players SET prediction=$1,is_correct=$2,reward=$3,predicted_at=NOW() WHERE game_id=$4 AND wallet_address=$5",
            [playerResult.prediction, playerResult.isCorrect, playerResult.reward, gameId, playerResult.wallet],
          );
          if (playerResult.isCorrect) {
            await db.query(
              "INSERT INTO users(wallet_address,wins,total_earned)VALUES($1,1,$2)ON CONFLICT(wallet_address)DO UPDATE SET wins=users.wins+1,total_earned=users.total_earned+$2",
              [playerResult.wallet, playerResult.reward],
            );
          } else {
            await db.query(
              "INSERT INTO users(wallet_address,losses,total_lost)VALUES($1,1,$2)ON CONFLICT(wallet_address)DO UPDATE SET losses=users.losses+1,total_lost=users.total_lost+$2",
              [playerResult.wallet, playerResult.lost],
            );
          }
        }
      });

      for (const player of g.players) {
        const myResult = result.playerResults.find((row) => row.wallet === player.wallet);
        if (!player.socketId) continue;
        this.io?.to(player.socketId).emit("game:result", {
          gameId,
          chainGameId: g.chainGameId,
          basePrice: g.basePrice,
          settlementPrice: sp,
          direction: sp > g.basePrice ? "up" : sp < g.basePrice ? "down" : "flat",
          myResult,
          platformFee: result.platformFee,
        });
      }
      console.log(`[Game] #${gameId} settled $${g.basePrice} -> $${sp}`);
    } catch (error) {
      const message = this._buildSettlementFailureMessage(error);
      g.phase = "failed";
      console.error(`[Game] #${gameId} settlement failed`, error);
      try {
        await this._markSettlementFailed(gameId, message);
      } catch (dbError) {
        console.error(`[Game] #${gameId} failed to persist settlement failure`, dbError);
      }
      this._emitToPlayers(g.players, "game:failed", {
        gameId,
        chainGameId: g.chainGameId,
        basePrice: g.basePrice,
        message,
      });
    } finally {
      this._cleanupActiveGame(gameId);
    }
  }
}
export default new GameService();
