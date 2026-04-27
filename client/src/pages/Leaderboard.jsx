import { useEffect, useMemo, useState } from "react";
import { Trophy, TrendingUp, ShieldAlert, Coins } from "lucide-react";
import { SERVER_URL } from "../config/constants";
import { useWallet } from "../context/WalletContext";
import { useT } from "../context/LangContext";

const shortAddr = (value = "") => (value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "—");

export default function Leaderboard() {
  const t = useT();
  const { wallet } = useWallet();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${SERVER_URL}/api/leaderboard`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.users) ? data.users : [];
        setUsers(
          rows.map((item, index) => {
            const wins = Number(item?.wins || 0);
            const losses = Number(item?.losses || 0);
            const earned = Number(item?.total_earned || 0);
            const lost = Number(item?.total_lost || 0);
            const played = wins + losses;
            const winRate = played ? (wins / played) * 100 : 0;
            return {
              rank: index + 1,
              wallet: item?.wallet_address || "",
              wins,
              losses,
              earned,
              lost,
              winRate,
              profit: earned - lost,
            };
          })
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(t("leaderboard.error"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const currentUser = useMemo(() => {
    if (!wallet) return null;
    return users.find((item) => item.wallet.toLowerCase() === wallet.toLowerCase()) || null;
  }, [users, wallet]);

  const leaderboardRows = useMemo(() => {
    if (!currentUser) return users;
    return [
      currentUser,
      ...users.filter((item) => item.wallet.toLowerCase() !== currentUser.wallet.toLowerCase()),
    ];
  }, [users, currentUser]);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="landing-bg" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
        <section className="dashboard-room-card px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="dashboard-kicker mb-3 inline-flex">
                <Trophy size={12} />
                {t("leaderboard.kicker")}
              </div>
              <h1 className="dashboard-title text-2xl font-black leading-none tracking-[0.02em] sm:text-3xl">
                {t("leaderboard.title")}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/58 sm:text-[15px]">
                {t("leaderboard.subtitle")}
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:max-w-[470px] xl:max-w-[510px]">
              {[
                {
                  icon: Trophy,
                  label: t("leaderboard.metric.players"),
                  value: users.length || "--",
                  tone: "text-amber-200 border-amber-400/15 bg-amber-500/[0.06]",
                },
                {
                  icon: TrendingUp,
                  label: t("leaderboard.metric.bestWinRate"),
                  value: users.length ? `${Math.max(...users.map((item) => item.winRate)).toFixed(1)}%` : "--",
                  tone: "text-cyan-200 border-cyan-400/15 bg-cyan-500/[0.06]",
                },
                {
                  icon: Coins,
                  label: t("leaderboard.metric.topProfit"),
                  value: users.length ? `${users[0].profit >= 0 ? "+" : ""}${users[0].profit.toFixed(2)}` : "--",
                  tone: "text-fuchsia-200 border-fuchsia-400/15 bg-fuchsia-500/[0.06]",
                },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <div key={metric.label} className="dashboard-room-subcard min-w-0 px-3 py-3 sm:px-3.5 sm:py-3.5">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/45">
                      <Icon size={14} className={metric.tone.split(" ")[0]} />
                      <span>{metric.label}</span>
                    </div>
                    <div className="mt-2.5 text-[1.12rem] font-black tracking-[0.02em] text-white sm:text-[1.2rem]">{metric.value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="dashboard-room-card p-3 sm:p-4">
            <div className="flex flex-wrap gap-2 border-b border-white/[0.06] px-2 pb-4 pt-1 sm:pb-5">
              <div className="dashboard-room-chip inline-flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/62">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-300" />
                {users.length ? `${users.length} ${t("leaderboard.metric.players")}` : t("leaderboard.loading")}
              </div>
              {currentUser && (
                <div className="dashboard-room-chip inline-flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/62">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  {t("leaderboard.you")} #{currentUser.rank}
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <div className="dashboard-room-subcard mt-4 min-w-[760px] overflow-hidden">
                <div className="grid grid-cols-[80px_minmax(0,1.6fr)_0.8fr_0.8fr_1fr_1fr] gap-3 border-b border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/46">
                  <div>{t("leaderboard.table.rank")}</div>
                  <div>{t("leaderboard.table.player")}</div>
                  <div>{t("home.stats.wins")}</div>
                  <div>{t("home.stats.losses")}</div>
                  <div>{t("leaderboard.table.winRate")}</div>
                  <div>{t("home.stats.profit")}</div>
                </div>

                {loading ? (
                  <div className="px-4 py-12 text-center text-sm text-white/45">{t("leaderboard.loading")}</div>
                ) : error ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-rose-300">
                    <ShieldAlert size={16} />
                    <span>{error}</span>
                  </div>
                ) : leaderboardRows.length ? (
                  leaderboardRows.map((item) => {
                    const isSelf = wallet && item.wallet.toLowerCase() === wallet.toLowerCase();
                    const rankTone =
                      item.rank === 1
                        ? "border-amber-400/20 bg-amber-500/[0.08] text-white"
                        : item.rank === 2
                          ? "border-cyan-400/18 bg-cyan-500/[0.08] text-white"
                          : item.rank === 3
                            ? "border-fuchsia-400/20 bg-fuchsia-500/[0.09] text-white"
                            : "border-white/[0.08] bg-white/[0.03] text-white/82";
                    return (
                      <div
                        key={item.wallet}
                        className={`grid grid-cols-[80px_minmax(0,1.6fr)_0.8fr_0.8fr_1fr_1fr] gap-3 border-b border-white/[0.05] px-4 py-4 text-sm last:border-b-0 ${
                          isSelf ? "bg-fuchsia-400/[0.06]" : "bg-transparent"
                        }`}
                      >
                        <div>
                          <span className={`inline-flex min-w-[54px] items-center justify-center rounded-full border px-2 py-1 text-[11px] font-black ${rankTone}`}>
                            #{item.rank}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-white">{shortAddr(item.wallet)}</div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/30">
                            {isSelf ? `${t("leaderboard.you")} · ${t("leaderboard.table.rank")} #${item.rank}` : t("leaderboard.playerLabel")}
                          </div>
                        </div>
                        <div className="font-black text-emerald-300">{item.wins}</div>
                        <div className="font-black text-rose-300">{item.losses}</div>
                        <div className="font-black text-cyan-200">{item.winRate.toFixed(1)}%</div>
                        <div className={`font-black ${item.profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {item.profit >= 0 ? "+" : ""}
                          {item.profit.toFixed(2)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-4 py-12 text-center text-sm text-white/45">{t("leaderboard.empty")}</div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
