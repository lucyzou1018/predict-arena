import { Router } from "express";
import { query } from "../config/database.js";
import priceService from "../services/price.js";
import config from "../config/index.js";
import roomService from "../services/room.js";
import gameService from "../services/game.js";
import contractService from "../services/contract.js";
import roomPaymentAuthService from "../services/roomPaymentAuth.js";
import { buildSettlementProof, buildSettlementTree } from "../utils/settlementMerkle.js";
const router = Router();
const norm = (wallet = "") => wallet.toLowerCase();

router.get("/price", (_, res) => res.json(priceService.getStatus()));

router.get("/games/:id", async (req, res) => {
  const g = await query("SELECT * FROM games WHERE id = $1", [req.params.id]);
  if (!g.rows[0]) return res.status(404).json({ error: "Not found" });
  const p = await query("SELECT wallet_address,prediction,is_correct,reward FROM game_players WHERE game_id=$1", [req.params.id]);
  res.json({ game: g.rows[0], players: p.rows });
});

router.get("/claims/:chainGameId/:wallet", async (req, res) => {
  const chainGameId = Number(req.params.chainGameId);
  const wallet = norm(req.params.wallet);
  if (!chainGameId || !wallet) return res.status(400).json({ error: "Invalid request" });

  const result = await query(
    `SELECT g.id, g.chain_game_id, g.state AS db_state, g.base_price, g.settlement_price,
            gp.wallet_address, gp.prediction, gp.reward, gp.paid
     FROM games g
     JOIN game_players gp ON gp.game_id = g.id
     WHERE g.chain_game_id = $1
       AND LOWER(gp.wallet_address) = LOWER($2)
     ORDER BY g.created_at DESC
     LIMIT 1`,
    [chainGameId, wallet],
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });

  let gameInfo = null;
  let paymentDeadline = null;
  let predictionDeadline = null;
  let refundGracePeriod = 300;
  let claimed = false;
  let hasPaidOnchain = !!row.paid;

  try {
    gameInfo = await contractService.getGameInfo(chainGameId);
    paymentDeadline = await contractService.getPaymentDeadline(chainGameId);
    predictionDeadline = await contractService.getPredictionDeadline(chainGameId);
    const onchainPlayer = await contractService.getPlayerPrediction(chainGameId, wallet);
    claimed = !!onchainPlayer?.claimed;
    hasPaidOnchain = !!onchainPlayer?.hasPaid;
  } catch (_) {}

  const state = Number(gameInfo?.state ?? (
    row.db_state === "payment" ? 1
      : row.db_state === "active" ? 2
      : row.db_state === "settled" ? 3
      : row.db_state === "cancelled" ? 4
      : row.db_state === "refundable" ? 5
      : 0
  ));
  const reward = Number(row.reward || 0);
  const rewardRaw = Math.max(0, Math.round(reward * 1_000_000));
  const predictionValue = row.prediction === "up" ? 1 : row.prediction === "down" ? 2 : 0;
  const now = Math.floor(Date.now() / 1000);
  const refundUnlockAt = predictionDeadline ? predictionDeadline + refundGracePeriod : null;
  const overdue = !!refundUnlockAt && now > refundUnlockAt;
  const paymentExpired = !!paymentDeadline && now > paymentDeadline;
  const canClaimReward = state === 3 && rewardRaw > 0 && !claimed;
  const canForceRefund = state === 2 && hasPaidOnchain && !claimed && overdue;
  const canClaimRefund = state === 5 && hasPaidOnchain && !claimed;
  const canCancelExpired = state === 1 && hasPaidOnchain && !claimed && paymentExpired;

  let proof = [];
  if (canClaimReward) {
    const allPlayers = await query(
      `SELECT wallet_address, prediction, reward
       FROM game_players
       WHERE game_id = $1
       ORDER BY LOWER(wallet_address) ASC`,
      [row.id],
    );
    const tree = buildSettlementTree(
      chainGameId,
      allPlayers.rows.map((player) => ({
        wallet: player.wallet_address,
        prediction: player.prediction,
        rewardRaw: BigInt(Math.max(0, Math.round(Number(player.reward || 0) * 1_000_000))),
      })),
    );
    proof = buildSettlementProof(tree, wallet);
  }

  return res.json({
    action: canClaimReward ? "reward" : (canClaimRefund || canForceRefund || canCancelExpired ? "refund" : null),
    canCancelExpired,
    canClaimRefund,
    canClaimReward,
    canForceRefund,
    claimed,
    entryFee: config.game.entryFee / 1_000_000,
    entryFeeRaw: config.game.entryFee,
    hasPaid: hasPaidOnchain,
    overdue,
    paymentDeadline,
    paymentExpired,
    prediction: row.prediction,
    predictionValue,
    proof,
    refundGracePeriod,
    refundSupport: true,
    refundUnlockAt,
    reward,
    rewardRaw,
    state,
  });
});

