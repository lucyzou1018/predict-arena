import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useGame } from "../context/GameContext";
import { useContract } from "../hooks/useContract";
import { useWallet } from "../context/WalletContext";
import { PredictButtons, CountdownRing, SettlementReveal } from "../components";
import { PREDICT_TIMEOUT, PREDICT_SAFE_BUFFER, SERVER_URL, SETTLE_DELAY } from "../config/constants";

const SHARE_TEXT = "Think you know where BTC goes next? 📈📉 Battle me on PredictArena. ⚔️ https://predict-arena-test.vercel.app/arena";
const predictionStorageKey = (gameId, wallet) => `predict-arena:prediction:${gameId}:${wallet?.toLowerCase?.()}`;

function readStoredPrediction(gameId, wallet) {
  if (typeof window === "undefined" || !gameId || !wallet) return null;
  try {
    const value = window.sessionStorage.getItem(predictionStorageKey(gameId, wallet));
    return value === "up" || value === "down" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredPrediction(gameId, wallet, prediction) {
  if (typeof window === "undefined" || !gameId || !wallet || !prediction) return;
  try {
    window.sessionStorage.setItem(predictionStorageKey(gameId, wallet), prediction);
  } catch {}
}

function clearStoredPrediction(gameId, wallet) {
  if (typeof window === "undefined" || !gameId || !wallet) return;
  try {
    window.sessionStorage.removeItem(predictionStorageKey(gameId, wallet));
  } catch {}
}

export default function GamePlay() {
  const nav = useNavigate();
  const { on, emit } = useSocket();
  const { gameState, updateGame, resetGame } = useGame();
  const { wallet } = useWallet();
  const { claimGameFunds, claiming, getGameClaimStatus, getPlayerState, submitPrediction, predicting } = useContract();

  const initialPhase = (gameState.phase === "predicting" || gameState.phase === "settling") && gameState.basePrice
    ? gameState.phase
    : gameState.phase === "result" && gameState.result
      ? "result"
      : gameState.phase === "failed"
        ? "failed"
        : "waiting";

  const [phase, setPhase] = useState(initialPhase);
  const [countdown, setCountdown] = useState(gameState.countdown || PREDICT_TIMEOUT);
  const [myPrediction, setMyPrediction] = useState(null);
  const [pendingPrediction, setPendingPrediction] = useState(null);
  const [predictedCount, setPredictedCount] = useState(gameState.predictedCount || 0);
  const [basePrice, setBasePrice] = useState(gameState.basePrice || 0);
  const [currentPrice, setCurrentPrice] = useState(gameState.currentPrice || gameState.basePrice || 0);
  const [result, setResult] = useState(gameState.result || null);
  const [gameId, setGameId] = useState(gameState.gameId);
  const [chainGameId, setChainGameId] = useState(gameState.chainGameId || gameState.gameId);
  const [totalPlayers, setTotalPlayers] = useState(gameState.players?.length || 0);
  const [claimState, setClaimState] = useState({ claimed: false, error: null, success: null });
  const [claimStatus, setClaimStatus] = useState(null);
  const [claimStatusLoading, setClaimStatusLoading] = useState(false);
  const [failureMessage, setFailureMessage] = useState(gameState.failureMessage || null);
  const [predictSafeBuffer, setPredictSafeBuffer] = useState(PREDICT_SAFE_BUFFER);
  const [predictionDeadline, setPredictionDeadline] = useState(gameState.predictionDeadline || null);
  const currentGameId = useMemo(
    () => gameId || result?.gameId || gameState.gameId,
    [gameId, result, gameState.gameId],
  );
  const currentChainGameId = useMemo(
    () => chainGameId || result?.chainGameId || gameState.chainGameId || gameId,
    [chainGameId, result, gameState.chainGameId, gameId],
  );

  const syncGameFromServer = useCallback(async (targetGameId = currentGameId) => {
    if (!targetGameId) return null;
    try {
      const response = await fetch(`${SERVER_URL}/api/games/${targetGameId}`);
      if (!response.ok) return null;
      const data = await response.json();
      const game = data?.game;
      const players = Array.isArray(data?.players) ? data.players : [];
      if (!game) return null;

      const nextGameId = Number(game.id || targetGameId);
      const nextChainGameId = Number(game.chain_game_id || nextGameId);
      const playerWallets = players.map((player) => player.wallet_address?.toLowerCase?.()).filter(Boolean);
      const walletLower = wallet?.toLowerCase?.() || null;
      const myRow = walletLower ? players.find((player) => player.wallet_address?.toLowerCase?.() === walletLower) : null;
      const nextBasePrice = Number(game.base_price || 0);
      const nextSettlementPrice = Number(game.settlement_price || 0);

      if (game.state === "settled") {
        const playerState = walletLower ? await getPlayerState(nextChainGameId, walletLower) : null;
        const restoredResult = {
          gameId: nextGameId,
          chainGameId: nextChainGameId,
          basePrice: nextBasePrice,
          settlementPrice: nextSettlementPrice,
          direction: nextSettlementPrice > nextBasePrice ? "up" : nextSettlementPrice < nextBasePrice ? "down" : "flat",
          myResult: myRow ? {
            wallet: myRow.wallet_address?.toLowerCase?.() || walletLower,
            prediction: myRow.prediction,
            isCorrect: myRow.is_correct === null || myRow.is_correct === undefined ? null : !!myRow.is_correct,
            reward: Number(myRow.reward || 0),
            claimed: !!playerState?.claimed,
          } : null,
          platformFee: 0,
        };
        setGameId(nextGameId);
        setChainGameId(nextChainGameId);
        setBasePrice(nextBasePrice);
        setCurrentPrice(nextSettlementPrice || nextBasePrice);
        setTotalPlayers(playerWallets.length);
        setPhase("result");
        setCountdown(0);
        setResult(restoredResult);
        setFailureMessage(null);
        setClaimStatus(null);
        setClaimState({ claimed: false, error: null, success: null });
        updateGame({
          gameId: nextGameId,
          chainGameId: nextChainGameId,
          players: playerWallets,
          basePrice: nextBasePrice,
          currentPrice: nextSettlementPrice || nextBasePrice,
          phase: "result",
          result: restoredResult,
          settlementPrice: nextSettlementPrice,
          failureMessage: null,
        });
        return restoredResult;
      }

      if (game.state === "failed") {
        const message = game.error_message || "Settlement was interrupted. Funds remain safe on-chain.";
        setGameId(nextGameId);
        setChainGameId(nextChainGameId);
        setBasePrice(nextBasePrice);
        setCurrentPrice(nextBasePrice);
        setTotalPlayers(playerWallets.length);
        setPhase("failed");
        setCountdown(0);
        setFailureMessage(message);
        setResult(null);
        setClaimStatus(null);
        setClaimState({ claimed: false, error: null, success: null });
        updateGame({
          gameId: nextGameId,
          chainGameId: nextChainGameId,
          players: playerWallets,
          basePrice: nextBasePrice,
          currentPrice: nextBasePrice,
          phase: "failed",
          failureMessage: message,
          result: null,
        });
        return { phase: "failed", gameId: nextGameId };
      }

      if (game.state === "active") {
        const nextPhase = phase === "settling" || gameState.phase === "settling" ? "settling" : "predicting";
        setGameId(nextGameId);
        setChainGameId(nextChainGameId);
        setBasePrice(nextBasePrice);
        setCurrentPrice((previous) => previous || nextBasePrice);
        setTotalPlayers(playerWallets.length);
        setPhase(nextPhase);
        updateGame({
          gameId: nextGameId,
          chainGameId: nextChainGameId,
          players: playerWallets,
          basePrice: nextBasePrice,
          currentPrice: nextBasePrice,
          phase: nextPhase,
        });
      }
      return game;
    } catch {
      return null;
    }
  }, [currentGameId, gameState.phase, getPlayerState, phase, updateGame, wallet]);

  const refreshClaimStatus = useCallback(async (targetChainGameId = currentChainGameId, silent = false) => {
    if (!wallet || !targetChainGameId) {
      setClaimStatus(null);
      return null;
    }
    if (!silent) setClaimStatusLoading(true);
    try {
      const status = await getGameClaimStatus(targetChainGameId, wallet);
      setClaimStatus(status);
      if (status?.claimed) {
        setClaimState((previous) => ({ ...previous, claimed: true }));
      }
      return status;
    } finally {
      if (!silent) setClaimStatusLoading(false);
    }
  }, [currentChainGameId, getGameClaimStatus, wallet]);

  useEffect(() => {
    if ((gameState.phase === "predicting" || gameState.phase === "settling") && gameState.basePrice) {
      setGameId(gameState.gameId);
      setChainGameId(gameState.chainGameId || gameState.gameId);
      setBasePrice(gameState.basePrice);
      setCurrentPrice(gameState.currentPrice || gameState.basePrice);
      setTotalPlayers(gameState.players?.length || 0);
      setPhase(gameState.phase);
      setCountdown(gameState.countdown || PREDICT_TIMEOUT);
      setPredictSafeBuffer(gameState.predictSafeBuffer || PREDICT_SAFE_BUFFER);
      setPredictionDeadline(gameState.predictionDeadline || null);
      setPredictedCount(gameState.predictedCount || 0);
      setResult(null);
      setPendingPrediction(null);
      setFailureMessage(null);
      setClaimStatus(null);
      setClaimState({ claimed: false, error: null, success: null });
    }
    if (gameState.phase === "result" && gameState.result) {
      setGameId(gameState.gameId || gameState.result.gameId);
      setPhase("result");
      setResult(gameState.result);
      setChainGameId(gameState.chainGameId || gameState.result.chainGameId || gameState.gameId);
      setBasePrice(gameState.result.basePrice || gameState.basePrice || 0);
      setCurrentPrice(gameState.result.settlementPrice || gameState.currentPrice || gameState.basePrice || 0);
      setTotalPlayers(gameState.players?.length || totalPlayers);
      setPendingPrediction(null);
      setFailureMessage(null);
      setClaimStatus(null);
      setClaimState({ claimed: false, error: null, success: null });
    }
    if (gameState.phase === "failed") {
      setGameId(gameState.gameId);
      setChainGameId(gameState.chainGameId || gameState.gameId);
      setBasePrice(gameState.basePrice || 0);
      setCurrentPrice(gameState.currentPrice || gameState.basePrice || 0);
      setTotalPlayers(gameState.players?.length || 0);
      setPhase("failed");
      setCountdown(0);
      setPendingPrediction(null);
      setFailureMessage(gameState.failureMessage || "Settlement was interrupted. Funds remain safe on-chain.");
    }
  }, [gameState, totalPlayers]);

  useEffect(() => {
    setPendingPrediction(null);
  }, [wallet, chainGameId, gameId]);

  useEffect(() => {
    let cancelled = false;

    const syncPredictionForWallet = async () => {
      const targetChainGameId = chainGameId || gameState.chainGameId || gameId || gameState.gameId;
      const shouldTrackPrediction = phase === "predicting" || phase === "settling" || phase === "result" || phase === "failed";
      if (!wallet || !targetChainGameId || !shouldTrackPrediction) {
        setMyPrediction(null);
        return;
      }
      try {
        const state = await getPlayerState(targetChainGameId, wallet);
        if (cancelled) return;
        if (state?.prediction === 1) {
          writeStoredPrediction(targetChainGameId, wallet, "up");
          setMyPrediction("up");
        } else if (state?.prediction === 2) {
          writeStoredPrediction(targetChainGameId, wallet, "down");
          setMyPrediction("down");
        } else {
          setMyPrediction(readStoredPrediction(targetChainGameId, wallet));
        }
      } catch {
        if (!cancelled) setMyPrediction(readStoredPrediction(targetChainGameId, wallet));
      }
    };

    syncPredictionForWallet();
    return () => { cancelled = true; };
  }, [wallet, chainGameId, gameId, gameState.chainGameId, gameState.gameId, phase, getPlayerState]);

  useEffect(() => {
    if (!currentGameId) return undefined;
    let cancelled = false;
    const sync = async () => {
      const restored = await syncGameFromServer(currentGameId);
      if (cancelled) return;
      if (!restored && phase === "waiting") {
        setFailureMessage("We couldn't restore this battle yet. Give it a moment or return home.");
      }
    };
    void sync();
    return () => { cancelled = true; };
  }, [currentGameId, phase, syncGameFromServer]);

  useEffect(() => {
    let cancelled = false;

    if (phase !== "failed") {
      setClaimStatus(null);
      setClaimStatusLoading(false);
      return undefined;
    }

    const pollClaimStatus = async (silent = false) => {
      try {
        const status = await refreshClaimStatus(currentChainGameId, silent);
        if (cancelled || !status) return;
        if (status.state === 3 && result?.myResult && !status.canClaimReward && !status.claimed) {
          setClaimState((previous) => ({ ...previous, claimed: false }));
        }
      } catch {
        if (!cancelled && !silent) setClaimStatus(null);
      }
    };

    void pollClaimStatus(false);
    const intervalId = setInterval(() => {
      void pollClaimStatus(true);
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [phase, currentChainGameId, refreshClaimStatus, result]);

  useEffect(() => {
    const unsubscribers = [
      on("game:start", (data) => {
        const nextGameId = data.gameId || gameState.gameId;
        const nextChainGameId = data.chainGameId || gameState.chainGameId || data.gameId || gameState.gameId;
        const nextPlayers = data.players || [];
        const nextCountdown = Math.round((data.predictTimeout || 30000) / 1000);
        const nextPredictSafeBuffer = Math.round((data.predictSafeBuffer || PREDICT_SAFE_BUFFER * 1000) / 1000);
        setGameId(nextGameId);
        setChainGameId(nextChainGameId);
        setBasePrice(data.basePrice);
        setCurrentPrice(data.basePrice);
        setTotalPlayers(nextPlayers.length || 0);
        setPhase("predicting");
        setCountdown(nextCountdown);
        setPredictSafeBuffer(nextPredictSafeBuffer);
        setPredictionDeadline(data.predictionDeadline || null);
        setMyPrediction(null);
        setPendingPrediction(null);
        setPredictedCount(0);
        setResult(null);
        setFailureMessage(null);
        setClaimStatus(null);
        setClaimState({ claimed: false, error: null, success: null });
        updateGame({
          gameId: nextGameId,
          chainGameId: nextChainGameId,
          players: nextPlayers,
          basePrice: data.basePrice,
          currentPrice: data.basePrice,
          phase: "predicting",
          countdown: nextCountdown,
          predictSafeBuffer: nextPredictSafeBuffer,
          predictionDeadline: data.predictionDeadline || null,
          predictedCount: 0,
          result: null,
          failureMessage: null,
        });
      }),
      on("game:resume", (data) => {
        const nextPhase = data.phase === "settling" ? "settling" : "predicting";
        const nextGameId = data.gameId || gameState.gameId;
        const nextChainGameId = data.chainGameId || gameState.chainGameId || data.gameId || gameState.gameId;
        const nextPlayers = data.players || gameState.players || [];
        const nextCountdown = Number.isFinite(data.remaining) ? data.remaining : Math.round((data.predictTimeout || 30000) / 1000);
        const nextPredictSafeBuffer = Math.round((data.predictSafeBuffer || PREDICT_SAFE_BUFFER * 1000) / 1000);
        setGameId(nextGameId);
        setChainGameId(nextChainGameId);
        setBasePrice(data.basePrice || 0);
        setCurrentPrice(data.currentPrice || data.basePrice || 0);
        setTotalPlayers(data.totalPlayers || nextPlayers.length || 0);
        setPhase(nextPhase);
        setCountdown(nextCountdown);
        setPredictSafeBuffer(nextPredictSafeBuffer);
        setPredictionDeadline(data.predictionDeadline || null);
        setPredictedCount(data.totalPredicted || 0);
        setResult(null);
        setFailureMessage(null);
        setClaimStatus(null);
        setClaimState({ claimed: false, error: null, success: null });
        updateGame({
          gameId: nextGameId,
          chainGameId: nextChainGameId,
          players: nextPlayers,
          basePrice: data.basePrice || 0,
          currentPrice: data.currentPrice || data.basePrice || 0,
          phase: nextPhase,
          countdown: nextCountdown,
          predictSafeBuffer: nextPredictSafeBuffer,
          predictionDeadline: data.predictionDeadline || null,
          predictedCount: data.totalPredicted || 0,
          result: null,
          failureMessage: null,
        });
      }),
      on("game:countdown", (data) => {
        setCountdown(data.remaining);
        if (data.currentPrice) setCurrentPrice(data.currentPrice);
        if (data.phase === "settling" && phase !== "settling" && phase !== "result") setPhase("settling");
      }),
      on("game:prediction", (data) => {
        setPredictedCount(data.totalPredicted);
        updateGame({ predictedCount: data.totalPredicted });
      }),
      on("game:predicted", (data) => {
        const targetChainGameId = chainGameId || gameState.chainGameId || gameId || gameState.gameId;
        if (wallet && targetChainGameId) writeStoredPrediction(targetChainGameId, wallet, data.prediction);
        setPendingPrediction(null);
        setMyPrediction(data.prediction);
        updateGame({ myPrediction: data.prediction });
      }),
      on("game:phase", (data) => {
        if (data.phase === "settling") {
          setPhase("settling");
          setCountdown(Math.round((data.settleDelay || 10000) / 1000));
          updateGame({ phase: "settling", countdown: Math.round((data.settleDelay || 10000) / 1000) });
        }
      }),
      on("game:result", (data) => {
        const nextGameId = data.gameId || gameState.gameId;
        const nextChainGameId = data.chainGameId || gameState.chainGameId || data.gameId;
        setPhase("result");
        setResult(data);
        setGameId(nextGameId);
        setChainGameId(nextChainGameId);
        setBasePrice(data.basePrice || basePrice);
        setCurrentPrice(data.settlementPrice || data.basePrice || basePrice);
        setCountdown(0);
        setFailureMessage(null);
        setClaimStatus(null);
        setClaimState({ claimed: false, error: null, success: null });
        updateGame({
          gameId: nextGameId,
          chainGameId: nextChainGameId,
          phase: "result",
          result: data,
          settlementPrice: data.settlementPrice,
          currentPrice: data.settlementPrice || data.basePrice || basePrice,
          failureMessage: null,
        });
      }),
      on("game:failed", (data) => {
        const message = data.message || "Settlement was interrupted. Funds remain safe on-chain.";
        const nextGameId = data.gameId || gameState.gameId;
        const nextChainGameId = data.chainGameId || gameState.chainGameId || data.gameId;
        setPhase("failed");
        setCountdown(0);
        setPendingPrediction(null);
        setGameId(nextGameId);
        setChainGameId(nextChainGameId);
        setBasePrice(data.basePrice || basePrice);
        setCurrentPrice(data.basePrice || basePrice);
        setFailureMessage(message);
        setClaimState({ claimed: false, error: null, success: null });
        updateGame({
          gameId: nextGameId,
          chainGameId: nextChainGameId,
          phase: "failed",
          failureMessage: message,
          basePrice: data.basePrice || basePrice,
          currentPrice: data.basePrice || basePrice,
        });
      }),
      on("game:error", (data) => {
        setPendingPrediction(null);
        const message = data.message || "Game error";
        if (message === "Not in this game") {
          resetGame();
          nav("/", { replace: true });
          return;
        }
        if ((phase === "settling" || phase === "failed") && message.toLowerCase().includes("settlement")) {
          setPhase("failed");
          setCountdown(0);
          setFailureMessage(message);
          setClaimState({ claimed: false, error: null, success: null });
          updateGame({
            gameId: gameId || gameState.gameId,
            chainGameId: currentChainGameId,
            phase: "failed",
            failureMessage: message,
            basePrice,
          });
          return;
        }
        if (phase === "predicting") {
          if (!myPrediction) {
            clearStoredPrediction(currentChainGameId, wallet);
          }
          setPredictionError(message);
          return;
        }
        alert(message);
        nav("/");
      }),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [on, nav, gameState, phase, updateGame, resetGame, gameId, currentChainGameId, basePrice, wallet, myPrediction]);

  useEffect(() => {
    if (!wallet || !currentGameId) return;
    emit("game:resume:request");
  }, [wallet, currentGameId, emit]);

  const [predictionError, setPredictionError] = useState(null);

  const predict = async (prediction) => {
    try {
      setPredictionError(null);
      if (countdown <= predictSafeBuffer) {
        throw new Error(`Final ${predictSafeBuffer}s are reserved for on-chain confirmation. Please choose earlier next round.`);
      }
      const targetChainGameId = chainGameId || gameState.chainGameId || gameId || gameState.gameId;
      setPendingPrediction(prediction);
      const submitted = await submitPrediction(targetChainGameId, prediction, predictionDeadline);
      emit("game:predict", {
        gameId: gameId || gameState.gameId,
        prediction,
        deadline: submitted.deadline,
        hash: submitted.hash,
      });
    } catch (error) {
      setPendingPrediction(null);
      setPredictionError(error?.message || "Prediction failed. Please try again.");
    }
  };

  const handleClaimFunds = async () => {
    const targetChainGameId = currentChainGameId || chainGameId || gameState.chainGameId || gameId;
    try {
      setClaimState({ claimed: false, error: null, success: null });
      const payout = await claimGameFunds(targetChainGameId, wallet);
      const latestStatus = await refreshClaimStatus(targetChainGameId, true);
      const claimedAmount = payout?.type === "refund"
        ? latestStatus?.entryFee ?? claimStatus?.entryFee
        : latestStatus?.reward ?? rewardAmount;
      setClaimState({
        claimed: true,
        error: null,
        success: payout?.type === "refund"
          ? `Refund claimed to wallet${claimedAmount ? `: ${claimedAmount.toFixed(4)} USDC` : "."}`
          : `Reward claimed to wallet${claimedAmount ? `: +${claimedAmount.toFixed(4)} USDC` : "."}`,
      });
      if (payout?.type !== "refund") {
        setResult((previous) => previous ? ({
          ...previous,
          myResult: previous.myResult ? { ...previous.myResult, claimed: true } : previous.myResult,
        }) : previous);
      }
    } catch (error) {
      setClaimState({ claimed: false, error: error?.message || "Claim failed. Please try again.", success: null });
    }
  };

  const handleShareToX = () => {
    if (typeof window === "undefined") return;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const rewardAmount = Number(result?.myResult?.reward || 0);
  const canClaimReward = phase === "result" && rewardAmount > 0 && !claimState.claimed && !result?.myResult?.claimed;

  const diff = currentPrice && basePrice ? currentPrice - basePrice : 0;
  const percent = basePrice ? ((diff / basePrice) * 100).toFixed(3) : "0";
  const priceColor = diff > 0 ? "text-emerald-400" : diff < 0 ? "text-rose-400" : "text-white/30";
  const formatPredictionLabel = (prediction) => {
    if (prediction === "up") return "LONG";
    if (prediction === "down") return "SHORT";
    return null;
  };
  const displayedPrediction = myPrediction || pendingPrediction;
  const normalizedPlayers = useMemo(
    () => (Array.isArray(gameState.players) ? gameState.players.map((player) => player?.toLowerCase?.()).filter(Boolean) : []),
    [gameState.players],
  );
  const currentWallet = wallet?.toLowerCase?.() || null;
  const hostWallet = normalizedPlayers[0] || null;
  const viewerRole = !currentWallet || normalizedPlayers.length === 0
    ? null
    : currentWallet === hostWallet
      ? "Host"
      : normalizedPlayers.includes(currentWallet)
        ? "Challenger"
        : "Viewer";
  const predictionBufferActive = phase === "predicting" && !displayedPrediction && countdown <= predictSafeBuffer;
  const resultPrediction = result?.myResult?.prediction || displayedPrediction;
  const resultPredictionLabel = formatPredictionLabel(resultPrediction);
  const refundWaitSeconds = claimStatus?.refundUnlockAt ? Math.max(0, claimStatus.refundUnlockAt - Math.floor(Date.now() / 1000)) : null;
  const canClaimFailedFunds = !!(claimStatus?.canClaimReward || claimStatus?.canClaimRefund || claimStatus?.canForceRefund);
  const failedClaimLabel = claimStatus?.canClaimReward ? "Claim Reward" : "Claim Refund";

  useEffect(() => {
    const hasResolvedPlayers = normalizedPlayers.length > 0;
    const inBattlePhase = phase === "predicting" || phase === "settling" || phase === "result" || phase === "failed";
    if (!currentWallet || !hasResolvedPlayers || !inBattlePhase) return;
    if (normalizedPlayers.includes(currentWallet)) return;
    resetGame();
    nav("/", { replace: true });
  }, [currentWallet, normalizedPlayers, phase, nav, resetGame]);

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
              <PredictButtons onPredict={predict} myPrediction={displayedPrediction} disabled={predicting || predictionBufferActive} />
            </div>
            {predictionBufferActive && <div className="rounded-2xl border border-amber-500/15 bg-amber-500/10 text-amber-200 text-xs px-4 py-3 mb-4">Final {predictSafeBuffer}s are reserved for on-chain confirmation. Predictions are locked for this round.</div>}
            {predictionError && <div className="rounded-2xl border border-rose-500/15 bg-rose-500/10 text-rose-300 text-xs px-4 py-3 mb-4">{predictionError}</div>}
            {predicting && <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/10 text-cyan-200 text-xs px-4 py-3 mb-4">Confirm the transaction in your wallet to lock this prediction on-chain.</div>}
            {displayedPrediction && (
              <div className={`rounded-2xl border p-4 text-center ${displayedPrediction === "up" ? "bg-emerald-500/[0.06] border-emerald-500/20" : "bg-rose-500/[0.06] border-rose-500/20"}`}>
                <p className="text-white/25 text-[10px] uppercase tracking-[0.2em] mb-1">Your Position</p>
                <p className={`text-2xl font-black ${displayedPrediction === "up" ? "text-emerald-400" : "text-rose-400"}`}>{displayedPrediction === "up" ? "📈 LONG" : "📉 SHORT"}</p>
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
            {viewerRole && (
              <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-white/25 text-[10px] uppercase tracking-[0.2em] mb-1">Viewing As</p>
                <p className="text-white/75 font-semibold">{viewerRole}</p>
              </div>
            )}
            {displayedPrediction && (
              <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-3">
                <p className="text-white/25 text-[10px] uppercase tracking-[0.2em] mb-1">Your Call</p>
                <p className={displayedPrediction === "up" ? "text-emerald-400 font-black" : "text-rose-400 font-black"}>{displayedPrediction === "up" ? "LONG" : "SHORT"}</p>
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4 text-center">
                <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-1">Base Price</p>
                <p className="text-2xl font-mono font-black text-white/80">${basePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4 text-center">
                <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-1">Current Price</p>
                <p className={`text-2xl font-mono font-black ${priceColor}`}>${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                <p className={`text-[11px] font-mono mt-1 ${priceColor}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)} ({percent}%)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "failed" && (
        <div className="w-full max-w-2xl animate-slideUp">
          <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[#22160f] via-[#17110d] to-[#120d0a] shadow-2xl shadow-orange-900/20 p-6">
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-lg font-black text-white/85">Settlement Interrupted</h3>
              <p className="text-white/45 text-xs mt-2 leading-relaxed">
                {failureMessage || "Settlement was interrupted. Funds remain safe on-chain while recovery options load."}
              </p>
              {currentChainGameId ? (
                <p className="text-white/15 text-[10px] mt-3 font-mono">Chain Game #{currentChainGameId}</p>
              ) : null}
            </div>

            {displayedPrediction && (
              <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4 text-center">
                <p className="text-white/25 text-[10px] uppercase tracking-[0.2em] mb-1">Your Call</p>
                <p className={displayedPrediction === "up" ? "text-emerald-400 font-black text-xl" : "text-rose-400 font-black text-xl"}>
                  {displayedPrediction === "up" ? "LONG" : "SHORT"}
                </p>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4 text-center">
                <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-1">Base Price</p>
                <p className="text-2xl font-mono font-black text-white/80">${basePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4 text-center">
                <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-1">Current Price</p>
                <p className={`text-2xl font-mono font-black ${priceColor}`}>${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                <p className={`text-[11px] font-mono mt-1 ${priceColor}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)} ({percent}%)</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-amber-300 text-xs font-bold uppercase tracking-[0.2em]">Recovery</p>
                  <p className="text-white/40 text-xs mt-1">We keep checking the contract so you can claim the correct outcome from this page.</p>
                </div>
                {claimStatus?.state === 3 && claimStatus?.reward > 0 && (
                  <div className="text-right">
                    <p className="text-white/20 text-[10px] uppercase tracking-[0.2em]">On-Chain Reward</p>
                    <p className="text-emerald-400 font-mono font-black text-lg">{claimStatus.reward.toFixed(4)} USDC</p>
                  </div>
                )}
              </div>

              {claimState.error && <div className="bg-rose-500/10 border border-rose-500/15 text-rose-300 px-3 py-2 rounded-xl text-xs mb-3">{claimState.error}</div>}
              {claimState.success && <div className="bg-emerald-500/10 border border-emerald-500/15 text-emerald-300 px-3 py-2 rounded-xl text-xs mb-3">{claimState.success}</div>}

              {claimStatusLoading ? (
                <p className="text-white/40 text-xs">Checking on-chain recovery status...</p>
              ) : !wallet ? (
                <p className="text-white/40 text-xs">Reconnect your wallet to see recovery options.</p>
              ) : !claimStatus ? (
                <p className="text-white/40 text-xs">Recovery status is temporarily unavailable. Refresh in a moment.</p>
              ) : claimStatus.claimed || claimState.claimed ? (
                <p className="text-emerald-300 text-xs">Funds for this round have already been claimed to your wallet.</p>
              ) : canClaimFailedFunds ? (
                <div className="space-y-2">
                  <p className="text-white/50 text-xs">
                    {claimStatus.canClaimReward
                      ? "The round has already settled on-chain. You can claim your reward now."
                      : claimStatus.canForceRefund
                        ? "The grace period has expired. We can unlock the emergency refund and claim it in one flow."
                        : "Refund is ready on-chain. Confirm one transaction to return your entry fee."}
                  </p>
                  <button
                    onClick={handleClaimFunds}
                    disabled={!canClaimFailedFunds || claiming}
                    className="w-full py-3 rounded-xl font-black text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-40"
                  >
                    {claiming ? "Claiming..." : failedClaimLabel}
                  </button>
                </div>
              ) : claimStatus.state === 3 ? (
                <p className="text-white/45 text-xs">The round is settled on-chain, but this wallet has no claimable reward for this outcome.</p>
              ) : claimStatus.state === 2 && refundWaitSeconds !== null ? (
                <p className="text-white/45 text-xs">
                  Settlement is still syncing. If the oracle does not finish first, the refund path unlocks in about {refundWaitSeconds}s.
                </p>
              ) : (
                <p className="text-white/45 text-xs">Recovery is still syncing. You can also return to the home page and check history later.</p>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => nav("/")} className="flex-1 py-2.5 rounded-xl bg-amber-500/[0.05] border border-amber-500/15 hover:bg-amber-500/[0.08] transition text-xs text-white/60">Home</button>
              <button onClick={handleShareToX} className="flex-1 btn-primary !py-2.5 font-black !text-sm">Share to 𝕏</button>
            </div>
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

            {resultPredictionLabel && (
              <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4 text-center">
                <p className="text-white/25 text-[10px] uppercase tracking-[0.2em] mb-1">Your Call</p>
                <p className={resultPrediction === "up" ? "text-emerald-400 font-black text-xl" : "text-rose-400 font-black text-xl"}>{resultPredictionLabel}</p>
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
                  onClick={handleClaimFunds}
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
              <button onClick={handleShareToX} className="flex-1 btn-primary !py-2.5 font-black !text-sm">Share to 𝕏</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
