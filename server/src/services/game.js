import { ethers } from "ethers";
import config from "../config/index.js";
import { query, withTransaction } from "../config/database.js";
import priceService from "./price.js";
import settlementService from "./settlement.js";
import contractService from "./contract.js";
import { buildSettlementTree } from "../utils/settlementMerkle.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SETTLEMENT_FAILURE_MESSAGE = "Settlement sync failed. Funds remain safe on-chain. Use this page or history to claim reward or refund when available.";
const SETTLEMENT_PRICE_FAILURE_MESSAGE = "Settlement price is temporarily unavailable. Funds remain safe on-chain. Use this page or history to claim reward or refund when available.";
const STARTUP_RECOVERY_MESSAGE = "This battle was interrupted while the server was offline. Funds remain safe on-chain. Use history to claim reward or refund when available.";
const ROOM_PAYMENT_CONFIRM_RETRY_MS = parseInt(process.env.ROOM_PAYMENT_CONFIRM_RETRY_MS || "300", 10);
const ROOM_PAYMENT_CONFIRM_MAX_ATTEMPTS = parseInt(process.env.ROOM_PAYMENT_CONFIRM_MAX_ATTEMPTS || "30", 10);
const SETTLEMENT_RECOVERY_RETRY_MS = parseInt(process.env.SETTLEMENT_RECOVERY_RETRY_MS || "2000", 10);
const SETTLEMENT_RECOVERY_MAX_ATTEMPTS = parseInt(process.env.SETTLEMENT_RECOVERY_MAX_ATTEMPTS || "30", 10);
const SETTLEMENT_CHAIN_DEADLINE_BUFFER_MS = parseInt(process.env.SETTLEMENT_CHAIN_DEADLINE_BUFFER_MS || "2500", 10);

class GameService {
  constructor() {
    this.activeGames = {};
    this.io = null;
    this.roomPayments = {};
    this.startingGames = new Set();
    this.settlingGames = new Set();
    this.settlementRecoveries = new Map();
  }
  setIO(io) { this.io = io; }

  _findSocketIdByWallet(wallet) {
    if (!wallet || !this.io?.sockets?.sockets) return null;
    const matchedSocket = [...this.io.sockets.sockets.values()].find((candidate) => candidate.data?.wallet === wallet);
    return matchedSocket?.id || null;
  }

  async _resolveGamePlayers(gameId, fallbackPlayers = []) {
    const fallbackByWallet = new Map(
      (fallbackPlayers || [])
        .filter((player) => player?.wallet)
        .map((player) => [player.wallet.toLowerCase(), { wallet: player.wallet.toLowerCase(), socketId: player.socketId || null }]),
    );

    const dbPlayers = await query(
      `SELECT wallet_address
       FROM game_players
       WHERE game_id = $1
       ORDER BY is_owner DESC, wallet_address ASC`,
      [gameId],
    );

    if (dbPlayers.rowCount === 0) {
      return [...fallbackByWallet.values()];
    }

    return dbPlayers.rows.map((row) => {
      const wallet = row.wallet_address.toLowerCase();
      return {
        wallet,
        socketId: fallbackByWallet.get(wallet)?.socketId || this._findSocketIdByWallet(wallet),
      };
    });
  }

  getRoomPaymentEntryByWallet(wallet) {
    const target = wallet?.toLowerCase?.();
    if (!target) return null;
    for (const [gameId, session] of Object.entries(this.roomPayments)) {
      const player = session?.players?.find((entry) => entry.wallet?.toLowerCase?.() === target);
      if (player) return { gameId: Number(gameId), session, player };
    }
    return null;
  }

  getRoomPaymentByWallet(wallet) {
    return this.getRoomPaymentEntryByWallet(wallet)?.session || null;
  }