router.get("/users/:wallet", async (req, res) => {
  const u = await query("SELECT * FROM users WHERE LOWER(wallet_address)=LOWER($1)", [norm(req.params.wallet)]);
  if (!u.rows[0]) return res.json({ wallet: req.params.wallet, wins: 0, losses: 0, total_earned: 0, total_lost: 0 });
  res.json(u.rows[0]);
});


router.get("/users/:wallet/open-room", async (req, res) => {
  const wallet = norm(req.params.wallet);
  await query(
    `UPDATE games
     SET state = 'expired'
     WHERE mode = 'room'
       AND state = 'waiting'
       AND created_at < NOW() - ($1 * INTERVAL '1 millisecond')`,
    [config.game.roomExpiry]
  );
  await query(
    `UPDATE games
     SET state = 'failed'
     WHERE mode = 'room'
       AND state = 'payment'
       AND created_at < NOW() - ($1 * INTERVAL '1 millisecond')`,
    [config.game.paymentTimeout]
  );
  for (const [inviteCode, room] of Object.entries(roomService.rooms)) {
    const inRoom = room.players.find((p) => norm(p.wallet) === wallet);
    if (!inRoom) continue;
    const gp = await query(
      `SELECT wallet_address, paid, is_owner
       FROM game_players
       WHERE game_id = $1`,
      [room.gameId]
    );
    const me = gp.rows.find((row) => norm(row.wallet_address) === wallet);
    const payment = gameService.getRoomPayment(room.gameId);
    const paymentOpen = !!(payment?.chainGameId || room.chainGameId);
    const isPreparing = room.players.length >= room.maxPlayers && !paymentOpen;
    if (payment?.startedAt && Date.now() - payment.startedAt >= config.game.paymentTimeout) {
      await roomService._abortPaymentRoom(inviteCode, "A player timed out before completing payment. This room has been dissolved.");
      return res.json({ room: null });
    }
    const paidCount = gp.rows.filter((row) => row.paid === true).length;
    const auth = paymentOpen && payment && !me?.paid
      ? await roomPaymentAuthService.build({
          inviteCode,
          maxPlayers: room.maxPlayers,
          roomOwner: room.owner,
          player: wallet,
          players: room.players.map((p) => p.wallet),
          paymentStartedAt: payment?.startedAt,
        }).catch(() => null)
      : null;
    const phase = paymentOpen
      ? (me?.paid ? "paid_waiting" : "payment")
      : (isPreparing ? "preparing" : "waiting");
    return res.json({
      room: {
        id: room.gameId,
        game_id: room.gameId,
        chain_game_id: room.chainGameId,
        invite_code: inviteCode,
        max_players: room.maxPlayers,
        current_players: room.players.length,
        state: paymentOpen || isPreparing ? "payment" : "waiting",
        created_at: new Date(room.createdAt).toISOString(),
        expires_at: room.expiresAt,
        is_owner: !!me?.is_owner,
        owner: room.owner,
        players: room.players.map((p) => p.wallet),
        phase,
        payment_open: paymentOpen,
        payment_started_at: payment?.startedAt || null,
        payment_timeout_ms: config.game.paymentTimeout,
        paid_count: paidCount,
        total_players: room.players.length,
        auth,
      },
    });
  }
  const r = await query(
    `SELECT g.id, g.invite_code, g.max_players, g.state, g.created_at, g.chain_game_id,
            gp2.is_owner, gp2.paid,
            COALESCE((SELECT COUNT(*) FROM game_players x WHERE x.game_id=g.id),0)::int as current_players,
            COALESCE((SELECT COUNT(*) FROM game_players x WHERE x.game_id=g.id AND x.paid=true),0)::int as paid_count,
            COALESCE(
              (
                SELECT json_agg(x.wallet_address ORDER BY x.is_owner DESC, x.wallet_address ASC)
                FROM game_players x
                WHERE x.game_id = g.id
              ),
              '[]'::json
            ) as players,
            (
              SELECT x.wallet_address
              FROM game_players x
              WHERE x.game_id = g.id AND x.is_owner = true
              LIMIT 1
            ) as owner_wallet,
            (
              SELECT MAX(x.paid_at)
              FROM game_players x
              WHERE x.game_id = g.id AND x.paid = true
            ) as payment_started_at
     FROM games g
     JOIN game_players gp2 ON g.id = gp2.game_id AND LOWER(gp2.wallet_address)=LOWER($1)
     WHERE g.mode='room'
       AND g.state IN ('waiting', 'payment')
       AND (
         g.state <> 'waiting'
         OR g.created_at >= NOW() - ($2 * INTERVAL '1 millisecond')
       )
       AND NOT EXISTS (
         SELECT 1 FROM games g2
         WHERE g2.invite_code = g.invite_code
           AND g2.state = 'cancelled'
           AND (
             g2.created_at > g.created_at
             OR (g2.created_at = g.created_at AND g2.id > g.id)
           )
       )
     ORDER BY g.created_at DESC
     LIMIT 1`,
    [wallet, config.game.roomExpiry]
  );
  const row = r.rows[0];
  if (!row) return res.json({ room: null });
  const paymentOpen = !!row.chain_game_id;
  const phase = row.state === "payment"
    ? (row.paid ? "paid_waiting" : (paymentOpen ? "payment" : "preparing"))
    : "waiting";
  const paymentStartedAt = row.payment_started_at
    ? new Date(row.payment_started_at).getTime()
    : new Date(row.created_at).getTime();
  if (phase === "payment") {
    if (Date.now() - paymentStartedAt >= config.game.paymentTimeout) {
      await query(`UPDATE games SET state = 'failed' WHERE id = $1`, [row.id]);
      return res.json({ room: null });
    }
  }
  const auth = phase === "payment" && !row.paid
    ? await roomPaymentAuthService.build({
        inviteCode: row.invite_code,
        maxPlayers: row.max_players,
        roomOwner: row.owner_wallet,
        player: wallet,
        players: Array.isArray(row.players) ? row.players : [],
        paymentStartedAt,
      }).catch(() => null)
    : null;
  const room = {
    ...row,
    game_id: row.id,
    total_players: row.current_players,
    payment_timeout_ms: config.game.paymentTimeout,
    phase,
    payment_open: paymentOpen,
    payment_started_at: phase === "payment" ? paymentStartedAt : null,
    owner: row.owner_wallet,
    players: Array.isArray(row.players) ? row.players : [],
    auth,
  };
  res.json({ room });
});

