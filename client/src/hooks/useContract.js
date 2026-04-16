import { useCallback, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import { ARENA_ABI, ERC20_ABI, CONTRACT_ADDRESS, USDC_ADDRESS, GAME_STATE } from "../config/contract";
import { ENTRY_FEE } from "../config/constants";

function mapContractError(err) {
  const code = err?.code || err?.info?.error?.code;
  const reason = (err?.reason || err?.shortMessage || err?.message || "").toLowerCase();

  if (code === 4001 || code === "ACTION_REJECTED" || reason.includes("user rejected") || reason.includes("user denied") || reason.includes("rejected")) {
    return "Transaction was cancelled in wallet.";
  }
  if (reason.includes("already claimed")) {
    return "Funds have already been claimed.";
  }
  if (reason.includes("no reward")) {
    return "No reward is available for this round.";
  }
  if (reason.includes("not refundable")) {
    return "Refund is not available for this round.";
  }
  if (reason.includes("refund not available yet")) {
    return "Refund is not available yet. Please wait for the grace period to end.";
  }
  if (reason.includes("insufficient funds")) {
    return "Insufficient gas balance in wallet.";
  }
  if (reason.includes("insufficient") && reason.includes("balance")) {
    return "Insufficient token balance.";
  }
  if (reason.includes("allowance") || reason.includes("exceeds allowance")) {
    return "Token approval has not finished syncing yet. Please wait a moment and try again.";
  }
  if (reason.includes("game not found")) {
    return "Payment configuration is out of date. Refresh the page and try again.";
  }
  if (reason.includes("could not decode result data") || reason.includes("bad data")) {
    return "Payment configuration is out of date. Refresh the page and try again.";
  }
  if (reason.includes("payment not open")) {
    return "This room is not ready for payment yet. Refresh the page and try again.";
  }
  if (reason.includes("prediction window closed")) {
    return "Prediction window closed. Please choose earlier next round.";
  }
  if (reason.includes("already predicted")) {
    return "Prediction already submitted for this round.";
  }
  if (reason.includes("game not active")) {
    return "Prediction round is no longer active.";
  }
  if (reason.includes("payment required")) {
    return "Entry payment is not confirmed yet for this wallet.";
  }
  if (reason.includes("network") || reason.includes("chain")) {
    return "Wallet network is incorrect. Switch to Base Sepolia and try again.";
  }
  return err?.reason || err?.shortMessage || "Transaction failed. Please try again.";
}

async function waitForAllowance(token, wallet, spender, required, retries = 5, delayMs = 500) {
  for (let i = 0; i < retries; i += 1) {
    const allowance = await token.allowance(wallet, spender);
    if (allowance >= required) return allowance;
    if (i < retries - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return token.allowance(wallet, spender);
}

export function useContract() {
  const { signer, wallet, mockMode, chainOk, switchChain, setBalance } = useWallet();
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [predicting, setPredicting] = useState(false);

  const hasOnchainPayment = ethers.isAddress(CONTRACT_ADDRESS) && ethers.isAddress(USDC_ADDRESS);
  const shouldUseMockPayment = mockMode || !hasOnchainPayment;

  const ensureWalletReady = useCallback(async () => {
    if (!signer || !wallet) throw new Error("Wallet not connected");
    if (!chainOk) {
      const switched = await switchChain();
      if (!switched) throw new Error("Switch wallet to Base Sepolia before continuing");
    }
  }, [signer, wallet, chainOk, switchChain]);

  const getArena = useCallback(() => {
    if (!signer || !ethers.isAddress(CONTRACT_ADDRESS)) return null;
    return new ethers.Contract(CONTRACT_ADDRESS, ARENA_ABI, signer);
  }, [signer]);

  const mockPay = useCallback(async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (mockMode) setBalance((balance) => (parseFloat(balance) - ENTRY_FEE).toFixed(2));
    setLoading(false);
    return true;
  }, [mockMode, setBalance]);

  const payForGame = useCallback(async (gameId) => {
    if (shouldUseMockPayment) return mockPay();

    await ensureWalletReady();

    const arena = getArena();
    if (!arena) throw new Error("Wallet not connected");

    setLoading(true);
    try {
      let amount = ethers.parseUnits(ENTRY_FEE.toString(), 6);
      let resolvedUsdc = USDC_ADDRESS;
      const gameInfo = await arena.getGameInfo(gameId);
      const onchainGameId = Number(gameInfo?.[0] ?? 0);
      const onchainState = Number(gameInfo?.[2] ?? -1);

      if (onchainGameId !== Number(gameId)) {
        throw new Error("Payment configuration is out of date. Refresh the page and try again.");
      }
      if (onchainState !== GAME_STATE.PAYMENT) {
        throw new Error("This room is not ready for payment yet. Refresh the page and try again.");
      }

      try {
        const [contractUsdc, snapshotAmount] = await Promise.all([
          arena.usdc(),
          arena.gameEntryFee(gameId),
        ]);
        if (ethers.isAddress(contractUsdc)) resolvedUsdc = contractUsdc;
        if (snapshotAmount > 0) amount = snapshotAmount;
      } catch {
        resolvedUsdc = USDC_ADDRESS;
      }

      const token = new ethers.Contract(resolvedUsdc, ERC20_ABI, signer);
      const allowance = await token.allowance(wallet, CONTRACT_ADDRESS);

      if (allowance < amount) {
        await (await token.approve(CONTRACT_ADDRESS, ethers.MaxUint256)).wait();
        const refreshedAllowance = await waitForAllowance(token, wallet, CONTRACT_ADDRESS, amount);
        if (refreshedAllowance < amount) {
          throw new Error("Token approval has not finished syncing yet. Please wait a moment and try again.");
        }
      }

      await (await arena.payForGame(gameId)).wait();
      return true;
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setLoading(false);
    }
  }, [ensureWalletReady, getArena, mockPay, shouldUseMockPayment, signer, wallet]);

  const claimReward = useCallback(async (gameId) => {
    if (!gameId) throw new Error("Missing game id");
    if (shouldUseMockPayment) return true;

    await ensureWalletReady();

    const arena = getArena();
    if (!arena) throw new Error("Wallet not connected");

    setClaiming(true);
    try {
      await (await arena.claimReward(gameId)).wait();
      return true;
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setClaiming(false);
    }
  }, [ensureWalletReady, getArena, shouldUseMockPayment]);

  const getPlayerState = useCallback(async (gameId, targetWallet = wallet) => {
    if (!gameId || !targetWallet) return null;
    const reader = getArena();
    if (!reader) return null;
    const [prediction, hasPaid, reward, claimed] = await reader.getPlayerPrediction(gameId, targetWallet);
    return {
      prediction: Number(prediction),
      hasPaid: !!hasPaid,
      reward: Number(reward),
      claimed: !!claimed,
    };
  }, [getArena, wallet]);

  const getPredictionDeadline = useCallback(async (gameId) => {
    if (!gameId) return null;
    const reader = getArena();
    if (!reader) return null;
    const deadline = await reader.predictionDeadline(gameId);
    return Number(deadline);
  }, [getArena]);

  const getGameClaimStatus = useCallback(async (gameId, targetWallet = wallet) => {
    if (!gameId || !targetWallet) return null;
    const reader = getArena();
    if (!reader) return null;

    try {
      const [gameInfo, playerStateRaw, deadlineRaw] = await Promise.all([
        reader.getGameInfo(gameId),
        reader.getPlayerPrediction(gameId, targetWallet),
        reader.predictionDeadline(gameId),
      ]);

      let refundSupport = false;
      let refundGraceRaw = 0n;
      let entryFeeRaw = ethers.parseUnits(ENTRY_FEE.toString(), 6);

      try {
        [refundGraceRaw, entryFeeRaw] = await Promise.all([
          reader.refundGracePeriod(),
          reader.gameEntryFee(gameId),
        ]);
        refundSupport = true;
      } catch {
        refundSupport = false;
      }

      const state = Number(gameInfo[2]);
      const prediction = Number(playerStateRaw[0]);
      const hasPaid = !!playerStateRaw[1];
      const rewardRaw = Number(playerStateRaw[2]);
      const claimed = !!playerStateRaw[3];
      const predictionDeadline = Number(deadlineRaw);
      const refundGracePeriod = Number(refundGraceRaw);
      const refundUnlockAt = predictionDeadline > 0 ? predictionDeadline + refundGracePeriod : null;
      const entryFeeRawNumber = Number(entryFeeRaw);
      const now = Math.floor(Date.now() / 1000);
      const overdue = !!refundUnlockAt && now > refundUnlockAt;
      const canForceRefund = refundSupport && state === GAME_STATE.ACTIVE && hasPaid && !claimed && overdue;
      const canClaimRefund = refundSupport && state === GAME_STATE.REFUNDABLE && hasPaid && !claimed;
      const canClaimReward = state === GAME_STATE.SETTLED && rewardRaw > 0 && !claimed;
      const action = canClaimRefund || canForceRefund ? "refund" : canClaimReward ? "reward" : null;

      return {
        action,
        canClaimRefund,
        canClaimReward,
        canForceRefund,
        claimed,
        entryFee: entryFeeRawNumber / 1_000_000,
        entryFeeRaw: entryFeeRawNumber,
        hasPaid,
        overdue,
        prediction,
        predictionDeadline,
        refundGracePeriod,
        refundSupport,
        refundUnlockAt,
        reward: rewardRaw / 1_000_000,
        rewardRaw,
        state,
      };
    } catch {
      return null;
    }
  }, [getArena, wallet]);

  const claimGameFunds = useCallback(async (gameId, targetWallet = wallet) => {
    if (!gameId) throw new Error("Missing game id");
    if (shouldUseMockPayment) return { type: "mock" };

    await ensureWalletReady();

    const arena = getArena();
    if (!arena) throw new Error("Wallet not connected");

    setClaiming(true);
    try {
      const status = await getGameClaimStatus(gameId, targetWallet);
      if (!status) throw new Error("Payout status unavailable. Refresh and try again.");

      if (status.canClaimReward) {
        await (await arena.claimReward(gameId)).wait();
        return { type: "reward" };
      }

      if (status.canForceRefund) {
        await (await arena.forceRefund(gameId)).wait();
        await (await arena.claimRefund(gameId)).wait();
        return { type: "refund" };
      }

      if (status.canClaimRefund) {
        await (await arena.claimRefund(gameId)).wait();
        return { type: "refund" };
      }

      if (status.claimed) throw new Error("Funds have already been claimed.");
      if (status.state === GAME_STATE.ACTIVE) throw new Error("Refund is not available yet. Please wait for the grace period to end.");
      throw new Error("No funds are currently claimable for this round.");
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setClaiming(false);
    }
  }, [ensureWalletReady, getArena, getGameClaimStatus, shouldUseMockPayment, wallet]);

  const submitPrediction = useCallback(async (gameId, prediction, deadlineOverride = null) => {
    if (!gameId) throw new Error("Missing game id");
    if (shouldUseMockPayment) return { deadline: null, hash: null };

    await ensureWalletReady();

    const arena = getArena();
    if (!arena) throw new Error("Wallet not connected");

    const predictionValue = prediction === "up" ? 1 : prediction === "down" ? 2 : 0;
    if (!predictionValue) throw new Error("Invalid prediction");

    setPredicting(true);
    try {
      const deadline = deadlineOverride || await getPredictionDeadline(gameId);
      if (!deadline) throw new Error("Prediction deadline unavailable");
      const now = Math.floor(Date.now() / 1000);
      if (now > deadline) throw new Error("Prediction window closed. Please choose earlier next round.");
      const tx = await arena.predict(gameId, predictionValue);
      await tx.wait();
      return { deadline, hash: tx.hash };
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setPredicting(false);
    }
  }, [ensureWalletReady, getArena, getPredictionDeadline, shouldUseMockPayment]);

  return {
    payForGame,
    claimReward,
    claimGameFunds,
    getPlayerState,
    getPredictionDeadline,
    getGameClaimStatus,
    submitPrediction,
    loading,
    claiming,
    predicting,
    mockPay,
    shouldUseMockPayment,
  };
}
