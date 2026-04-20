import { useCallback, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import { ARENA_ABI, ERC20_ABI, CONTRACT_ADDRESS, USDC_ADDRESS, GAME_STATE } from "../config/contract";
import { ENTRY_FEE, LOCAL_CHAIN_MOCK, SERVER_URL } from "../config/constants";

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
  if (reason.includes("invalid start auth") || reason.includes("start authorization expired")) {
    return "Start authorization expired. Please try again.";
  }
  if (reason.includes("invalid settlement auth") || reason.includes("settlement authorization expired")) {
    return "Settlement authorization expired. Please try again.";
  }
  if (reason.includes("payment window still active")) {
    return "Refund is not available yet. Please wait for the payment timeout.";
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
  if (reason.includes("transfer amount exceeds") || reason.includes("exceeds balance")) {
    return "Insufficient USDC balance.";
  }
  if (reason.includes("payment failed")) {
    return "USDC transfer failed. Check your USDC balance and approval.";
  }
  if (reason.includes("invite code taken")) {
    return "This room is already opening on-chain. Please try paying again in a moment.";
  }
  if (reason.includes("room not found")) {
    return "Room payment is still syncing on-chain. Please retry in a moment.";
  }
  if (reason.includes("room not joinable")) {
    return "This room is no longer accepting on-chain payments.";
  }
  if (reason.includes("already joined")) {
    return "This wallet is already attached to the room on-chain. Try paying again.";
  }
  if (reason.includes("invalid room payment auth")) {
    return "Room payment authorization expired. Refresh the room and try again.";
  }
  if (reason.includes("payment authorization expired")) {
    return "Room payment authorization expired. Refresh the room and try again.";
  }
  if (reason.includes("player not in room") || reason.includes("owner not in room") || reason.includes("roster mismatch")) {
    return "Room player list is out of date. Refresh the room and try again.";
  }
  if (reason.includes("not a player")) {
    return "Wallet is not registered as a player for this game.";
  }
  if (reason.includes("already paid")) {
    return "Payment was already submitted for this game.";
  }
  console.error("[payForGame] unmapped error:", { code, reason, err });
  return err?.reason || err?.shortMessage || err?.message || "Transaction failed. Please try again.";
}

async function waitForAllowance(token, wallet, spender, required, retries = 5, delayMs = 500) {
  for (let i = 0; i < retries; i += 1) {
    const allowance = await token.allowance(wallet, spender);
    if (allowance >= required) return allowance;
    if (i < retries - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return token.allowance(wallet, spender);
}

async function waitForInviteCodeGameId(arena, inviteCode, retries = 8, delayMs = 500) {
  for (let i = 0; i < retries; i += 1) {
    const gameId = await arena.inviteCodeToGame(inviteCode);
    if (gameId > 0n) return Number(gameId);
    if (i < retries - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  const finalGameId = await arena.inviteCodeToGame(inviteCode);
  return finalGameId > 0n ? Number(finalGameId) : null;
}

async function fetchClaimStatus(chainGameId, wallet) {
  const response = await fetch(`${SERVER_URL}/api/claims/${chainGameId}/${wallet}`);
  if (!response.ok) return null;
  return response.json();
}

export function useContract() {
  const { signer, wallet, mockMode, chainOk, switchChain, setBalance } = useWallet();
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [predicting, setPredicting] = useState(false);

  const hasOnchainPayment = ethers.isAddress(CONTRACT_ADDRESS) && ethers.isAddress(USDC_ADDRESS);
  const shouldUseMockPayment = mockMode || LOCAL_CHAIN_MOCK || !hasOnchainPayment;

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

  const ensureTokenApproval = useCallback(async (amount, preferredUsdc = USDC_ADDRESS) => {
    let resolvedUsdc = preferredUsdc;
    try {
      const arena = getArena();
      const contractUsdc = await arena?.usdc?.();
      if (ethers.isAddress(contractUsdc)) resolvedUsdc = contractUsdc;
    } catch {
      resolvedUsdc = preferredUsdc;
    }

    const token = new ethers.Contract(resolvedUsdc, ERC20_ABI, signer);
    const allowance = await token.allowance(wallet, CONTRACT_ADDRESS);

    if (allowance < amount) {
      // 精确授权本次所需金额，而不是 MaxUint256。这样钱包弹窗会显示具体 USDC 数量，用户能看清楚。
      await (await token.approve(CONTRACT_ADDRESS, amount)).wait();
      const refreshedAllowance = await waitForAllowance(token, wallet, CONTRACT_ADDRESS, amount);
      if (refreshedAllowance < amount) {
        throw new Error("Token approval has not finished syncing yet. Please wait a moment and try again.");
      }
      return { resolvedUsdc };
    }

    return { resolvedUsdc };
  }, [getArena, signer, wallet]);

  const payForGame = useCallback(async (gameId) => {
    if (shouldUseMockPayment) return mockPay();

    await ensureWalletReady();

    const arena = getArena();
    if (!arena) throw new Error("Wallet not connected");

    setLoading(true);
    try {
      let amount = ethers.parseUnits(ENTRY_FEE.toString(), 6);
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
        const snapshotAmount = await arena.gameEntryFee(gameId);
        if (snapshotAmount > 0) amount = snapshotAmount;
      } catch {}

      await ensureTokenApproval(amount);

      await (await arena.payForGame(gameId)).wait();
      return { approved: true, paid: true };
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setLoading(false);
    }
  }, [ensureTokenApproval, ensureWalletReady, getArena, mockPay, shouldUseMockPayment]);

  const payForRoomEntry = useCallback(async ({ inviteCode, maxPlayers = null, isOwner = false, auth = null } = {}) => {
    if (shouldUseMockPayment) return mockPay();

    await ensureWalletReady();

    const arena = getArena();
    if (!arena) throw new Error("Wallet not connected");
    if (!inviteCode) throw new Error("Missing invite code");
    if (!auth?.signature || !Array.isArray(auth?.players) || !auth?.deadline) {
      throw new Error("Room payment authorization expired. Refresh the room and try again.");
    }

    setLoading(true);
    try {
      let amount = ethers.parseUnits(ENTRY_FEE.toString(), 6);
      let existingGameId = 0;
      const authMaxPlayers = Number(auth?.maxPlayers || maxPlayers || 0);
      const authRoomOwner = auth?.roomOwner || wallet;

      try {
        existingGameId = Number(await arena.inviteCodeToGame(inviteCode));
      } catch {
        existingGameId = 0;
      }

      try {
        if (existingGameId > 0) {
          const snapshotAmount = await arena.gameEntryFee(existingGameId);
          if (snapshotAmount > 0) amount = snapshotAmount;
        } else {
          const liveEntryFee = await arena.entryFee();
          if (liveEntryFee > 0) amount = liveEntryFee;
        }
      } catch {}

      await ensureTokenApproval(amount);

      if (isOwner) {
        if (!authMaxPlayers) throw new Error("Missing room size");
        await (await arena.createRoomAndPay(authMaxPlayers, inviteCode, auth.players, auth.deadline, auth.signature)).wait();
      } else {
        await (await arena.joinRoomAndPay(inviteCode, authMaxPlayers, authRoomOwner, auth.players, auth.deadline, auth.signature)).wait();
      }

      const chainGameId = existingGameId || await waitForInviteCodeGameId(arena, inviteCode);
      return { approved: true, paid: true, chainGameId };
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setLoading(false);
    }
  }, [ensureTokenApproval, ensureWalletReady, getArena, mockPay, shouldUseMockPayment, wallet]);

  const claimReward = useCallback(async (gameId) => {
    if (!gameId) throw new Error("Missing game id");
    if (shouldUseMockPayment) return true;

    await ensureWalletReady();

    const arena = getArena();
    if (!arena) throw new Error("Wallet not connected");

    setClaiming(true);
    try {
      const status = await fetchClaimStatus(gameId, wallet);
      if (!status?.canClaimReward) throw new Error("No reward is available for this round.");
      await (await arena["claimReward(uint256,uint8,uint256,bytes32[])"](
        gameId,
        Number(status.predictionValue || 0),
        BigInt(status.rewardRaw || 0),
        Array.isArray(status.proof) ? status.proof : [],
      )).wait();
      return true;
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setClaiming(false);
    }
  }, [ensureWalletReady, getArena, shouldUseMockPayment, wallet]);

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

  const startSignedGame = useCallback(async (gameId, basePrice, auth) => {
    if (!gameId || !auth?.signature || !auth?.validUntil) throw new Error("Start authorization unavailable");
    if (shouldUseMockPayment) return true;

    await ensureWalletReady();

    const arena = getArena();
    if (!arena) throw new Error("Wallet not connected");

    setLoading(true);
    try {
      await (await arena.startGameWithAuth(gameId, basePrice, auth.validUntil, auth.signature)).wait();
      return true;
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setLoading(false);
    }
  }, [ensureWalletReady, getArena, shouldUseMockPayment]);

  const settleSignedGame = useCallback(async (gameId, settlementPrice, auth, predictionIntents = []) => {
    if (!gameId || !auth?.signature || !auth?.validUntil || !auth?.resultRoot || auth?.totalPayout === undefined || auth?.totalPayout === null) throw new Error("Settlement authorization unavailable");
    if (shouldUseMockPayment) return true;

    await ensureWalletReady();

    const arena = getArena();
    if (!arena) throw new Error("Wallet not connected");

    setLoading(true);
    try {
      await (await arena.settleGameWithAuth(
        gameId,
        settlementPrice,
        auth.resultRoot,
        auth.totalPayout,
        auth.validUntil,
        auth.signature,
      )).wait();
      return true;
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setLoading(false);
    }
  }, [ensureWalletReady, getArena, shouldUseMockPayment]);

  const getGameClaimStatus = useCallback(async (gameId, targetWallet = wallet) => {
    if (!gameId || !targetWallet) return null;
    try {
      return await fetchClaimStatus(gameId, targetWallet);
    } catch {
      return null;
    }
  }, [wallet]);

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
        const rewardRaw = BigInt(status.rewardRaw || 0);
        const predictionValue = Number(status.predictionValue || 0);
        const proof = Array.isArray(status.proof) ? status.proof : [];
        await (await arena["claimReward(uint256,uint8,uint256,bytes32[])"](gameId, predictionValue, rewardRaw, proof)).wait();
        return { type: "reward" };
      }

      if (status.canForceRefund) {
        await (await arena.forceRefund(gameId)).wait();
        await (await arena.claimRefund(gameId)).wait();
        return { type: "refund" };
      }

      if (status.canCancelExpired) {
        await (await arena.cancelExpiredGame(gameId)).wait();
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
    if (shouldUseMockPayment) return { deadline: null, signature: null };

    await ensureWalletReady();

    const predictionValue = prediction === "up" ? 1 : prediction === "down" ? 2 : 0;
    if (!predictionValue) throw new Error("Invalid prediction");

    setPredicting(true);
    try {
      const deadline = deadlineOverride || await getPredictionDeadline(gameId);
      if (!deadline) throw new Error("Prediction deadline unavailable");
      const now = Math.floor(Date.now() / 1000);
      if (now > deadline) throw new Error("Prediction window closed. Please choose earlier next round.");
      const network = await signer.provider.getNetwork();
      const signature = await signer.signTypedData(
        {
          name: "BtcPredictArena",
          version: "1",
          chainId: Number(network.chainId),
          verifyingContract: CONTRACT_ADDRESS,
        },
        {
          PredictionIntent: [
            { name: "gameId", type: "uint256" },
            { name: "player", type: "address" },
            { name: "prediction", type: "uint8" },
            { name: "deadline", type: "uint256" },
          ],
        },
        {
          gameId: Number(gameId),
          player: wallet,
          prediction: predictionValue,
          deadline: Number(deadline),
        },
      );
      return { deadline, signature };
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setPredicting(false);
    }
  }, [ensureWalletReady, getPredictionDeadline, shouldUseMockPayment, signer, wallet]);

  return {
    payForGame,
    payForRoomEntry,
    claimReward,
    claimGameFunds,
    getPlayerState,
    getPredictionDeadline,
    getGameClaimStatus,
    startSignedGame,
    settleSignedGame,
    submitPrediction,
    loading,
    claiming,
    predicting,
    mockPay,
    shouldUseMockPayment,
  };
}
