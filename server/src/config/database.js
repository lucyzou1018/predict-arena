import pg from "pg";
import config from "./index.js";
const pool = new pg.Pool({ connectionString: config.db.url });
export async function query(text, params) { return pool.query(text, params); }
export async function initDB() {
  await query(`CREATE TABLE IF NOT EXISTS users (
    wallet_address VARCHAR(42) PRIMARY KEY, wins INT DEFAULT 0, losses INT DEFAULT 0,
    total_earned NUMERIC(20,6) DEFAULT 0, total_lost NUMERIC(20,6) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY, chain_game_id INT, mode VARCHAR(10) NOT NULL, invite_code VARCHAR(10),
    max_players SMALLINT NOT NULL, state VARCHAR(20) DEFAULT 'created', base_price NUMERIC(20,2),
    settlement_price NUMERIC(20,2), created_at TIMESTAMPTZ DEFAULT NOW(), started_at TIMESTAMPTZ, settled_at TIMESTAMPTZ
  )`);
  await query(`CREATE TABLE IF NOT EXISTS game_players (
    id SERIAL PRIMARY KEY, game_id INT REFERENCES games(id), wallet_address VARCHAR(42),
    prediction VARCHAR(4), is_correct BOOLEAN, reward NUMERIC(20,6) DEFAULT 0, paid BOOLEAN DEFAULT false, paid_at TIMESTAMPTZ,
    predicted_at TIMESTAMPTZ, UNIQUE(game_id, wallet_address)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_games_state ON games(state)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_games_invite ON games(invite_code)`);
  await query(`ALTER TABLE game_players ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
  await query(`ALTER TABLE game_players ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT false`);
  await query(`CREATE INDEX IF NOT EXISTS idx_gp_game ON game_players(game_id)`);
  console.log("[DB] Tables initialized");
}
export default pool;
