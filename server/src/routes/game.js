import { Router } from "express";
import { query } from "../config/database.js";
import priceService from "../services/price.js";
import config from "../config/index.js";
import roomService from "../services/room.js";
import gameService from "../services/game.js";
import contractService from "../services/contract.js";
const router = Router();
const norm = (wallet = "") => wallet.toLowerCase();

router.get("/price", (_, res) => res.json({ price: priceService.getPrice() }));

router.get("/games/:id", async (req, res) => {
  const g = await query("SELECT * FROM games WHERE id = $1", [req.params.id]);
  if (!g.rows[0]) return res.status(404).json({ error: "Not found" });
  const p = await query("SELECT wallet_address,prediction,is_correct,reward FROM game_players WHERE game_id=$1", [req.params.id]);
  res.json({ game: g.rows[0], players: p.rows });
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
    const paidCount = gp.rows.filter((row) => row.paid === true).length;
    const preparing = !payment && room.preparing === true;
    return res.json({
      room: {
        id: room.gameId,
        game_id: room.gameId,
        chain_game_id: room.chainGameId,
        invite_code: inviteCode,
        max_players: room.maxPlayers,
        current_players: room.players.length,
        state: payment ? "payment" : preparing ? "preparing" : "waiting",
        created_at: new Date(room.createdAt).toISOString(),
        expires_at: room.expiresAt,
        is_owner: !!me?.is_owner,
        players: room.players.map((p) => p.wallet),
        phase: payment ? (me?.paid ? "paid_waiting" : "payment") : preparing ? "preparing" : "waiting",
        payment_started_at: payment?.startedAt || room.prepareStartedAt || null,
        payment_timeout_ms: config.game.paymentTimeout,
        paid_count: paidCount,
        total_players: room.players.length,
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
  if (row.state === "payment") {
    const paymentStartedAt = row.payment_started_at ? new Date(row.payment_started_at).getTime() : new Date(row.created_at).getTime();
    if (Date.now() - paymentStartedAt >= config.game.paymentTimeout) {
      await query(`UPDATE games SET state = 'failed' WHERE id = $1`, [row.id]);
      return res.json({ room: null });
    }
  }
  const room = {
    ...row,
    game_id: row.id,
    total_players: row.current_players,
    payment_timeout_ms: config.game.paymentTimeout,
    phase: row.state === "payment" ? (row.paid ? "paid_waiting" : "payment") : "waiting",
    players: Array.isArray(row.players) ? row.players : [],
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
     FROM users ORDER BY total_earned DESC LIMIT 20`
  );
  res.json({ users: r.rows });
});

export default router;
