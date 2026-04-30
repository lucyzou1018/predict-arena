import { Router } from "express";
import crypto from "crypto";
import config from "../config/index.js";
import { query } from "../config/database.js";

const router = Router();

const METRIC_DISPLAY = {
  total_login_users: "总登陆用户",
  total_paid_users: "总已支付用户",
  total_games: "总游戏",
  total_rooms_created: "开房间次数",
  total_quick_matches: "快速匹配次数",
};

const METRIC_ORDER = [
  "total_login_users",
  "total_paid_users",
  "total_games",
  "total_rooms_created",
  "total_quick_matches",
];

function isValidToken(candidate) {
  const expected = config.charts.accessToken;
  if (!expected || !candidate) return false;
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(String(candidate));
  return expectedBuffer.length === candidateBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
}

function resolveEndTimestamp(value) {
  if (value === undefined) return Math.floor(Date.now() / 1000);
  if (Array.isArray(value)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function finiteNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

router.get("/metrics/snapshot", async (req, res) => {
  if (!isValidToken(req.query.access_token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const timestamp = resolveEndTimestamp(req.query.end_timestamp);
  if (timestamp === null) {
    return res.status(400).json({ error: "Invalid end_timestamp" });
  }

  try {
    const result = await query(
      `WITH cutoff AS (
         SELECT to_timestamp($1) AS ts
       )
       SELECT
         COALESCE((
           SELECT COUNT(DISTINCT LOWER(gp.wallet_address))
           FROM game_players gp
           JOIN games g ON g.id = gp.game_id
           CROSS JOIN cutoff c
           WHERE g.created_at <= c.ts
         ), 0)::int AS total_login_users,
         COALESCE((
           SELECT COUNT(DISTINCT LOWER(gp.wallet_address))
           FROM game_players gp
           JOIN games g ON g.id = gp.game_id
           CROSS JOIN cutoff c
           WHERE gp.paid = true
             AND (
               gp.paid_at <= c.ts
               OR (gp.paid_at IS NULL AND g.created_at <= c.ts)
             )
         ), 0)::int AS total_paid_users,
         COALESCE((
           SELECT COUNT(*)
           FROM games g
           CROSS JOIN cutoff c
           WHERE g.created_at <= c.ts
         ), 0)::int AS total_games,
         COALESCE((
           SELECT COUNT(DISTINCT g.invite_code)
           FROM games g
           CROSS JOIN cutoff c
           WHERE g.mode = 'room'
             AND g.invite_code IS NOT NULL
             AND g.created_at <= c.ts
         ), 0)::int AS total_rooms_created,
         COALESCE((
           SELECT COUNT(*)
           FROM games g
           CROSS JOIN cutoff c
           WHERE g.mode = 'random'
             AND g.created_at <= c.ts
         ), 0)::int AS total_quick_matches`,
      [timestamp],
    );

    const row = result.rows[0] || {};
    const data = Object.fromEntries(
      METRIC_ORDER.map((key) => [key, finiteNumber(row[key])]),
    );

    return res.json({
      data,
      extra: {
        timestamp,
        display: METRIC_DISPLAY,
        order: METRIC_ORDER,
      },
    });
  } catch (error) {
    console.error("[Metrics] snapshot failed", error?.message || error);
    return res.status(500).json({ error: "Metrics snapshot failed" });
  }
});

export default router;