  rebindRoomPaymentSocket(wallet, socketId) {
    const entry = this.getRoomPaymentEntryByWallet(wallet);
    if (entry?.player) entry.player.socketId = socketId;
    return entry?.session || null;
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

  _normalizePredictionValue(prediction) {
    if (prediction === 1 || prediction === "1" || prediction === "up") return 1;
    if (prediction === 2 || prediction === "2" || prediction === "down") return 2;
    return 0;
  }

  _buildPredictionSnapshot(game) {
    const snapshot = {};
    for (const [wallet, prediction] of Object.entries(game?.predictions || {})) {
      const normalizedWallet = wallet?.toLowerCase?.();
      if (!normalizedWallet) continue;
      const normalizedPrediction = this._normalizePredictionValue(prediction);
      if (normalizedPrediction) snapshot[normalizedWallet] = normalizedPrediction;
    }
    return snapshot;
  }

  async _hydrateGamePredictions(gameId, predictions = {}) {
    const rows = await query(
      `SELECT wallet_address, prediction
       FROM game_players
       WHERE game_id = $1`,
      [gameId],
    );
    const nextPredictions = { ...predictions };
    for (const row of rows.rows) {
      const wallet = row.wallet_address?.toLowerCase?.();
      const prediction = this._normalizePredictionValue(row.prediction);
      if (!wallet || !prediction) continue;
      nextPredictions[wallet] = prediction;
    }
    return nextPredictions;
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
      playerPredictions: this._buildPredictionSnapshot(game),
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

  _isRetryableSettlementIssue(error) {
    const reason = `${error?.message || error || ""}`.toLowerCase();
    if (!reason) return false;
    if (reason.includes("settlement price unavailable")) return false;
    return (
      reason.includes("timed out") ||
      reason.includes("syncing") ||
      reason.includes("confirmation unavailable") ||
      reason.includes("base sepolia") ||
      reason.includes("network error") ||
      reason.includes("temporarily unavailable") ||
      reason.includes("socket hang up") ||
      reason.includes("econnreset")
    );
  }

  async _waitForChainPredictionDeadline(game) {
    const deadline = Number(game?.predictionDeadline || 0);
    if (!deadline) return;
    const waitMs = (deadline * 1000) + SETTLEMENT_CHAIN_DEADLINE_BUFFER_MS - Date.now();
    if (waitMs > 0) await sleep(waitMs);
  }

  _clearSettlementRecovery(gameId) {
    const recovery = this.settlementRecoveries.get(gameId);
    if (recovery?.timer) clearTimeout(recovery.timer);
    this.settlementRecoveries.delete(gameId);
  }

  async _markSettlementFailed(gameId, message) {
    await query(
      "UPDATE games SET state='failed',settlement_price=NULL,settled_at=NULL,failed_at=NOW(),error_message=$1 WHERE id=$2 AND state<>'settled'",
      [message, gameId],
    );
  }

  _scheduleSettlementRecovery(gameId, computedResult = null) {
    const existing = this.settlementRecoveries.get(gameId);
    if (existing) return;

    const runAttempt = async (attempt) => {
      const game = this.activeGames[gameId];
      if (!game) {
        this._clearSettlementRecovery(gameId);
        return;
      }

      try {
        const recovered = await contractService.recoverSettledGame(game.chainGameId, SETTLEMENT_RECOVERY_RETRY_MS);
        if (recovered) {
          await this._finalizeSettlement(gameId, computedResult);
          this._cleanupActiveGame(gameId);
          this._clearSettlementRecovery(gameId);
          return;
        }
      } catch (error) {
        if (!this._isRetryableSettlementIssue(error)) {
          const message = this._buildSettlementFailureMessage(error);
          await this._markSettlementFailed(gameId, message);
          this._emitToPlayers(game.players, "game:failed", {
            gameId,
            chainGameId: game.chainGameId,
            basePrice: game.basePrice,
            message,
          });
          this._cleanupActiveGame(gameId);
          this._clearSettlementRecovery(gameId);
          return;
        }
      }

      if (attempt >= SETTLEMENT_RECOVERY_MAX_ATTEMPTS) {
        const message = SETTLEMENT_FAILURE_MESSAGE;
        await this._markSettlementFailed(gameId, message);
        this._emitToPlayers(game.players, "game:failed", {
          gameId,
          chainGameId: game.chainGameId,
          basePrice: game.basePrice,
          message,
        });
        this._cleanupActiveGame(gameId);
        this._clearSettlementRecovery(gameId);
        return;
      }

      const timer = setTimeout(() => {
        void runAttempt(attempt + 1);
      }, SETTLEMENT_RECOVERY_RETRY_MS);
      this.settlementRecoveries.set(gameId, { timer });
    };

    const timer = setTimeout(() => {
      void runAttempt(1);
    }, SETTLEMENT_RECOVERY_RETRY_MS);
    this.settlementRecoveries.set(gameId, { timer });
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

  startRoomPayment(gameId, inviteCode, players, owner = null, chainGameId = null, kind = "room") {
    this.roomPayments[gameId] = {
      inviteCode,
      owner,
      players,
      chainGameId: chainGameId || null,
      paymentOpen: !!chainGameId,
      startedAt: Date.now(),
      paid: new Set(),
      timer: null,
      kind,
    };
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

  async getRoomPaymentStatus(gameId, chainGameId = null) {
    const status = await query(
      `SELECT g.chain_game_id, gp.wallet_address, gp.paid
       FROM games g
       JOIN game_players gp ON gp.game_id = g.id
       WHERE g.id = $1`,
      [gameId],
    );
    const rows = status.rows || [];
    const resolvedChainGameId = chainGameId || Number(rows[0]?.chain_game_id || 0) || null;
    const paidCount = rows.filter((row) => row.paid === true).length;
    const total = rows.length;
    return {
      allPaid: total > 0 && paidCount === total,
      paidCount,
      total,
      chainGameId: resolvedChainGameId,
    };
  }

  _normalizePrediction(prediction) {
    if (prediction === "up" || prediction === 1 || prediction === "1") return "up";
    if (prediction === "down" || prediction === 2 || prediction === "2") return "down";
    return null;
  }

  async _verifyPredictionIntent(gameId, wallet, prediction, deadline, signature) {
    const predictionValue = prediction === "up" ? 1 : prediction === "down" ? 2 : Number(prediction);
    const domain = {
      name: "BtcPredictArena",
      version: "1",
      chainId: contractService.chainId,
      verifyingContract: config.contract.address,
    };
    const types = {
      PredictionIntent: [
        { name: "gameId", type: "uint256" },
        { name: "player", type: "address" },
        { name: "prediction", type: "uint8" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const signer = ethers.verifyTypedData(domain, types, {
      gameId: Number(gameId),
      player: wallet,
      prediction: predictionValue,
      deadline: Number(deadline),
    }, signature);
    return signer?.toLowerCase?.() === wallet?.toLowerCase?.();
  }

  async _loadSettledPlayers(gameId) {
    const rows = await query(
      `SELECT wallet_address, prediction, reward
       FROM game_players
       WHERE game_id = $1
       ORDER BY is_owner DESC, wallet_address ASC`,
      [gameId],
    );
    return rows.rows.map((row) => ({
      wallet: row.wallet_address.toLowerCase(),
      prediction: row.prediction,
      rewardRaw: BigInt(Math.max(0, Math.round(Number(row.reward || 0) * 1_000_000))),
    }));
  }

  async confirmRoomPayment(gameId, chainGameId, wallet, inviteCode = null) {
    const session = this.getRoomPayment(gameId);
    let targetChainGameId = chainGameId || session?.chainGameId || null;
    let paymentOpened = false;

    if (!targetChainGameId && inviteCode) {
      targetChainGameId = await contractService.recoverRoomGameId(inviteCode, 12000);
      if (targetChainGameId) {
        paymentOpened = true;
        if (session) {
          session.chainGameId = targetChainGameId;
          session.paymentOpen = true;
        }
        await query(
          `UPDATE games
           SET chain_game_id = $1
           WHERE id = $2 AND (chain_game_id IS NULL OR chain_game_id <> $1)`,
          [targetChainGameId, gameId],
        );
      }
    }

    if (!targetChainGameId) {
      throw new Error("On-chain room payment is still syncing. Please retry in a moment.");
    }

    if (session && !session.chainGameId) {
      session.chainGameId = targetChainGameId;
      session.paymentOpen = true;
    }

    let paidOnChain = contractService.isMockMode();
    let lastRpcError = null;
    if (!paidOnChain) {
      for (let attempt = 0; attempt < ROOM_PAYMENT_CONFIRM_MAX_ATTEMPTS; attempt += 1) {
        try {
          paidOnChain = await contractService.isPlayerPaid(targetChainGameId, wallet);
          lastRpcError = null;
          if (paidOnChain) break;
        } catch (rpcError) {
          lastRpcError = rpcError;
        }
        if (attempt < ROOM_PAYMENT_CONFIRM_MAX_ATTEMPTS - 1) await sleep(ROOM_PAYMENT_CONFIRM_RETRY_MS);
      }
    }
    if (!paidOnChain) {
      if (lastRpcError) {
        const err = new Error("Base Sepolia RPC timed out while waiting for confirmation. Please retry in a few seconds.");
        err.retryable = true;
        throw err;
      }
      throw new Error("On-chain payment not confirmed");
    }
    await query("UPDATE game_players SET paid=true, paid_at=NOW() WHERE game_id=$1 AND wallet_address=$2", [gameId, wallet]);
    const paymentStatus = await this.getRoomPaymentStatus(gameId, targetChainGameId);
    if (paymentStatus.allPaid) await query("UPDATE games SET state='payment' WHERE id=$1", [gameId]);
    return {
      allPaid: paymentStatus.allPaid,
      paidCount: paymentStatus.paidCount,
      total: paymentStatus.total,
      chainGameId: targetChainGameId,
      paymentOpened,
    };
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
      const resolvedPlayers = await this._resolveGamePlayers(gameId, players);
      const basePrice = priceService.getPrice();
      if (!basePrice || basePrice <= 0) {
        this._emitToPlayers(resolvedPlayers, "game:error", { message: "BTC price unavailable" });
        return null;
      }
      const onchainBasePrice = Math.round(basePrice * 100);
      const room = `game:${gameId}`;

      await query(
        "UPDATE games SET state='payment',base_price=$1,failed_at=NULL,error_message=NULL WHERE id=$2",
        [basePrice, gameId],
      );

      for (const p of resolvedPlayers) {
        if (!p.socketId) continue;
        const s = this.io?.sockets.sockets.get(p.socketId);
        if (s) s.join(room);
      }

      const recoveredDeadline = await contractService.startGame(chainGameId, onchainBasePrice);
      if (!recoveredDeadline) return null;
      return this._activateRecoveredGame(gameId, chainGameId, resolvedPlayers);
    } finally {
      this.startingGames.delete(gameId);
    }
  }

  async _activateRecoveredGame(gameId, chainGameId, players = []) {
    const resolvedPlayers = await this._resolveGamePlayers(gameId, players);
    const info = await contractService.getGameInfo(chainGameId);
    const predictionDeadline = await contractService.getPredictionDeadline(chainGameId);
    if (!info || info.state !== 2 || !predictionDeadline) return null;

    const startedAt = Math.max(
      Date.now() - config.game.predictTimeout,
      Number(predictionDeadline) * 1000 - (config.game.predictTimeout - (config.game.predictSafeBuffer || 0))
    );

    const game = {
      gameId,
      chainGameId,
      players: resolvedPlayers,
      predictions: {},
      predictionIntents: {},
      basePrice: info.basePrice ? Number(info.basePrice) / 100 : (priceService.getPrice() || 0),
      phase: "predicting",
      startedAt,
      predictionDeadline: Number(predictionDeadline),
    };
    game.predictions = await this._hydrateGamePredictions(gameId, game.predictions);

    this._cleanupActiveGame(gameId);
    this.activeGames[gameId] = game;
    await query(
      "UPDATE games SET state='active', base_price=COALESCE(NULLIF(base_price, 0), $1), started_at=COALESCE(started_at, NOW()), failed_at=NULL, error_message=NULL WHERE id=$2",
      [game.basePrice, gameId],
    );

    const room = `game:${gameId}`;
    for (const p of resolvedPlayers) {
      if (!p.socketId) continue;
      const s = this.io?.sockets.sockets.get(p.socketId);
      if (s) s.join(room);
    }

    this.io?.to(room).emit("game:start", {
      gameId,
      chainGameId,
      basePrice: game.basePrice,
      players: resolvedPlayers.map((p) => p.wallet),
      totalPredicted: Object.keys(game.predictions || {}).length,
      playerPredictions: this._buildPredictionSnapshot(game),
      predictTimeout: config.game.predictTimeout,
      predictSafeBuffer: config.game.predictSafeBuffer,
      predictionDeadline: game.predictionDeadline,
    });

    game.countdownInterval = setInterval(() => {
      const rem = Math.max(0, config.game.predictTimeout - (Date.now() - game.startedAt));
      this.io?.to(room).emit("game:countdown", { phase: "predicting", remaining: Math.ceil(rem / 1000), currentPrice: priceService.getPrice() });
      if (rem <= 0) clearInterval(game.countdownInterval);
    }, 1000);
    const remainingMs = Math.max(0, config.game.predictTimeout - (Date.now() - game.startedAt));
    game.predictTimer = setTimeout(() => this._endPredict(gameId), remainingMs);
    console.log(`[Game] #${gameId} recovered to active phase`);
    return game.predictionDeadline;
  }

  async recoverStartedRoomGame(gameId, chainGameId, players = [], timeoutMs = 120000) {
    const recoveredDeadline = await contractService.recoverStartedGame(chainGameId, timeoutMs);
    if (!recoveredDeadline) return null;
    return this._activateRecoveredGame(gameId, chainGameId, players);
  }

  async recoverPaidRoomForWallet(wallet) {
    if (!wallet) return null;
    const pendingRoom = await query(
      `SELECT g.id, g.chain_game_id
       FROM games g
       JOIN game_players gp ON gp.game_id = g.id
       WHERE LOWER(gp.wallet_address) = LOWER($1)
         AND g.mode = 'room'
         AND g.state = 'payment'
         AND g.chain_game_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM game_players x
           WHERE x.game_id = g.id
             AND x.paid <> true
         )
       ORDER BY g.created_at DESC
       LIMIT 1`,
      [wallet],
    );
    const row = pendingRoom.rows[0];
    if (!row) return null;
    const gameId = Number(row.id);
    const chainGameId = Number(row.chain_game_id);
    if (this.activeGames[gameId]) {
      return this._buildActiveGameSnapshot(this.activeGames[gameId]);
    }

    const recoveredDeadline = await contractService.recoverStartedGame(chainGameId, 15000);
    if (recoveredDeadline) {
      await this._activateRecoveredGame(gameId, chainGameId);
      const active = this.activeGames[gameId];
      return active ? this._buildActiveGameSnapshot(active) : null;
    }

    const players = await this._resolveGamePlayers(gameId, []);
    try {
      await this.startGame(gameId, chainGameId, players);
    } catch (error) {
      const message = `${error?.message || ""}`.toLowerCase();
      if (message.includes("timed out")) {
        await this.recoverStartedRoomGame(gameId, chainGameId, players, 120000);
      } else {
        throw error;
      }
    }
    const active = this.activeGames[gameId];
    return active ? this._buildActiveGameSnapshot(active) : null;
  }

  async confirmPrediction(gameId, wallet, prediction, deadline, signature) {
    const g = this.activeGames[gameId]; if (!g) return { error: "Game not found" };
    if (g.phase !== "predicting") return { error: "Prediction phase ended" };
    let player = g.players.find((entry) => entry.wallet === wallet);
    if (!player) {
      const membership = await query(
        `SELECT 1
         FROM game_players
         WHERE game_id = $1 AND LOWER(wallet_address) = LOWER($2)
         LIMIT 1`,
        [gameId, wallet],
      );
      if (membership.rowCount === 0) return { error: "Not in this game" };
      const repairedPlayers = await this._resolveGamePlayers(gameId, g.players);
      if (repairedPlayers.length > 0) {
        g.players = repairedPlayers;
        player = g.players.find((entry) => entry.wallet === wallet) || null;
      }
      if (!player) {
        player = { wallet, socketId: this._findSocketIdByWallet(wallet) };
        g.players.push(player);
      }
    }
    const normalizedPrediction = this._normalizePrediction(prediction);
    if (!normalizedPrediction) return { error: "Invalid prediction" };
    if (!deadline || Number(deadline) !== Number(g.predictionDeadline || 0)) {
      return { error: "Prediction deadline unavailable" };
    }
    if (!signature) return { error: "Prediction signature missing" };
    if (Math.floor(Date.now() / 1000) > Number(g.predictionDeadline || 0)) {
      return { error: "Prediction window closed" };
    }
    const validSignature = await this._verifyPredictionIntent(g.chainGameId, wallet, normalizedPrediction, deadline, signature);
    if (!validSignature) return { error: "Invalid prediction signature" };

    if (g.predictions[wallet]) {
      return g.predictions[wallet] === normalizedPrediction ? { status: "ok" } : { error: "Prediction already submitted" };
    }
    g.predictions[wallet] = normalizedPrediction;
    g.predictionIntents[wallet] = {
      prediction: normalizedPrediction,
      deadline: Number(deadline),
      signature,
    };
    await query(
      `UPDATE game_players
       SET prediction = $1,
           prediction_signature = $2,
           prediction_deadline = $3,
           prediction_signed_at = NOW(),
           prediction_synced = false
       WHERE game_id = $4 AND LOWER(wallet_address) = LOWER($5)`,
      [normalizedPrediction, signature, Number(deadline), gameId, wallet],
    );
    this.io?.to(`game:${gameId}`).emit("game:prediction", {
      wallet,
      prediction: this._normalizePredictionValue(normalizedPrediction),
      predicted: true,
      totalPredicted: Object.keys(g.predictions).length,
      totalPlayers: g.players.length,
    });
    if (Object.keys(g.predictions).length === g.players.length) {
      clearTimeout(g.predictTimer);
      clearInterval(g.countdownInterval);
      this._endPredict(gameId);
    }
    return { status: "ok" };
  }

  async _finalizeSettlement(gameId, computedResult = null) {
    const g = this.activeGames[gameId]; if (!g) return;
    const info = await contractService.getGameInfo(g.chainGameId);
    if (!info || info.state !== 3 || !info.settlementPrice) {
      throw new Error("Settlement confirmation unavailable");
    }
    const sp = Number(info.settlementPrice) / 100;

    g.phase = "settled";
    let result = computedResult;
    if (!result) {
      const settledPlayers = await this._loadSettledPlayers(gameId);
      const predictions = Object.fromEntries(
        settledPlayers.map((row) => [row.wallet, row.prediction || null]),
      );
      result = settlementService.calculate(
        settledPlayers.map((row) => row.wallet),
        predictions,
        g.basePrice,
        sp,
      );
    }

    await withTransaction(async (db) => {
      await db.query(
        "UPDATE games SET state='settled',settlement_price=$1,settled_at=NOW(),failed_at=NULL,error_message=NULL WHERE id=$2",
        [sp, gameId],
      );
      for (const playerResult of result.playerResults) {
        await db.query(
          `UPDATE game_players
           SET prediction = $1,
               is_correct = $2,
               reward = $3,
               predicted_at = COALESCE(predicted_at, NOW()),
               prediction_synced = true
           WHERE game_id = $4 AND wallet_address = $5`,
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
            [playerResult.wallet, config.game.entryFee / 1_000_000],
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
        myResult: myResult ? {
          wallet: myResult.wallet,
          prediction: myResult.prediction,
          isCorrect: myResult.isCorrect,
          reward: Number(myResult.reward || 0),
          lost: Number(myResult.lost || 0),
        } : null,
        platformFee: result.platformFee,
      });
    }
    console.log(`[Game] #${gameId} settled $${g.basePrice} -> $${sp}`);
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
      this.io?.to(room).emit("game:countdown", { phase: "settling", remaining: 0, currentPrice: priceService.getPrice() });
      void this._settle(gameId);
    }, config.game.settleDelay);
  }

  async _settle(gameId) {
    const g = this.activeGames[gameId]; if (!g) return;
    if (this.settlingGames.has(gameId)) return;
    this.settlingGames.add(gameId);
    let preserveActiveGame = false;
    try {
      await this._waitForChainPredictionDeadline(g);
      const sp = priceService.getPrice();
      if (!sp || sp <= 0) {
        throw new Error("Settlement price unavailable");
      }
      const onchainSettlementPrice = Math.round(sp * 100);
      const settledPlayers = await this._loadSettledPlayers(gameId);
      const predictions = Object.fromEntries(
        settledPlayers.map((row) => [row.wallet, row.prediction || null]),
      );
      const result = settlementService.calculate(
        settledPlayers.map((row) => row.wallet),
        predictions,
        g.basePrice,
        sp,
      );
      const tree = buildSettlementTree(
        g.chainGameId,
        result.playerResults.map((row) => ({
          wallet: row.wallet,
          prediction: row.prediction,
          rewardRaw: row.rewardRaw,
        })),
      );
      const recovered = await contractService.settleGame(
        g.chainGameId,
        onchainSettlementPrice,
        tree.root,
        result.totalPayoutRaw,
      );
      if (!recovered) {
        preserveActiveGame = true;
        this._scheduleSettlementRecovery(gameId, result);
        this._emitToPlayers(g.players, "game:error", {
          message: "Settlement is still syncing on Base Sepolia. The result should appear automatically.",
        });
        return;
      }

      await this._finalizeSettlement(gameId, result);
    } catch (error) {
      if (this._isRetryableSettlementIssue(error)) {
        preserveActiveGame = true;
        this._scheduleSettlementRecovery(gameId, null);
        this._emitToPlayers(g.players, "game:error", {
          message: "Settlement is still syncing on Base Sepolia. The result should appear automatically.",
        });
        return;
      }
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
      this.settlingGames.delete(gameId);
      if (!preserveActiveGame) {
        this._cleanupActiveGame(gameId);
      }
    }
  }
}
export default new GameService();
