import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useGame } from "../context/GameContext";
import { useContract } from "../hooks/useContract";
import { useWallet } from "../context/WalletContext";
import { useT } from "../context/LangContext";
import { PredictButtons, CountdownRing } from "../components";
import { ENTRY_FEE, PREDICT_TIMEOUT, PREDICT_SAFE_BUFFER, SERVER_URL, SETTLE_DELAY } from "../config/constants";

const SHARE_TEXT = "Got a differentiated BTC view? Compare it on AlphaMatch. 📈📉 https://predict-arena-test.vercel.app/arena";
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

function isSettlementSyncMessage(message) {
  const reason = `${message || ""}`.toLowerCase();
  return (
    reason.includes("settlement is still syncing") ||
    reason.includes("syncing on base sepolia") ||
    reason.includes("timed out while waiting for base sepolia") ||
    reason.includes("result should appear automatically")
  );
}

function buildPlayerPredictionState(players = [], playerPredictions = {}) {
  const nextState = {};
  for (const player of Array.isArray(players) ? players : []) {
    const wallet = player?.toLowerCase?.();
    if (!wallet) continue;
    const prediction = Number(playerPredictions?.[wallet] || 0);
    nextState[wallet] = {
      prediction,
      hasPaid: false,
      reward: 0,
      claimed: false,
    };
  }
  return nextState;
}

