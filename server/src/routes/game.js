import { Router } from "express";
import { query } from "../config/database.js";
import priceService from "../services/price.js";
const router = Router();

router.get("/price", (_, res) => res.json({ price: priceService.getPrice() }));

router.get("/games/:id", async (req, res) => {
  const g = await query("SELECT * FROM games WHERE id = $1", [req.params.id]);
  if (!g.rows[0]) return res.status(404).json({ error: "Not found" });
  const p = await query("SELECT wallet_address,prediction,is_correct,reward FROM game_players WHERE game_id=$1", [req.params.id]);
  res.json({ game: g.rows[0], players: p.rows });
});

router.get("/users/:wallet", async (req, res) => {
  const u = await query("SELECT * FROM users WHERE wallet_address=$1", [req.params.wallet]);
  if (!u.rows[0]) return res.json({ wallet: req.params.wallet, wins: 0, losses: 0, total_earned: 0, total_lost: 0 });
  res.json(u.rows[0]);
});


router.get("/users/:wallet/open-room", async (req, res) => {
  const r = await query(
    `SELECT g.id, g.invite_code, g.max_players, g.state, g.created_at,
            gp2.is_owner,
            COALESCE((SELECT COUNT(*) FROM game_players x WHERE x.game_id=g.id),0)::int as current_players
     FROM games g
     JOIN game_players gp2 ON g.id = gp2.game_id AND gp2.wallet_address=$1
     WHERE g.mode='room'
       AND g.state='waiting'
       AND NOT EXISTS (
         SELECT 1 FROM games g2
         WHERE g2.invite_code = g.invite_code
           AND g2.state = 'cancelled'
           AND g2.created_at >= g.created_at
       )
     ORDER BY g.created_at DESC
     LIMIT 1`,
    [req.params.wallet]
  );
  res.json({ room: r.rows[0] || null });
});

router.get("/users/:wallet/games", async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const r = await query(
    `SELECT g.id, g.mode, g.invite_code, g.max_players, g.state, g.base_price, g.settlement_price, g.created_at, g.started_at, g.settled_at,
            gp.prediction, gp.is_correct, gp.reward, gp.is_owner
     FROM games g JOIN game_players gp ON g.id=gp.game_id
     WHERE gp.wallet_address=$1
     ORDER BY COALESCE(g.settled_at, g.started_at, g.created_at) DESC LIMIT $2 OFFSET $3`,
    [req.params.wallet, limit, offset]
  );
  res.json({ games: r.rows });
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
