import config from "../config/index.js";
import { query } from "../config/database.js";
import priceService from "./price.js";
import settlementService from "./settlement.js";
import contractService from "./contract.js";

class GameService {
  constructor() { this.activeGames = {}; this.io = null; this.roomPayments = {}; }
  setIO(io) { this.io = io; }

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
    const paidOnChain = await contractService.isPlayerPaid(targetChainGameId, wallet);
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
    const basePrice = priceService.getPrice();
    await contractService.startGame(chainGameId, Math.round(basePrice * 100));
    if (!basePrice || basePrice <= 0) {
      for (const p of players) this.io?.to(p.socketId).emit("game:error", { message: "BTC price unavailable" });
      return;
    }
    const game = { gameId, chainGameId, players, predictions: {}, basePrice, phase: "predicting", startedAt: Date.now() };
    this.activeGames[gameId] = game;
    await query("UPDATE games SET state='active',base_price=$1,started_at=NOW() WHERE id=$2", [basePrice, gameId]);
    for (const p of players) await query("INSERT INTO game_players(game_id,wallet_address,paid)VALUES($1,$2,true)ON CONFLICT DO NOTHING", [gameId, p.wallet]);

    const room = `game:${gameId}`;
    for (const p of players) { const s = this.io?.sockets.sockets.get(p.socketId); if (s) s.join(room); }
    console.log(`[Game] #${gameId} started base=$${basePrice} players=${players.length}`);
    this.io?.to(room).emit("game:start", { gameId, basePrice, players: players.map(p => p.wallet), predictTimeout: config.game.predictTimeout });

    game.countdownInterval = setInterval(() => {
      const rem = Math.max(0, config.game.predictTimeout - (Date.now() - game.startedAt));
      this.io?.to(room).emit("game:countdown", { phase: "predicting", remaining: Math.ceil(rem / 1000), currentPrice: priceService.getPrice() });
      if (rem <= 0) clearInterval(game.countdownInterval);
    }, 1000);
    game.predictTimer = setTimeout(() => this._endPredict(gameId), config.game.predictTimeout);
  }

  submitPrediction(gameId, wallet, prediction) {
    const g = this.activeGames[gameId]; if (!g) return { error: "Game not found" };
    if (g.phase !== "predicting") return { error: "Prediction phase ended" };
    if (!g.players.find(p => p.wallet === wallet)) return { error: "Not in this game" };
    if (g.predictions[wallet]) return { error: "Already predicted" };
    if (prediction !== "up" && prediction !== "down") return { error: "Invalid prediction" };
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
    g.settleInterval = setInterval(() => {
      const rem = Math.max(0, config.game.settleDelay - (Date.now() - t0));
      this.io?.to(room).emit("game:countdown", { phase: "settling", remaining: Math.ceil(rem / 1000), currentPrice: priceService.getPrice() });
      if (rem <= 0) clearInterval(g.settleInterval);
    }, 1000);
    g.settleTimer = setTimeout(async () => { clearInterval(g.settleInterval); await this._settle(gameId); }, config.game.settleDelay);
  }

  async _settle(gameId) {
    const g = this.activeGames[gameId]; if (!g) return;
    const sp = priceService.getPrice(); g.phase = "settled";
    const result = settlementService.calculate(g.players.map(p => p.wallet), g.predictions, g.basePrice, sp);
    await query("UPDATE games SET state='settled',settlement_price=$1,settled_at=NOW() WHERE id=$2", [sp, gameId]);
    for (const r of result.playerResults) {
      await query("UPDATE game_players SET prediction=$1,is_correct=$2,reward=$3,predicted_at=NOW() WHERE game_id=$4 AND wallet_address=$5", [r.prediction, r.isCorrect, r.reward, gameId, r.wallet]);
      if (r.isCorrect) await query("INSERT INTO users(wallet_address,wins,total_earned)VALUES($1,1,$2)ON CONFLICT(wallet_address)DO UPDATE SET wins=users.wins+1,total_earned=users.total_earned+$2", [r.wallet, r.reward]);
      else await query("INSERT INTO users(wallet_address,losses,total_lost)VALUES($1,1,$2)ON CONFLICT(wallet_address)DO UPDATE SET losses=users.losses+1,total_lost=users.total_lost+$2", [r.wallet, r.lost]);
    }
    // Send personalized result to each player
    for (const p of g.players) {
      const my = result.playerResults.find(r => r.wallet === p.wallet);
      this.io?.to(p.socketId).emit("game:result", {
        gameId, basePrice: g.basePrice, settlementPrice: sp,
        direction: sp > g.basePrice ? "up" : sp < g.basePrice ? "down" : "flat",
        myResult: my, platformFee: result.platformFee,
      });
    }
    console.log(`[Game] #${gameId} settled $${g.basePrice} -> $${sp}`);
    delete this.activeGames[gameId];
  }
}
export default new GameService();