export default function GamePlay({ embedded = false, layout = "modal", centerContent = null }) {
  const nav = useNavigate();
  const t = useT();
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
  const [playerStates, setPlayerStates] = useState({});
  const [gameId, setGameId] = useState(gameState.gameId);
  const [chainGameId, setChainGameId] = useState(gameState.chainGameId || gameState.gameId);
  const [totalPlayers, setTotalPlayers] = useState(gameState.players?.length || 0);
  const [claimState, setClaimState] = useState({ claimed: false, error: null, success: null });
  const [claimStatus, setClaimStatus] = useState(null);
  const [claimStatusLoading, setClaimStatusLoading] = useState(false);
  const [failureMessage, setFailureMessage] = useState(gameState.failureMessage || null);
  const [predictSafeBuffer, setPredictSafeBuffer] = useState(PREDICT_SAFE_BUFFER);
  const [predictionDeadline, setPredictionDeadline] = useState(gameState.predictionDeadline || null);
  const [predictionCueActive, setPredictionCueActive] = useState(false);
  const [celebrationKey, setCelebrationKey] = useState(null);
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
      const knownChainGameId = chainGameId || gameState.chainGameId || nextGameId;
      const nextChainGameId = Number(game.chain_game_id || knownChainGameId);
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
        const message = game.error_message || t("game.err.settlementInterrupted");
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
  }, [chainGameId, currentGameId, gameState.chainGameId, gameState.phase, getPlayerState, phase, t, updateGame, wallet]);

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
      setFailureMessage(gameState.failureMessage || t("game.err.settlementInterrupted"));
    }
  }, [gameState, totalPlayers, t]);

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
        setFailureMessage("We couldn't restore this match yet. Give it a moment or return home.");
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
        const nextTotalPredicted = Number(data.totalPredicted || Object.keys(data.playerPredictions || {}).length || 0);
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
        setPredictedCount(nextTotalPredicted);
        setPlayerStates(buildPlayerPredictionState(nextPlayers, data.playerPredictions));
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
          predictedCount: nextTotalPredicted,
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
        setPlayerStates(buildPlayerPredictionState(nextPlayers, data.playerPredictions));
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
        if (data?.wallet) {
          const normalizedWallet = data.wallet.toLowerCase();
          setPlayerStates((previous) => ({
            ...previous,
            [normalizedWallet]: {
              ...(previous[normalizedWallet] || { hasPaid: false, reward: 0, claimed: false }),
              prediction: Number(data.prediction || 0),
            },
          }));
        }
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
        const message = data.message || t("game.err.settlementInterrupted");
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
        const message = data.message || t("game.err.gameError");
        if (message === "Not in this game" || message === t("game.err.notInGame")) {
          resetGame();
          nav("/", { replace: true });
          return;
        }
        if ((phase === "settling" || phase === "failed") && isSettlementSyncMessage(message)) {
          setPhase("settling");
          setFailureMessage(null);
          updateGame({
            gameId: gameId || gameState.gameId,
            chainGameId: currentChainGameId,
            phase: "settling",
            failureMessage: null,
            basePrice,
          });
          void syncGameFromServer(gameId || gameState.gameId);
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
  }, [on, nav, gameState, phase, updateGame, resetGame, gameId, currentChainGameId, chainGameId, basePrice, wallet, myPrediction, t]);

  useEffect(() => {
    if (!wallet || !currentGameId) return;
    emit("game:resume:request");
  }, [wallet, currentGameId, emit]);

  const [predictionError, setPredictionError] = useState(null);

  const predict = async (prediction) => {
    try {
      setPredictionError(null);
      if (secondsUntilLocalLock <= effectivePredictSafeBuffer) {
        return;
      }
      const targetChainGameId = chainGameId || gameState.chainGameId || gameId || gameState.gameId;
      setPendingPrediction(prediction);
      const submitted = await submitPrediction(targetChainGameId, prediction, predictionDeadline);
      emit("game:predict", {
        gameId: gameId || gameState.gameId,
        prediction,
        deadline: submitted.deadline,
        signature: submitted.signature,
      });
    } catch (error) {
      setPendingPrediction(null);
      const message = error?.message || "Prediction failed. Please try again.";
      const bufferNowActive = secondsUntilLocalLock <= effectivePredictSafeBuffer;
      if ((bufferNowActive || /prediction window closed/i.test(message)) && !displayedPrediction) {
        setPredictionError(null);
        return;
      }
      setPredictionError(message);
    }
  };

  const handleClaimFunds = async ({ returnToDashboardOnSuccess = false } = {}) => {
    const targetChainGameId = currentChainGameId || chainGameId || gameState.chainGameId || gameId;
    try {
      setClaimState({ claimed: false, error: null, success: null });
      const payout = await claimGameFunds(targetChainGameId, wallet);
      const latestStatus = await refreshClaimStatus(targetChainGameId, true);
      const isRefundLikeClaim = payout?.type === "refund" || (!!result?.myResult && !result.myResult.isCorrect);
      const claimedAmount = payout?.type === "refund"
        ? latestStatus?.entryFee ?? claimStatus?.entryFee
        : latestStatus?.reward ?? rewardAmount;
      setClaimState({
        claimed: true,
        error: null,
        success: isRefundLikeClaim
          ? `${t("game.claimRefundWallet")}${claimedAmount ? `: ${claimedAmount.toFixed(4)} USDC` : "."}`
          : `${t("game.claimRewardWallet")}${claimedAmount ? `: +${claimedAmount.toFixed(4)} USDC` : "."}`,
      });
      if (payout?.type !== "refund") {
        setResult((previous) => previous ? ({
          ...previous,
          myResult: previous.myResult ? { ...previous.myResult, claimed: true } : previous.myResult,
        }) : previous);
      }
      if (returnToDashboardOnSuccess) {
        clearStoredPrediction(targetChainGameId, wallet);
        resetGame();
        nav("/arena", { replace: true });
      }
    } catch (error) {
      setClaimState({ claimed: false, error: error?.message || t("game.err.claimFailed"), success: null });
    }
  };

  const handleShareToX = () => {
    if (typeof window === "undefined") return;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const exitToArena = useCallback(() => {
    clearStoredPrediction(currentChainGameId, wallet);
    resetGame();
    nav("/arena", { replace: true });
  }, [currentChainGameId, nav, resetGame, wallet]);

  const rewardAmount = Number(result?.myResult?.reward || 0);
  const canClaimReward = phase === "result" && rewardAmount > 0 && !claimState.claimed && !result?.myResult?.claimed;
  const effectivePredictSafeBuffer = predictSafeBuffer;
  const predictionBufferNoticeThreshold = Math.max(10, effectivePredictSafeBuffer);
  const secondsUntilLocalLock = countdown;

  const diff = currentPrice && basePrice ? currentPrice - basePrice : 0;
  const percent = basePrice ? ((diff / basePrice) * 100).toFixed(3) : "0";
  const priceColor = diff > 0 ? "text-emerald-400" : diff < 0 ? "text-rose-400" : "text-white/30";
  const formatPredictionLabel = (prediction) => {
    if (prediction === "up") return t("game.long");
    if (prediction === "down") return t("game.short");
    return null;
  };
  const displayedPrediction = myPrediction || pendingPrediction;
  const normalizedPlayers = useMemo(
    () => (Array.isArray(gameState.players) ? gameState.players.map((player) => player?.toLowerCase?.()).filter(Boolean) : []),
    [gameState.players],
  );
  const currentWallet = wallet?.toLowerCase?.() || null;
  const shortWallet = useCallback((address) => !address ? "Unknown" : `${address.slice(0, 6)}...${address.slice(-4)}`, []);
  const hostWallet = normalizedPlayers[0] || null;
  const viewerRole = !currentWallet || normalizedPlayers.length === 0
    ? null
    : currentWallet === hostWallet
      ? t("game.role.host")
      : normalizedPlayers.includes(currentWallet)
        ? t("game.role.participant")
        : t("game.role.viewer");
  const predictionBufferNoticeActive = phase === "predicting" && !displayedPrediction && secondsUntilLocalLock <= predictionBufferNoticeThreshold;
  const predictionBufferLocked = phase === "predicting" && !displayedPrediction && secondsUntilLocalLock <= effectivePredictSafeBuffer;
  const predictionBufferMessage = predictionBufferLocked
    ? t("game.bufferLocked",{n:effectivePredictSafeBuffer})
    : t("game.bufferSoon",{n:effectivePredictSafeBuffer});
  const predictionNeedsAttention = phase === "predicting" && !displayedPrediction && !predictionBufferLocked;
  const predictionPromptTitle = t("game.turnPromptTitle");
  const predictionPromptHint = t("game.turnPromptHint");
  const chooseSideTitle = t("game.chooseSide");
  const predictionZoneClass = predictionCueActive && predictionNeedsAttention ? " prediction-zone-flash" : "";
  const resultPrediction = result?.myResult?.prediction || displayedPrediction;
  const resultPredictionLabel = formatPredictionLabel(resultPrediction);
  const refundWaitSeconds = claimStatus?.refundUnlockAt ? Math.max(0, claimStatus.refundUnlockAt - Math.floor(Date.now() / 1000)) : null;
  const canClaimFailedFunds = !!(claimStatus?.canClaimReward || claimStatus?.canClaimRefund || claimStatus?.canForceRefund);
  const failedClaimLabel = claimStatus?.canClaimReward ? t("game.claim.reward") : t("game.claim.refund");
  const formatUsd = (value) => `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const modalPriceClass = "min-w-0 whitespace-nowrap text-[clamp(0.95rem,3.4vw,1.35rem)] leading-none font-mono font-black tabular-nums";
  const resultBasePrice = Number(result?.basePrice || 0);
  const resultSettlementPrice = Number(result?.settlementPrice || 0);
  const resultDiff = resultBasePrice ? resultSettlementPrice - resultBasePrice : 0;
  const resultPercent = resultBasePrice ? ((resultDiff / resultBasePrice) * 100).toFixed(3) : "0.000";
  const resultOutcomeLabel = result?.direction === "up" ? t("game.long") : result?.direction === "down" ? t("game.short") : result?.direction === "flat" ? t("game.flat") : t("game.pending");
  const resultOutcomeTone = result?.direction === "up" ? "text-emerald-300" : result?.direction === "down" ? "text-rose-300" : "text-white/72";
  const resultOutcomeChipClass = result?.direction === "up"
    ? "!border-emerald-500/20 !bg-emerald-500/[0.08] !text-emerald-300"
    : result?.direction === "down"
      ? "!border-rose-500/20 !bg-rose-500/[0.08] !text-rose-300"
      : "!border-white/10 !bg-white/[0.05] !text-white/72";
  const resultOutcomeCopy = result?.direction === "up"
    ? t("game.result.up")
    : result?.direction === "down"
      ? t("game.result.down")
      : t("game.result.flat");
  const resultEntryAmount = Number(result?.myResult?.entryFee || claimStatus?.entryFee || ENTRY_FEE);
  const hasPlayerResult = !!result?.myResult;
  const resultNetAmount = hasPlayerResult ? rewardAmount - resultEntryAmount : 0;
  const hasRefundLikePayout = hasPlayerResult && rewardAmount > 0 && resultNetAmount <= 0;
  const didWinRound = !!(result?.myResult?.isCorrect && resultNetAmount > 0);
  const resultHeadline = result?.myResult
    ? didWinRound ? t("game.result.forecastConfirmed") : hasRefundLikePayout ? t("game.result.roundRefunded") : t("game.result.forecastMissed")
    : t("game.result.roundComplete");
  const resultHeadlineTone = didWinRound ? "text-emerald-300" : hasRefundLikePayout ? "text-amber-200" : result?.myResult ? "text-rose-300" : "text-white/82";
  const formatSignedAmount = (value) => `${value > 0 ? "+" : ""}${value.toFixed(4)}`;
  const resultAmountText = hasPlayerResult
    ? formatSignedAmount(resultNetAmount)
    : "0.0000";
  const resultAmountTone = resultNetAmount > 0 ? "text-emerald-400" : resultNetAmount < 0 ? "text-rose-400" : "text-white/72";
  const resultCompletionKey = phase === "result" && result?.myResult
    ? `${result?.gameId || currentGameId || "result"}:${result?.myResult?.wallet || currentWallet || "player"}`
    : null;
  const showResultCompletionOverlay = !!resultCompletionKey;
  const showResultCelebration = didWinRound && celebrationKey === resultCompletionKey;
  const resultCompletionTitle = didWinRound ? t("game.endModal.winTitle") : t("game.endModal.loseTitle");
  const resultClaimableAmount = Math.max(0, rewardAmount);
  const hasClaimableAmount = resultClaimableAmount > 0;
  const resultClaimableTone = hasClaimableAmount ? "text-emerald-300" : "text-white/76";
  const resultClaimableText = resultClaimableAmount.toFixed(4);
  const confettiPieces = useMemo(
    () => Array.from({ length: 64 }, (_, index) => ({
      left: 2 + (index * 7.37) % 96,
      delay: (index % 16) * 0.045,
      duration: 2.35 + (index % 7) * 0.14,
      drift: (index % 2 === 0 ? -1 : 1) * (34 + (index % 6) * 13),
      rotate: -72 + index * 23,
      width: 7 + (index % 4) * 2,
      height: 16 + (index % 5) * 4,
      color: ["#f472b6", "#34d399", "#facc15", "#22d3ee", "#c084fc"][index % 5],
    })),
    [],
  );
  const inBattlePhase = phase === "predicting" || phase === "settling" || phase === "result" || phase === "failed";
  const teammateStates = useMemo(
    () => normalizedPlayers
      .filter((address) => address !== currentWallet)
      .map((address, index) => {
        const state = playerStates[address] || null;
        const predictionLabel = state?.prediction === 1 ? t("game.long") : state?.prediction === 2 ? t("game.short") : null;
        const predictionTone = state?.prediction === 1 ? "text-emerald-300" : state?.prediction === 2 ? "text-rose-300" : "text-white/42";
        let statusLabel = t("game.player.waiting");
        let statusTone = "text-white/38";
        if (phase === "predicting") {
          statusLabel = predictionLabel ? t("game.player.lockedIn") : t("game.player.waiting");
          statusTone = predictionLabel ? "text-cyan-200" : "text-white/38";
        } else if (phase === "settling") {
          statusLabel = predictionLabel ? t("game.player.submitted") : t("game.player.noPosition");
          statusTone = predictionLabel ? "text-fuchsia-200" : "text-white/38";
        } else if (phase === "result") {
          if (!predictionLabel) {
            statusLabel = t("game.player.noPosition");
            statusTone = "text-white/38";
          } else if (result?.direction === "flat") {
            statusLabel = t("game.player.settledFlat");
            statusTone = "text-white/62";
          } else if ((state?.prediction === 1 && result?.direction === "up") || (state?.prediction === 2 && result?.direction === "down")) {
            statusLabel = t("game.player.correct");
            statusTone = "text-emerald-300";
          } else {
            statusLabel = t("game.player.missed");
            statusTone = "text-rose-300";
          }
        } else if (phase === "failed") {
          statusLabel = predictionLabel ? t("game.player.recoveryPending") : t("game.player.noPosition");
          statusTone = predictionLabel ? "text-amber-200" : "text-white/38";
        }
        return {
          address,
          label: address === hostWallet ? t("game.role.host") : t("game.player.label",{n:index+2}),
          short: shortWallet(address),
          predictionLabel,
          predictionTone,
          statusLabel,
          statusTone,
          reward: Number(state?.reward || 0),
          claimed: !!state?.claimed,
        };
      }),
    [normalizedPlayers, currentWallet, playerStates, phase, result?.direction, hostWallet, shortWallet, t],
  );

  useEffect(() => {
    if (predictionBufferLocked) {
      setPredictionError(null);
    }
  }, [predictionBufferLocked]);

  useEffect(() => {
    if (!resultCompletionKey || !didWinRound) return undefined;
    setCelebrationKey(resultCompletionKey);
    const timeoutId = setTimeout(() => {
      setCelebrationKey((current) => (current === resultCompletionKey ? null : current));
    }, 2200);
    return () => clearTimeout(timeoutId);
  }, [didWinRound, resultCompletionKey]);

  useEffect(() => {
    if (!predictionNeedsAttention) {
      setPredictionCueActive(false);
      return undefined;
    }
    setPredictionCueActive(true);
    const timeoutId = setTimeout(() => {
      setPredictionCueActive(false);
    }, 2200);
    return () => clearTimeout(timeoutId);
  }, [predictionNeedsAttention, currentChainGameId, currentGameId]);

  useEffect(() => {
    const hasResolvedPlayers = normalizedPlayers.length > 0;
    if (!currentWallet || !hasResolvedPlayers || !inBattlePhase) return;
    if (normalizedPlayers.includes(currentWallet)) return;
    resetGame();
    nav("/", { replace: true });
  }, [currentWallet, normalizedPlayers, phase, nav, resetGame]);

  useEffect(() => {
    if (!currentChainGameId || normalizedPlayers.length === 0 || !inBattlePhase) {
      setPlayerStates({});
      return undefined;
    }
    if (phase === "predicting") return undefined;
    let cancelled = false;
    const syncPlayers = async () => {
      const entries = await Promise.all(
        normalizedPlayers.map(async (address) => {
          try {
            const state = await getPlayerState(currentChainGameId, address);
            return [address, state];
          } catch {
            return [address, null];
          }
        }),
      );
      if (cancelled) return;
      setPlayerStates((previous) => {
        const next = { ...previous };
        for (const [address, state] of entries) {
          const prior = previous[address] || null;
          next[address] = state ? {
            ...state,
            prediction: Number(state.prediction || prior?.prediction || 0),
          } : prior;
        }
        return next;
      });
    };
    void syncPlayers();
    const intervalId = setInterval(() => { void syncPlayers(); }, 3500);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentChainGameId, normalizedPlayers, getPlayerState, inBattlePhase, phase]);

  const resultCompletionOverlay = showResultCompletionOverlay ? (
    <>
      {showResultCelebration ? (
        <div className="game-end-confetti" aria-hidden="true">
          {confettiPieces.map((piece, index) => (
            <span
              key={`confetti-${index}`}
              className="game-end-confetti-piece"
              style={{
                left: `${piece.left}%`,
                backgroundColor: piece.color,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
                "--confetti-drift": `${piece.drift}px`,
                "--confetti-rotate-start": `${piece.rotate}deg`,
                "--confetti-width": `${piece.width}px`,
                "--confetti-height": `${piece.height}px`,
              }}
            />
          ))}
        </div>
      ) : null}
      <div className="game-end-overlay" role="dialog" aria-modal="true" aria-label={resultCompletionTitle}>
        <div className="game-end-shell dashboard-modal-card animate-slideUp overflow-hidden px-4 py-5 sm:px-5 sm:py-5.5">
          <div className="text-center">
            <h3 className={`text-[1.5rem] sm:text-[1.72rem] font-black tracking-[-0.05em] ${didWinRound ? "text-emerald-200" : "text-white"}`}>
              {resultCompletionTitle}
            </h3>
          </div>

          <div className="mt-4 grid gap-3">
            <div className={`game-end-metric flex items-center justify-between gap-3 px-4 py-4 sm:px-4.5 sm:py-4.5 ${didWinRound ? "!border-emerald-500/18 !bg-emerald-500/[0.06]" : ""}`}>
              <p className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
                {t("game.claimable")}
              </p>
              <p className={`shrink-0 text-[1.05rem] sm:text-[1.14rem] leading-none font-mono font-black ${resultClaimableTone}`}>
                {resultClaimableText}
                <span className="ml-2 text-[0.72rem] sm:text-[0.76rem] font-semibold tracking-[0.14em] text-white/34">USDC</span>
              </p>
            </div>
            <div className="game-end-metric px-4 py-4 sm:px-4.5 sm:py-4.5">
              <div className="game-end-dual-metric text-center">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/34">{t("game.yourCall")}</p>
                  <p className={`mt-3 text-[0.95rem] sm:text-[1rem] font-black whitespace-nowrap ${resultPrediction === "up" ? "text-emerald-300" : resultPrediction === "down" ? "text-rose-300" : "text-white/70"}`}>
                    {resultPredictionLabel || t("game.noPos")}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/34">{t("game.endModal.settled")}</p>
                  <p className={`mt-3 text-[0.95rem] sm:text-[1rem] font-black whitespace-nowrap ${resultOutcomeTone}`}>
                    {resultOutcomeLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {hasClaimableAmount ? (
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                onClick={exitToArena}
                className="dashboard-secondary-btn py-3 text-[0.94rem] font-bold !text-white/74 hover:!text-white"
              >
                {t("result.confirm")}
              </button>
              <button
                onClick={() => handleClaimFunds({ returnToDashboardOnSuccess: true })}
                disabled={!canClaimReward || claiming}
                className="dashboard-primary-btn py-3 text-[0.94rem] font-bold disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {claimState.claimed || result?.myResult?.claimed ? t("result.claimed") : claiming ? t("result.claiming") : t("game.claim.reward")}
              </button>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                onClick={exitToArena}
                className="dashboard-secondary-btn py-3 text-[0.94rem] font-bold !text-white/74 hover:!text-white"
              >
                {t("result.confirm")}
              </button>
              <button
                onClick={exitToArena}
                className="dashboard-primary-btn py-3 text-[0.94rem] font-bold"
              >
                {t("result.playAgain")}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  ) : null;

  if (layout === "room" && inBattlePhase) {
    const myStatusLabel = phase === "predicting"
      ? displayedPrediction ? t("game.predictionLocked") : predictionPromptTitle
      : phase === "settling"
        ? t("game.settlementInProgress")
        : phase === "result"
          ? resultHeadline
          : t("game.recovery");

    return (
      <>
        <div className={embedded ? "w-full" : "page-container !max-w-[90rem]"}>
          <div className="w-full grid gap-4 xl:grid-cols-[minmax(16rem,19rem)_minmax(0,1fr)_minmax(18rem,22rem)] items-start">
          <aside className="order-2 xl:order-1">
            <div className="dashboard-modal-card overflow-hidden p-3 sm:p-3.5">
              <div className="flex items-start justify-between gap-2.5 mb-3">
                <div className="min-w-0">
                  <span className="dashboard-room-chip inline-flex items-center gap-2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/82">
                    {phase === "result" ? t("game.team.result") : phase === "settling" ? t("game.team.calls") : t("game.team.board")}
                  </span>
                  <h3 className="mt-2.5 text-[1rem] font-black tracking-[-0.04em] text-white leading-[1.08]">{t("game.roomPlayers")}</h3>
                  <p className="mt-1 text-[10px] text-white/44 leading-5">{t("game.roomPlayers.desc")}</p>
                </div>
                <div className="dashboard-room-chip px-3 py-1.5 text-[10px] font-mono text-white/70">{teammateStates.length}</div>
              </div>

              <div className="space-y-2.5">
                {teammateStates.length === 0 ? (
                  <div className="dashboard-modal-row px-3 py-3 text-center">
                    <p className="text-white/42 text-[11px]">{t("game.team.empty")}</p>
                  </div>
                ) : teammateStates.map((player) => (
                  <div key={player.address} className="dashboard-modal-row px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white text-[11px] font-semibold">{player.label}</p>
                        <p className="text-white/32 text-[9px] font-mono mt-1">{player.short}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-[0.95rem] font-black ${player.predictionTone}`}>{player.predictionLabel || "..."}</p>
                        <p className={`text-[9px] mt-1 ${player.statusTone}`}>{player.statusLabel}</p>
                      </div>
                    </div>
                    {phase === "result" && player.reward > 0 ? (
                      <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                        <span className="text-white/26 text-[9px] uppercase tracking-[0.18em]">{t("game.recovery.reward")}</span>
                        <span className="text-emerald-300 text-[10px] font-mono font-black">{player.reward.toFixed(4)} USDC</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="order-1 xl:order-2 min-w-0">
            {centerContent}
          </section>

          <aside className="order-3">
            <div className="dashboard-modal-card overflow-hidden p-3 sm:p-3.5">
              <div className="flex items-start justify-between gap-2.5 mb-3">
                <div className="min-w-0">
                  <span className="dashboard-room-chip inline-flex items-center gap-2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/82">
                    {phase === "predicting" ? t("game.panel.console") : phase === "settling" ? t("game.panel.position") : phase === "result" ? t("game.panel.result") : t("game.recovery")}
                  </span>
                  <h3 className="mt-2.5 text-[1rem] font-black tracking-[-0.04em] text-white leading-[1.08]">{phase === "predicting" && !displayedPrediction ? chooseSideTitle : myStatusLabel}</h3>
                  <p className="mt-1 text-[10px] text-white/44 leading-5">
                    {phase === "predicting"
                      ? displayedPrediction ? t("game.callLocked") : t("game.descLongShort")
                      : phase === "settling"
                        ? t("game.callLockedSettling")
                        : phase === "result"
                          ? t("game.roomResultHint")
                          : t("game.recovery.roomHint")}
                  </p>
                </div>
                {phase === "predicting" || phase === "settling" ? (
                  <div className="dashboard-room-subcard shrink-0 px-2.5 py-2.5">
                    <CountdownRing total={phase === "predicting" ? PREDICT_TIMEOUT : SETTLE_DELAY} remaining={countdown} label={phase === "predicting" ? t("game.timeLeft") : t("game.reveal")} size="sm" />
                  </div>
                ) : (
                  <div className={`dashboard-room-chip px-3 py-1.5 text-[10px] ${phase === "result" ? resultOutcomeChipClass : "!border-amber-500/20 !bg-amber-500/[0.08] !text-amber-200"}`}>
                    {phase === "result" ? resultOutcomeLabel : t("game.pending")}
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                {(phase === "predicting" || phase === "settling") && (
                  <>
                    <div className="grid grid-cols-1 gap-2.5">
                      <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
                        <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.basePriceLabel")}</p>
                        <p className={`${modalPriceClass} text-gradient`}>{formatUsd(basePrice)}</p>
                      </div>
                      <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
                        <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{phase === "predicting" ? t("game.livePriceLabel") : t("game.currentPrice")}</p>
                        <p className={`${modalPriceClass} ${priceColor}`}>{formatUsd(currentPrice)}</p>
                        <p className={`text-[9px] font-mono mt-1 ${priceColor}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)} ({percent}%)</p>
                      </div>
                    </div>

                    {phase === "predicting" ? (
                      <div className={`dashboard-modal-row px-3 py-3${predictionZoneClass}`}>
                        <div className="flex items-center justify-between mb-2.5">
                          <div>
                            <p className="text-white/24 text-[9px] uppercase tracking-[0.2em]">{t("game.yourCall")}</p>
                            {displayedPrediction ? <p className="text-white/46 text-[10px] mt-1">{t("game.positionSelected")}</p> : null}
	                          </div>
	                          <div className="dashboard-room-chip px-3 py-1.5 text-[10px] font-mono text-white/70">{predictedCount}/{totalPlayers}</div>
	                        </div>
		                        {!displayedPrediction ? <div className="prediction-action-banner mb-2.5">{t("game.selectPredictionBanner")}</div> : null}
	                        <PredictButtons onPredict={predict} myPrediction={displayedPrediction} disabled={predicting || predictionBufferLocked} attention={predictionNeedsAttention} />
	                      </div>
                    ) : (
                      <div className="dashboard-modal-row px-3 py-3 text-center">
                        <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.lockedPosition")}</p>
                        <p className={`text-[1.05rem] font-black ${displayedPrediction === "up" ? "text-emerald-300" : displayedPrediction === "down" ? "text-rose-300" : "text-white/42"}`}>
                          {displayedPrediction === "up" ? t("game.long") : displayedPrediction === "down" ? t("game.short") : t("game.noPos")}
                        </p>
                      </div>
                    )}

                    {predictionBufferNoticeActive ? <div className="rounded-[18px] border border-fuchsia-500/15 bg-fuchsia-500/10 text-fuchsia-200 text-[11px] px-4 py-3">{predictionBufferMessage}</div> : null}
                    {predictionError ? <div className="rounded-[18px] border border-rose-500/15 bg-rose-500/10 text-rose-300 text-[11px] px-4 py-3">{predictionError}</div> : null}
                    {predicting ? <div className="rounded-[18px] border border-cyan-500/15 bg-cyan-500/10 text-cyan-200 text-[11px] px-4 py-3">{t("game.signingNote")}</div> : null}
                  </>
                )}

                {phase === "result" && (
                  <>
                    <div className="grid grid-cols-1 gap-2.5">
                      <div className="dashboard-modal-row px-3 py-2.5 text-center">
                        <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.yourCall")}</p>
                        <p className={`${resultPrediction === "up" ? "text-emerald-300" : resultPrediction === "down" ? "text-rose-300" : "text-white/72"} text-[1rem] font-black`}>
                          {resultPredictionLabel || t("game.noPos")}
                        </p>
                      </div>
                      <div className="dashboard-modal-row px-3 py-3">
                        <div className="flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${resultHeadlineTone}`}>{resultHeadline}</p>
                            <p className="text-white/40 text-[10px] mt-1">{resultOutcomeCopy}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1">{t("game.result.net")}</p>
                            <p className={`text-[1.4rem] font-black font-mono ${resultAmountTone}`}>{resultAmountText}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {claimState.error ? <div className="rounded-[16px] border border-rose-500/15 bg-rose-500/10 text-rose-300 px-3 py-2 text-[11px]">{claimState.error}</div> : null}
                    {claimState.success ? <div className="rounded-[16px] border border-emerald-500/15 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-[11px]">{claimState.success}</div> : null}

                    {rewardAmount > 0 ? (
                      <button
                        onClick={handleClaimFunds}
                        disabled={!canClaimReward || claiming}
                        className={`w-full py-2.5 rounded-[18px] font-black text-sm transition ${
                          claimState.claimed || result?.myResult?.claimed
                            ? "bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 cursor-default"
                            : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-40"
                        }`}
                      >
                        {claimState.claimed || result?.myResult?.claimed
                          ? hasRefundLikePayout ? t("game.claimedRefund") : t("game.claimedReward")
                          : claiming ? hasRefundLikePayout ? t("game.claimingRefund") : t("game.claimingReward")
                            : hasRefundLikePayout ? t("game.claim.refund") : t("game.claim.reward")}
                      </button>
                    ) : null}
                    <button onClick={handleShareToX} className="w-full dashboard-action-primary !py-2.5 font-black !text-sm">{t("game.shareX")}</button>
                  </>
                )}

                {phase === "failed" && (
                  <>
                    <div className="dashboard-modal-row px-3 py-3">
                      <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.recovery.status")}</p>
                      <p className="text-white/72 text-[11px] leading-5">{failureMessage || t("game.interrupted.desc")}</p>
                    </div>
                    {claimState.error ? <div className="rounded-[16px] border border-rose-500/15 bg-rose-500/10 text-rose-300 px-3 py-2 text-[11px]">{claimState.error}</div> : null}
                    {claimState.success ? <div className="rounded-[16px] border border-emerald-500/15 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-[11px]">{claimState.success}</div> : null}
                    {claimStatusLoading ? (
                      <div className="dashboard-modal-row px-3 py-3 text-[11px] text-white/44">{t("game.recovery.loading")}</div>
                    ) : canClaimFailedFunds ? (
                      <button
                        onClick={handleClaimFunds}
                        disabled={!canClaimFailedFunds || claiming}
                        className="w-full py-2.5 rounded-[18px] font-black text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-40"
                      >
                        {claiming ? t("game.claiming") : failedClaimLabel}
                      </button>
                    ) : (
                      <div className="dashboard-modal-row px-3 py-3 text-[11px] text-white/44">
                        {claimStatus?.state === 2 && refundWaitSeconds !== null
                          ? t("game.recovery.refundUnlock",{s:refundWaitSeconds})
                          : t("game.recovery.syncing")}
                      </div>
                    )}
                    <button onClick={handleShareToX} className="w-full dashboard-action-primary !py-2.5 font-black !text-sm">{t("game.shareX")}</button>
                  </>
                )}
              </div>
            </div>
          </aside>
          </div>
        </div>
        {resultCompletionOverlay}
      </>
    );
  }

  return (
    <>
      <div className={embedded ? "w-full flex flex-col items-center" : "page-container !max-w-[44rem] flex flex-col items-center"}>
      {phase === "waiting" && (
        <div className="text-center pt-12 animate-slideUp">
          <div className="text-5xl mb-3 animate-float">⚔️</div>
	          <h3 className="text-xl font-black text-gradient mb-1">{t("game.preparing.title")}</h3>
	          <p className="text-white/15 text-xs">{t("game.preparing.desc")}</p>
        </div>
      )}

      {phase === "predicting" && (
        <div className="w-full max-w-[40rem] animate-slideUp">
          <div className="dashboard-modal-card overflow-hidden p-3 sm:p-3.5">
            <div className="flex items-start justify-between gap-2.5 mb-3">
              <div className="min-w-0 max-w-[26rem]">
	                <span className="dashboard-room-chip inline-flex items-center gap-2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/82">{t("game.matchInProgress")}</span>
                <h3 className="mt-2.5 text-[1.12rem] sm:text-[1.32rem] font-black tracking-[-0.04em] text-white leading-[1.06]">{displayedPrediction ? t("game.makePrediction") : chooseSideTitle}</h3>
	                <p className="mt-1.5 text-[10px] sm:text-[11px] leading-5 text-white/46">{displayedPrediction ? t("game.callLocked") : t("game.descLongShort")}</p>
              </div>
              <div className="dashboard-room-subcard shrink-0 px-2.5 py-2.5">
	                <CountdownRing total={PREDICT_TIMEOUT} remaining={countdown} label={t("game.timeLeft")} size="sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
              <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
	                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.basePriceLabel")}</p>
                <p className={`${modalPriceClass} text-gradient`}>{formatUsd(basePrice)}</p>
              </div>
              <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
	                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.livePriceLabel")}</p>
                <p className={`${modalPriceClass} ${priceColor}`}>{formatUsd(currentPrice)}</p>
                <p className={`text-[9px] font-mono mt-1 ${priceColor}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)} ({percent}%)</p>
              </div>
            </div>

            <div className={`dashboard-modal-row px-3 py-2.5 mb-3${predictionZoneClass}`}>
              <div className="flex items-center justify-between mb-2.5">
                <div>
	                  <p className="text-white/24 text-[9px] uppercase tracking-[0.2em]">{t("game.playersReady")}</p>
	                  <p className="text-white/46 text-[10px] mt-1">{displayedPrediction ? t("game.predictionsConfirmed") : t("game.chooseDirection")}</p>
	                </div>
	                <div className="dashboard-room-chip px-3 py-1.5 text-[10px] font-mono text-white/70">{predictedCount}/{totalPlayers}</div>
	              </div>
		              {!displayedPrediction ? <div className="prediction-action-banner mb-2.5">{t("game.selectPredictionBanner")}</div> : null}
	              <PredictButtons onPredict={predict} myPrediction={displayedPrediction} disabled={predicting || predictionBufferLocked} attention={predictionNeedsAttention} />
	            </div>

            {predictionBufferNoticeActive && <div className="rounded-[18px] border border-fuchsia-500/15 bg-fuchsia-500/10 text-fuchsia-200 text-[11px] px-4 py-3 mb-3">{predictionBufferMessage}</div>}
            {predictionError && <div className="rounded-[18px] border border-rose-500/15 bg-rose-500/10 text-rose-300 text-[11px] px-4 py-3 mb-3">{predictionError}</div>}
	            {predicting && <div className="rounded-[18px] border border-cyan-500/15 bg-cyan-500/10 text-cyan-200 text-[11px] px-4 py-3 mb-3">{t("game.signingNote")}</div>}
            {displayedPrediction && (
              <div className={`dashboard-room-subcard px-3 py-2 text-center ${displayedPrediction === "up" ? "!border-emerald-500/20 !bg-emerald-500/[0.06]" : "!border-rose-500/20 !bg-rose-500/[0.06]"}`}>
	                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.yourPosition")}</p>
	                <p className={`text-[1rem] font-black tracking-[-0.03em] ${displayedPrediction === "up" ? "text-emerald-400" : "text-rose-400"}`}>{displayedPrediction === "up" ? t("game.long") : t("game.short")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "settling" && (
        <div className="w-full max-w-[40rem] animate-slideUp">
          <div className="dashboard-modal-card overflow-hidden p-3 sm:p-3.5">
            <div className="flex items-start justify-between gap-2.5 mb-3">
              <div className="min-w-0 max-w-[26rem]">
	                <span className="dashboard-room-chip inline-flex items-center gap-2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/82">{t("game.settlement")}</span>
	                <h3 className="mt-2.5 text-[1.08rem] sm:text-[1.26rem] font-black tracking-[-0.04em] text-white leading-[1.06]">{countdown > 0 ? t("game.settling") : t("game.finalizingOnchain")}</h3>
	                <p className="mt-1.5 text-[10px] sm:text-[11px] leading-5 text-white/46">{countdown > 0 ? t("game.oraclePreparing") : t("game.waitingSettlementTx")}</p>
              </div>
              <div className="dashboard-room-subcard shrink-0 px-2.5 py-2.5">
                {countdown > 0
	                  ? <CountdownRing total={SETTLE_DELAY} remaining={countdown} label={t("game.reveal")} size="sm" />
	                  : <div className="flex flex-col items-center justify-center w-24 h-24 rounded-full border border-fuchsia-500/20 bg-fuchsia-500/[0.06]"><span className="w-6 h-6 rounded-full border-2 border-fuchsia-300/60 border-t-transparent animate-spin"/><span className="mt-2 text-[9px] uppercase tracking-[0.2em] text-white/35">{t("game.syncing")}</span></div>
                }
              </div>
            </div>

            {(viewerRole || displayedPrediction) && (
              <div className="flex flex-wrap gap-2 mb-2.5">
	                {viewerRole && <div className="dashboard-room-chip px-3 py-1.5 text-[10px] text-white/72">{t("game.viewingAs")}: {viewerRole}</div>}
	                {displayedPrediction && <div className={`dashboard-room-chip px-3 py-1.5 text-[10px] ${displayedPrediction === "up" ? "!border-emerald-500/20 !bg-emerald-500/[0.08] !text-emerald-300" : "!border-rose-500/20 !bg-rose-500/[0.08] !text-rose-300"}`}>{t("game.yourCall")}: {displayedPrediction === "up" ? t("game.long") : t("game.short")}</div>}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
	                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.basePriceLabel")}</p>
                <p className={`${modalPriceClass} text-white/84`}>{formatUsd(basePrice)}</p>
              </div>
              <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
	                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.currentPrice")}</p>
                <p className={`${modalPriceClass} ${priceColor}`}>{formatUsd(currentPrice)}</p>
                <p className={`text-[9px] font-mono mt-1 ${priceColor}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)} ({percent}%)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "failed" && (
        <div className="w-full max-w-[40rem] animate-slideUp">
          <div className="dashboard-modal-card overflow-hidden p-3 sm:p-3.5">
            <div className="flex items-start justify-between gap-2.5 mb-3">
              <div className="min-w-0 max-w-[26rem]">
                <span className="dashboard-room-chip inline-flex items-center gap-2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/82">{t("game.recovery")}</span>
                <h3 className="mt-2.5 text-[1.08rem] sm:text-[1.26rem] font-black tracking-[-0.04em] text-white leading-[1.06]">{t("game.interrupted.title")}</h3>
                <p className="mt-1.5 text-[10px] sm:text-[11px] leading-5 text-white/46">
                  {failureMessage || t("game.interrupted.desc")}
                </p>
              </div>
              <div className="dashboard-room-subcard shrink-0 px-3 py-2.5 text-center min-w-[5.75rem]">
                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1">Status</p>
                <p className="text-[1rem] font-black text-amber-300">{t("game.syncing")}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-2.5">
              {currentChainGameId ? <div className="dashboard-room-chip px-3 py-1.5 text-[10px] font-mono text-white/72">Chain Game #{currentChainGameId}</div> : null}
              {displayedPrediction ? <div className={`dashboard-room-chip px-3 py-1.5 text-[10px] ${displayedPrediction === "up" ? "!border-emerald-500/20 !bg-emerald-500/[0.08] !text-emerald-300" : "!border-rose-500/20 !bg-rose-500/[0.08] !text-rose-300"}`}>{t("game.yourCall")}: {displayedPrediction === "up" ? t("game.long") : t("game.short")}</div> : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
              <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.basePriceLabel")}</p>
                <p className={`${modalPriceClass} text-white/84`}>{formatUsd(basePrice)}</p>
              </div>
              <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.currentPrice")}</p>
                <p className={`${modalPriceClass} ${priceColor}`}>{formatUsd(currentPrice)}</p>
                <p className={`text-[9px] font-mono mt-1 ${priceColor}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)} ({percent}%)</p>
              </div>
            </div>

            <div className="dashboard-modal-row px-3 py-3 mb-3">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div>
                  <p className="text-fuchsia-200 text-[10px] font-bold uppercase tracking-[0.2em]">{t("game.recovery")}</p>
                  <p className="text-white/40 text-[10px] mt-1">{t("game.recovery.desc")}</p>
                </div>
                {claimStatus?.state === 3 && claimStatus?.reward > 0 ? (
                  <div className="text-right shrink-0">
                    <p className="text-white/20 text-[9px] uppercase tracking-[0.2em]">{t("game.recovery.reward")}</p>
                    <p className="text-emerald-400 font-mono font-black text-[1rem]">{claimStatus.reward.toFixed(4)} USDC</p>
                  </div>
                ) : null}
              </div>

              {claimState.error ? <div className="rounded-[16px] border border-rose-500/15 bg-rose-500/10 text-rose-300 px-3 py-2 text-[11px] mb-2.5">{claimState.error}</div> : null}
              {claimState.success ? <div className="rounded-[16px] border border-emerald-500/15 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-[11px] mb-2.5">{claimState.success}</div> : null}

              {claimStatusLoading ? (
                <p className="text-white/40 text-[11px]">{t("game.recovery.loading")}</p>
              ) : !wallet ? (
                <p className="text-white/40 text-[11px]">{t("game.recovery.reconnect")}</p>
              ) : !claimStatus ? (
                <p className="text-white/40 text-[11px]">{t("game.recovery.unavailable")}</p>
              ) : claimStatus.claimed || claimState.claimed ? (
                <p className="text-emerald-300 text-[11px]">{t("game.recovery.alreadyClaimed")}</p>
              ) : canClaimFailedFunds ? (
                <div className="space-y-2">
                  <p className="text-white/50 text-[11px]">
                    {claimStatus.canClaimReward
                      ? t("game.recovery.rewardReady")
                      : claimStatus.canForceRefund
                        ? t("game.recovery.forceRefund")
                        : t("game.recovery.refundReady")}
                  </p>
                  <button
                    onClick={handleClaimFunds}
                    disabled={!canClaimFailedFunds || claiming}
                    className="w-full py-2.5 rounded-[18px] font-black text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-40"
                  >
                    {claiming ? t("game.claiming") : failedClaimLabel}
                  </button>
                </div>
              ) : claimStatus.state === 3 ? (
                <p className="text-white/45 text-[11px]">{t("game.recovery.noClaim")}</p>
              ) : claimStatus.state === 2 && refundWaitSeconds !== null ? (
                <p className="text-white/45 text-[11px]">
                  {t("game.recovery.refundUnlock",{s:refundWaitSeconds})}
                </p>
              ) : (
                <p className="text-white/45 text-[11px]">{t("game.recovery.syncing")}</p>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => nav("/")} className="flex-1 py-2.5 rounded-[18px] bg-fuchsia-500/[0.06] border border-fuchsia-500/15 hover:bg-fuchsia-500/[0.1] transition text-xs text-white/60">{t("game.home")}</button>
              <button onClick={handleShareToX} className="flex-1 dashboard-action-primary !py-2.5 font-black !text-sm">{t("game.shareX")}</button>
            </div>
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <div className="w-full max-w-[40rem] animate-slideUp">
          <div className="dashboard-modal-card overflow-hidden p-3 sm:p-3.5">
            <div className="flex items-start justify-between gap-2.5 mb-3">
              <div className="min-w-0 max-w-[26rem]">
                <span className="dashboard-room-chip inline-flex items-center gap-2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/82">{t("game.result.roundResult")}</span>
                <h3 className={`mt-2.5 text-[1.08rem] sm:text-[1.26rem] font-black tracking-[-0.04em] leading-[1.06] ${resultHeadlineTone}`}>{resultHeadline}</h3>
                <p className="mt-1.5 text-[10px] sm:text-[11px] leading-5 text-white/46">{resultOutcomeCopy}</p>
              </div>
              <div className="dashboard-room-subcard shrink-0 px-3 py-2.5 text-center min-w-[6.25rem]">
                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1">{t("game.result.outcome")}</p>
                <p className={`text-[1rem] font-black ${resultOutcomeTone}`}>{resultOutcomeLabel}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-2.5">
              {currentChainGameId ? <div className="dashboard-room-chip px-3 py-1.5 text-[10px] font-mono text-white/72">Chain Game #{currentChainGameId}</div> : null}
              {resultPredictionLabel ? <div className={`dashboard-room-chip px-3 py-1.5 text-[10px] ${resultPrediction === "up" ? "!border-emerald-500/20 !bg-emerald-500/[0.08] !text-emerald-300" : "!border-rose-500/20 !bg-rose-500/[0.08] !text-rose-300"}`}>{t("game.yourCall")}: {resultPredictionLabel}</div> : null}
              <div className={`dashboard-room-chip px-3 py-1.5 text-[10px] ${resultOutcomeChipClass}`}>{t("game.result.settledWith",{outcome:resultOutcomeLabel})}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
              <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.basePriceLabel")}</p>
                <p className={`${modalPriceClass} text-white/84`}>{formatUsd(resultBasePrice)}</p>
              </div>
              <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">{t("game.result.settlementPrice")}</p>
                <p className={`${modalPriceClass} ${resultOutcomeTone}`}>{formatUsd(resultSettlementPrice)}</p>
              </div>
              <div className="dashboard-modal-row min-w-0 px-3 py-2.5 text-center">
                <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1.5">Price Change</p>
                <p className={`text-[1.1rem] leading-none font-mono font-black ${resultOutcomeTone}`}>{resultDiff >= 0 ? "+" : ""}{resultDiff.toFixed(2)}</p>
                <p className={`text-[9px] font-mono mt-1 ${resultOutcomeTone}`}>{resultDiff >= 0 ? "+" : ""}{resultPercent}%</p>
              </div>
            </div>

            {result.myResult ? (
              <div className="dashboard-modal-row px-3 py-3 mb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${resultHeadlineTone}`}>{resultHeadline}</p>
                    <p className="text-white/40 text-[10px] mt-1">
                      {rewardAmount > 0
                        ? hasRefundLikePayout
                          ? t("game.result.refundReady")
                          : t("game.result.rewardReady")
                        : t("game.result.noReward")}
                    </p>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-white/24 text-[9px] uppercase tracking-[0.2em] mb-1">{t("game.result.netResult")}</p>
                    <p className={`text-[1.6rem] font-black font-mono ${resultAmountTone}`}>{resultAmountText} <span className="text-[0.8rem] text-white/30">USDC</span></p>
                  </div>
                </div>
              </div>
            ) : null}

            {claimState.error ? <div className="rounded-[16px] border border-rose-500/15 bg-rose-500/10 text-rose-300 px-3 py-2 text-[11px] mb-2.5">{claimState.error}</div> : null}
            {claimState.success ? <div className="rounded-[16px] border border-emerald-500/15 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-[11px] mb-2.5">{claimState.success}</div> : null}

            {rewardAmount > 0 ? (
              <div className="dashboard-modal-row px-3 py-3 mb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-emerald-300 text-[10px] font-bold uppercase tracking-[0.2em]">{hasRefundLikePayout ? t("game.result.refundClaim") : t("game.result.rewardClaim")}</p>
                    <p className="text-white/40 text-[10px] mt-1">
                      {hasRefundLikePayout
                        ? t("game.result.refundClaimDesc")
                        : t("game.rewardClaimDesc")}
                    </p>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-white/20 text-[9px] uppercase tracking-[0.2em] mb-1">{hasRefundLikePayout ? t("game.result.refundable") : t("game.claimable")}</p>
                    <p className="text-emerald-400 font-mono font-black text-[1rem]">{rewardAmount.toFixed(4)} USDC</p>
                  </div>
                </div>

                <button
                  onClick={handleClaimFunds}
                  disabled={!canClaimReward || claiming}
                  className={`w-full mt-3 py-2.5 rounded-[18px] font-black text-sm transition ${
                    claimState.claimed || result?.myResult?.claimed
                      ? "bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 cursor-default"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-40"
                  }`}
                >
                  {claimState.claimed || result?.myResult?.claimed
                    ? hasRefundLikePayout ? t("game.claimedRefund") : t("game.claimedReward")
                    : claiming ? hasRefundLikePayout ? t("game.claimingRefund") : t("game.claimingReward")
                      : hasRefundLikePayout ? t("game.claim.refund") : t("game.claim.reward")}
                </button>
              </div>
            ) : null}

            <div className="flex gap-2">
              <button onClick={() => nav("/arena")} className="flex-1 py-2.5 rounded-[18px] bg-fuchsia-500/[0.06] border border-fuchsia-500/15 hover:bg-fuchsia-500/[0.1] transition text-xs text-white/60">{t("result.confirm")}</button>
              <button onClick={handleShareToX} className="flex-1 dashboard-action-primary !py-2.5 font-black !text-sm">Share to 𝕏</button>
            </div>
          </div>
        </div>
      )}
      </div>
      {resultCompletionOverlay}
    </>
  );
}