router.get("/users/:wallet/games", async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const r = await query(
    `SELECT g.id, g.chain_game_id, g.mode, g.invite_code, g.max_players, g.state, g.base_price, g.settlement_price, g.error_message,
            g.created_at, g.started_at, g.settled_at, g.failed_at,
            gp.prediction, gp.is_correct, gp.reward, gp.is_owner
     FROM games g JOIN game_players gp ON g.id=gp.game_id
     WHERE LOWER(gp.wallet_address)=LOWER($1)
     ORDER BY COALESCE(g.settled_at, g.failed_at, g.started_at, g.created_at) DESC LIMIT $2 OFFSET $3`,
    [norm(req.params.wallet), limit, offset]
  );
  const games = await Promise.all(r.rows.map(async (row) => {
    const chainGameId = row.chain_game_id;
    let claimed = false;
    if (chainGameId && Number(row.reward) > 0 && row.state === "settled") {
      try {
        const onchain = await contractService.getPlayerPrediction(chainGameId, norm(req.params.wallet));
        claimed = !!onchain?.claimed;
      } catch {
        claimed = false;
      }
    }
    return {
      ...row,
      claimed,
      claimable: row.state === "settled" && Number(row.reward) > 0 && !claimed,
    };
  }));
  res.json({ games });
});

// Recent games (global)
router.get("/recent", async (_, res) => {
  const r = await query(
    `SELECT g.id, g.mode, g.max_players, g.base_price, g.settlement_price, g.settled_at,
            (SELECT COUNT(*) FROM game_players WHERE game_id=g.id AND is_correct=true) as winners,
            (SELECT COUNT(*) FROM game_players WHERE game_id=g.id) as total_players
     FROM games g WHERE g.state='settled' ORDER BY g.settled_at DESC LIMIT 10`
  );
  res.json({ games: r.rows });
});

// Leaderboard
router.get("/leaderboard", async (_, res) => {
  const r = await query(
    `SELECT wallet_address, wins, losses, total_earned, total_lost,
            (wins::float / NULLIF(wins+losses,0) * 100) as win_rate
     FROM users
     ORDER BY (total_earned - total_lost) DESC, total_earned DESC, wins DESC
     LIMIT 20`
  );
  res.json({ users: r.rows });
});

export default router;
