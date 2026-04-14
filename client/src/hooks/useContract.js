import { useCallback, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import { ARENA_ABI, ERC20_ABI, CONTRACT_ADDRESS, USDC_ADDRESS } from "../config/contract";
import { ENTRY_FEE } from "../config/constants";

function mapContractError(err) {
  const code = err?.code || err?.info?.error?.code;
  const reason = (err?.reason || err?.shortMessage || err?.message || "").toLowerCase();

  if (code === 4001 || code === "ACTION_REJECTED" || reason.includes("user rejected") || reason.includes("user denied") || reason.includes("rejected")) {
    return "Transaction was cancelled in wallet.";
  }
  if (reason.includes("already claimed")) {
    return "Reward has already been claimed.";
  }
  if (reason.includes("no reward")) {
    return "No reward is available for this round.";
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
  if (reason.includes("could not decode result data") || reason.includes("bad data")) {
    return "Payment configuration is out of date. Refresh the page and try again.";
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

    const arena = new ethers.Contract(CONTRACT_ADDRESS, ARENA_ABI, signer);
    const amount = ethers.parseUnits(ENTRY_FEE.toString(), 6);

    setLoading(true);
    try {
      let resolvedUsdc = USDC_ADDRESS;
      try {
        const contractUsdc = await arena.usdc();
        if (ethers.isAddress(contractUsdc)) resolvedUsdc = contractUsdc;
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
  }, [ensureWalletReady, mockPay, shouldUseMockPayment, signer, wallet]);

  const claimReward = useCallback(async (gameId) => {
    if (!gameId) throw new Error("Missing game id");
    if (shouldUseMockPayment) return true;

    await ensureWalletReady();

    const arena = new ethers.Contract(CONTRACT_ADDRESS, ARENA_ABI, signer);

    setClaiming(true);
    try {
      await (await arena.claimReward(gameId)).wait();
      return true;
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setClaiming(false);
    }
  }, [ensureWalletReady, shouldUseMockPayment, signer]);

  const getPlayerState = useCallback(async (gameId, targetWallet = wallet) => {
    if (!gameId || !targetWallet || !ethers.isAddress(CONTRACT_ADDRESS)) return null;
    const reader = signer
      ? new ethers.Contract(CONTRACT_ADDRESS, ARENA_ABI, signer)
      : null;
    if (!reader) return null;
    const [prediction, hasPaid, reward, claimed] = await reader.getPlayerPrediction(gameId, targetWallet);
    return {
      prediction: Number(prediction),
      hasPaid: !!hasPaid,
      reward: Number(reward),
      claimed: !!claimed,
    };
  }, [signer, wallet]);

  const getPredictionDeadline = useCallback(async (gameId) => {
    if (!gameId || !ethers.isAddress(CONTRACT_ADDRESS)) return null;
    const reader = signer
      ? new ethers.Contract(CONTRACT_ADDRESS, ARENA_ABI, signer)
      : null;
    if (!reader) return null;
    const deadline = await reader.predictionDeadline(gameId);
    return Number(deadline);
  }, [signer]);

  const submitPrediction = useCallback(async (gameId, prediction) => {
    if (!gameId) throw new Error("Missing game id");
    if (shouldUseMockPayment) return { signature: null, deadline: null };

    await ensureWalletReady();

    const predictionValue = prediction === "up" ? 1 : prediction === "down" ? 2 : 0;
    if (!predictionValue) throw new Error("Invalid prediction");

    setPredicting(true);
    try {
      const deadline = await getPredictionDeadline(gameId);
      if (!deadline) throw new Error("Prediction deadline unavailable");
      const network = await signer.provider.getNetwork();
      const domain = {
        name: "BtcPredictArena",
        version: "1",
        chainId: Number(network.chainId),
        verifyingContract: CONTRACT_ADDRESS,
      };
      const types = {
        PredictionIntent: [
          { name: "gameId", type: "uint256" },
          { name: "player", type: "address" },
          { name: "prediction", type: "uint8" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = {
        gameId,
        player: wallet,
        prediction: predictionValue,
        deadline,
      };
      const signature = await signer.signTypedData(domain, types, value);
      return { signature, deadline };
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setPredicting(false);
    }
  }, [ensureWalletReady, getPredictionDeadline, shouldUseMockPayment, signer, wallet]);

  return { payForGame, claimReward, getPlayerState, getPredictionDeadline, submitPrediction, loading, claiming, predicting, mockPay, shouldUseMockPayment };
}
