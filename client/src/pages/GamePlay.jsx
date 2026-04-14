import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useGame } from "../context/GameContext";
import { useContract } from "../hooks/useContract";
import { useWallet } from "../context/WalletContext";
import { PredictButtons, CountdownRing, SettlementReveal } from "../components";
import { PREDICT_TIMEOUT, PREDICT_SAFE_BUFFER, SETTLE_DELAY } from "../config/constants";

export default function GamePlay() {
  const nav = useNavigate();
  const { on, emit } = useSocket();
  const { gameState, updateGame } = useGame();
  const { wallet } = useWallet();
  const { claimReward, claiming, getPlayerState, submitPrediction, predicting } = useContract();

  const initialPhase = gameState.phase === "predicting" && gameState.basePrice ? "predicting" : "waiting";

  const [phase, setPhase] = useState(initialPhase);
  const [countdown, setCountdown] = useState(gameState.countdown || PREDICT_TIMEOUT);
  const [myPrediction, setMyPrediction] = useState(null);
  const [predictedCount, setPredictedCount] = useState(0);
  const [basePrice, setBasePrice] = useState(gameState.basePrice || 0);
  const [currentPrice, setCurrentPrice] = useState(gameState.basePrice || 0);
  const [result, setResult] = useState(gameState.result || null);
  const [gameId, setGameId] = useState(gameState.gameId);
  const [chainGameId, setChainGameId] = useState(gameState.chainGameId || gameState.gameId);
  const [totalPlayers, setTotalPlayers] = useState(gameState.players?.length || 0);
  const [claimState, setClaimState] = useState({ claimed: false, error: null, success: null });
  const [predictSafeBuffer, setPredictSafeBuffer] = useState(PREDICT_SAFE_BUFFER);
  const [predictionDeadline, setPredictionDeadline] = useState(gameState.predictionDeadline || null);

  useEffect(() => {
    if (gameState.phase === "predicting" && gameState.basePrice) {
      setGameId(gameState.gameId);
      setChainGameId(gameState.chainGameId || gameState.gameId);
      setBasePrice(gameState.basePrice);
      setCurrentPrice(gameState.basePrice);
      setTotalPlayers(gameState.players?.length || 0);
      setPhase("predicting");
      setCountdown(gameState.countdown || PREDICT_TIMEOUT);
      setPredictSafeBuffer(gameState.predictSafeBuffer || PREDICT_SAFE_BUFFER);
      setPredictionDeadline(gameState.predictionDeadline || null);
    }
    if (gameState.phase === "result" && gameState.result) {
      setPhase("result");
      setResult(gameState.result);
      setChainGameId(gameState.chainGameId || gameState.result.chainGameId || gameState.gameId);
    }
  }, [gameState]);

  useEffect(() => {
    let cancelled = false;

    const syncPredictionForWallet = async () => {
      const targetChainGameId = chainGameId || gameState.chainGameId || gameId || gameState.gameId;
      if (!wallet || !targetChainGameId || phase !== "predicting") {
        setMyPrediction(null);
        return;
      }
      try {
        const state = await getPlayerState(targetChainGameId, wallet);
        if (cancelled) return;
        if (state?.prediction === 1) setMyPrediction("up");
        else if (state?.prediction === 2) setMyPrediction("down");
        else setMyPrediction(null);
      } catch {
        if (!cancelled) setMyPrediction(null);
      }
    };

    syncPredictionForWallet();
    return () => { cancelled = true; };
  }, [wallet, chainGameId, gameId, gameState.chainGameId, gameState.gameId, phase, getPlayerState]);

  useEffect(() => {
    const unsubscribers = [
      on("game:start", (data) => {
        setGameId(data.gameId || gameState.gameId);
        setChainGameId(data.chainGameId || gameState.chainGameId || data.gameId || gameState.gameId);
        setBasePrice(data.basePrice);
        setCurrentPrice(data.basePrice);
        setTotalPlayers(data.players?.length || 0);
        setPhase("predicting");
        setCountdown(Math.round((data.predictTimeout || 30000) / 1000));
        setPredictSafeBuffer(Math.round((data.predictSafeBuffer || PREDICT_SAFE_BUFFER * 1000) / 1000));
        setPredictionDeadline(data.predictionDeadline || null);
        setMyPrediction(null);
        setPredictedCount(0);
        setResult(null);
        setClaimState({ claimed: false, error: null, success: null });
      }),
      on("game:countdown", (data) => {
        setCountdown(data.remaining);
        if (data.currentPrice) setCurrentPrice(data.currentPrice);
        if (data.phase === "settling" && phase !== "settling" && phase !== "result") setPhase("settling");
      }),
      on("game:prediction", (data) => setPredictedCount(data.totalPredicted)),
      on("game:predicted", (data) => setMyPrediction(data.prediction)),
      on("game:phase", (data) => {
        if (data.phase === "settling") {
          setPhase("settling");
          setCountdown(Math.round((data.settleDelay || 10000) / 1000));
        }
      }),
      on("game:result", (data) => {
        setPhase("result");
        setResult(data);
        setChainGameId(data.chainGameId || gameState.chainGameId || data.gameId);
        setClaimState({ claimed: false, error: null, success: null });
        updateGame({
          gameId: data.gameId || gameState.gameId,
          chainGameId: data.chainGameId || gameState.chainGameId || data.gameId,
          phase: "result",
          result: data,
          settlementPrice: data.settlementPrice,
        });
      }),
      on("game:error", (data) => {
        alert(data.message);
        nav("/");
      }),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [on, nav, gameState, phase, updateGame]);

  const [predictionError, setPredictionError] = useState(null);

  const predict = async (prediction) => {
    try {
      setPredictionError(null);
      if (countdown <= predictSafeBuffer) {
        throw new Error(`Final ${predictSafeBuffer}s are reserved for on-chain confirmation. Please choose earlier next round.`);
      }
      const targetChainGameId = chainGameId || gameState.chainGameId || gameId || gameState.gameId;
      const signed = await submitPrediction(targetChainGameId, prediction);
      emit("game:predict", { gameId: gameId || gameState.gameId, prediction, signature: signed.signature, deadline: signed.deadline });
    } catch (error) {
      setPredictionError(error?.message || "Prediction failed. Please try again.");
    }
  };

  const handleClaimReward = async () => {
    try {
      setClaimState({ claimed: false, error: null, success: null });
      await claimReward(chainGameId || result?.chainGameId || gameState.chainGameId || gameId);
      setClaimState({
        claimed: true,
        error: null,
        success: `Reward claimed to wallet${result?.myResult?.reward ? `: +${result.myResult.reward.toFixed(4)} USDC` : "."}`,
      });
      setResult((previous) => previous ? ({
        ...previous,
        myResult: previous.myResult ? { ...previous.myResult, claimed: true } : previous.myResult,
      }) : previous);
    } catch (error) {
      setClaimState({ claimed: false, error: error?.message || "Claim failed. Please try again.", success: null });
    }
  };

  const rewardAmount = Number(result?.myResult?.reward || 0);
  const canClaimReward = phase === "result" && rewardAmount > 0 && !claimState.claimed && !result?.myResult?.claimed;

  const diff = currentPrice && basePrice ? currentPrice - basePrice : 0;
  const percent = basePrice ? ((diff / basePrice) * 100).toFixed(3) : "0";
  const priceColor = diff > 0 ? "text-emerald-400" : diff < 0 ? "text-rose-400" : "text-white/30";
  const currentChainGameId = useMemo(
    () => chainGameId || result?.chainGameId || gameState.chainGameId || gameId,
    [chainGameId, result, gameState.chainGameId, gameId],
  );
  const predictionBufferActive = phase === "predicting" && !myPrediction && countdown <= predictSafeBuffer;

  return (
    <div className="page-container flex flex-col items-center">
      {phase === "waiting" && (
        <div className="text-center pt-12 animate-slideUp">
          <div className="text-5xl mb-3 animate-float">⚔️</div>
          <h3 className="text-xl font-black text-gradient mb-1">Preparing Battle</h3>
          <p className="text-white/15 text-xs">Starting when all players are ready</p>
        </div>
      )}

      {phase === "predicting" && (
        <div className="w-full max-w-3xl animate-slideUp">
          <div className="card mb-4">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-white/20 text-[10px] uppercase tracking-[0.25em] mb-1">Battle In Progress</p>
                <h3 className="text-lg font-black">Make your prediction</h3>
                <p className="text-white/35 text-xs mt-1">Choose LONG if you think BTC will finish above the base price, or SHORT if you think it will finish below.</p>
              </div>
              <CountdownRing total={PREDICT_TIMEOUT} remaining={countdown} label="Time Left" size="lg" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 text-center">
                <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-1">Base Price</p>
                <p className="text-2xl font-mono font-black text-gradient">${basePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 text-center">
                <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-1">Live Price</p>
                <p className={`text-2xl font-mono font-black ${priceColor}`}>${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                <p className={`text-[11px] font-mono mt-1 ${priceColor}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)} ({percent}%)</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/25 text-xs">Players ready</p>
                <p className="text-white/40 text-xs font-mono">{predictedCount}/{totalPlayers}</p>
              </div>
              <PredictButtons onPredict={predict} myPrediction={myPrediction} disabled={predicting || predictionBufferActive} />
            </div>
            {predictionBufferActive && <div className="rounded-2xl border border-amber-500/15 bg-amber-500/10 text-amber-200 text-xs px-4 py-3 mb-4">Final {predictSafeBuffer}s are reserved for on-chain confirmation. Predictions are locked for this round.</div>}
            {predictionError && <div className="rounded-2xl border border-rose-500/15 bg-rose-500/10 text-rose-300 text-xs px-4 py-3 mb-4">{predictionError}</div>}
            {predicting && <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/10 text-cyan-200 text-xs px-4 py-3 mb-4">Waiting for wallet signature to lock your prediction...</div>}
            {myPrediction && (
              <div className={`rounded-2xl border p-4 text-center ${myPrediction === "up" ? "bg-emerald-500/[0.06] border-emerald-500/20" : "bg-rose-500/[0.06] border-rose-500/20"}`}>
                <p className="text-white/25 text-[10px] uppercase tracking-[0.2em] mb-1">Your Position</p>
                <p className={`text-2xl font-black ${myPrediction === "up" ? "text-emerald-400" : "text-rose-400"}`}>{myPrediction === "up" ? "📈 LONG" : "📉 SHORT"}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "settling" && (
        <div className="w-full max-w-2xl animate-slideUp">
          <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[#22160f] via-[#17110d] to-[#120d0a] shadow-2xl shadow-orange-900/20 p-6 text-center">
            <div className="text-4xl mb-3 animate-float">⏳</div>
            <h3 className="text-lg font-black text-white/80 mb-4">Settling...</h3>
            <div className="flex justify-center mb-4">
              <CountdownRing total={SETTLE_DELAY} remaining={countdown} label="Reveal" size="lg" />
            </div>
            <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4 text-center">
              <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-1">Live Price</p>
              <p className={`text-2xl font-mono font-black ${priceColor}`}>${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
              <p className={`text-[11px] font-mono mt-1 ${priceColor}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)} ({percent}%)</p>
            </div>
            {myPrediction && (
              <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-3">
                <p className="text-white/25 text-[10px] uppercase tracking-[0.2em] mb-1">Your Call</p>
                <p className={myPrediction === "up" ? "text-emerald-400 font-black" : "text-rose-400 font-black"}>{myPrediction === "up" ? "LONG" : "SHORT"}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <div className="w-full max-w-2xl animate-slideUp">
          <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[#22160f] via-[#17110d] to-[#120d0a] shadow-2xl shadow-orange-900/20 p-6">
            <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4 mb-4">
              <SettlementReveal basePrice={result.basePrice} settlementPrice={result.settlementPrice} direction={result.direction} />
            </div>

            {result.myResult && (
              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-5 text-center">
                <div className="text-4xl mb-2">{result.myResult.isCorrect ? "🏆" : "💀"}</div>
                <h3 className={`text-xl font-black ${result.myResult.isCorrect ? "text-emerald-400" : "text-rose-400"}`}>{result.myResult.isCorrect ? "Victory!" : "Defeated"}</h3>
                <p className="text-white/20 text-[10px] mt-1 mb-2">You predicted {result.myResult.prediction === "up" ? "LONG" : result.myResult.prediction === "down" ? "SHORT" : "NO POSITION"}</p>
                <div className={`text-3xl font-black font-mono ${rewardAmount > 0 ? "text-emerald-400" : "text-rose-400"}`}>{rewardAmount > 0 ? `+${rewardAmount.toFixed(4)}` : "-1.0000"} <span className="text-sm text-white/20">USDC</span></div>
                <p className="text-white/30 text-[11px] mt-3">
                  {rewardAmount > 0 ? "Your reward is ready on-chain. Claim it to return funds to your wallet." : "This round has no claimable reward for your wallet."}
                </p>
                {currentChainGameId ? (
                  <p className="text-white/15 text-[10px] mt-2 font-mono">Chain Game #{currentChainGameId}</p>
                ) : null}
              </div>
            )}

            {rewardAmount > 0 && (
              <div className="mt-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-emerald-300 text-xs font-bold uppercase tracking-[0.2em]">Reward Claim</p>
                    <p className="text-white/40 text-xs mt-1">Winning funds are finalized on-chain after you confirm the claim transaction.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/20 text-[10px] uppercase tracking-[0.2em]">Claimable</p>
                    <p className="text-emerald-400 font-mono font-black text-lg">{rewardAmount.toFixed(4)} USDC</p>
                  </div>
                </div>

                {claimState.error && <div className="bg-rose-500/10 border border-rose-500/15 text-rose-300 px-3 py-2 rounded-xl text-xs mb-3">{claimState.error}</div>}
                {claimState.success && <div className="bg-emerald-500/10 border border-emerald-500/15 text-emerald-300 px-3 py-2 rounded-xl text-xs mb-3">{claimState.success}</div>}

                <button
                  onClick={handleClaimReward}
                  disabled={!canClaimReward || claiming}
                  className={`w-full py-3 rounded-xl font-black text-sm transition ${
                    claimState.claimed
                      ? "bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 cursor-default"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-40"
                  }`}
                >
                  {claimState.claimed || result?.myResult?.claimed ? "Reward Claimed" : claiming ? "Claiming Reward..." : "Claim Reward"}
                </button>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => nav("/arena")} className="flex-1 py-2.5 rounded-xl bg-amber-500/[0.05] border border-amber-500/15 hover:bg-amber-500/[0.08] transition text-xs text-white/60">Battle</button>
              <button onClick={() => nav("/match")} className="flex-1 btn-primary !py-2.5 font-black !text-sm">Rematch</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
