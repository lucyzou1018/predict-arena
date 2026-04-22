import { useCallback, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import { ARENA_ABI, ERC20_ABI, CONTRACT_ADDRESS, USDC_ADDRESS, GAME_STATE } from "../config/contract";
import { BASE_SEPOLIA_FALLBACK_RPC_URLS, CHAIN, ENTRY_FEE, LOCAL_CHAIN_MOCK, SERVER_URL } from "../config/constants";

const BASE_SEPOLIA_NETWORK = ethers.Network.from({
  name: "base-sepolia",
  chainId: Number.parseInt(CHAIN.chainId, 16),
});

const READ_PROVIDERS = BASE_SEPOLIA_FALLBACK_RPC_URLS.map(
  (url) => new ethers.JsonRpcProvider(url, BASE_SEPOLIA_NETWORK, { staticNetwork: BASE_SEPOLIA_NETWORK }),
);
const GAS_BUFFER_BPS = 12000n;
const BASE_SEPOLIA_CHAIN_ID = BigInt(Number.parseInt(CHAIN.chainId, 16));

function toRpcQuantity(value) {
  if (value === undefined || value === null || value === "") return null;
  try {
    return ethers.toQuantity(value);
  } catch {
    return null;
  }
}

async function withStableRead(fn) {
  let lastError = null;
  for (const provider of READ_PROVIDERS) {
    try {
      return await fn(provider);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  throw new Error("Stable read provider unavailable");
}

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
  if (reason.includes("still preparing on-chain")) {
    return "Room payment is still preparing on-chain. Please wait a moment and try again.";
  }
  if (reason.includes("still syncing on-chain")) {
    return "Room payment is still syncing on-chain. Please wait a moment and try again.";
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
  // Base Sepolia 对"会 revert"的 tx 在 estimateGas 时统一返回 "intrinsic gas too high"，
  // 真实 revert 原因被 RPC 吞掉，ethers 最终表达为 "missing revert data"。
  if (reason.includes("intrinsic gas too high") || reason.includes("missing revert data")) {
    return "Network is rejecting the transaction. Please refresh and retry, or switch RPC in your wallet.";
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

async function fetchClaimStatus(chainGameId, wallet) {
  const response = await fetch(`${SERVER_URL}/api/claims/${chainGameId}/${wallet}`);
  if (!response.ok) return null;
  return response.json();
}

export function useContract() {
  const { signer, wallet, walletProvider, walletName, mockMode, chainOk, switchChain, setBalance } = useWallet();
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [predicting, setPredicting] = useState(false);

  const hasOnchainPayment = ethers.isAddress(CONTRACT_ADDRESS) && ethers.isAddress(USDC_ADDRESS);
  const shouldUseMockPayment = mockMode || LOCAL_CHAIN_MOCK || !hasOnchainPayment;
  const isOkxWallet = /okx/i.test(walletName || "");

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

  const getArenaReader = useCallback(async () => {
    if (!ethers.isAddress(CONTRACT_ADDRESS)) return null;
    const provider = await withStableRead(async (stableProvider) => {
      await stableProvider.getNetwork();
      return stableProvider;
    });
    return new ethers.Contract(CONTRACT_ADDRESS, ARENA_ABI, provider);
  }, []);

  const mockPay = useCallback(async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (mockMode) setBalance((balance) => (parseFloat(balance) - ENTRY_FEE).toFixed(2));
    setLoading(false);
    return true;
  }, [mockMode, setBalance]);

  const prepareTransactionRequest = useCallback(async (txRequest, fallbackGasLimit, preferLegacy = false) => {
    if (!wallet) throw new Error("Wallet not connected");
    if (!txRequest?.to) throw new Error("Transaction target unavailable");

    const preparedRequest = {
      to: txRequest.to,
      data: txRequest.data || "0x",
      chainId: BASE_SEPOLIA_CHAIN_ID,
    };
    if (txRequest.value !== undefined && txRequest.value !== null) preparedRequest.value = txRequest.value;

    let gasLimit = txRequest.gasLimit || null;
    if (!gasLimit) {
      try {
        const estimatedGas = await withStableRead((provider) => provider.estimateGas({
          from: wallet,
          to: preparedRequest.to,
          data: preparedRequest.data,
          value: preparedRequest.value ?? 0n,
        }));
        gasLimit = (estimatedGas * GAS_BUFFER_BPS + 9999n) / 10000n;
      } catch (error) {
        console.warn("[tx] stable gas estimate unavailable", error);
      }
    }
    if (!gasLimit && fallbackGasLimit) gasLimit = fallbackGasLimit;
    if (!gasLimit) throw new Error("Unable to estimate gas for this payment. Refresh and try again.");
    preparedRequest.gasLimit = gasLimit;

    let gasPrice = txRequest.gasPrice || null;
    let maxFeePerGas = txRequest.maxFeePerGas || null;
    let maxPriorityFeePerGas = txRequest.maxPriorityFeePerGas || null;
    try {
      const feeData = await withStableRead((provider) => provider.getFeeData());
      maxFeePerGas = maxFeePerGas || feeData?.maxFeePerGas || null;
      maxPriorityFeePerGas = maxPriorityFeePerGas || feeData?.maxPriorityFeePerGas || null;
      gasPrice = gasPrice || feeData?.gasPrice || null;
    } catch (error) {
      console.warn("[tx] stable fee data unavailable", error);
    }
    if (!gasPrice || gasPrice <= 0n) {
      try {
        const rpcGasPrice = await withStableRead((provider) => provider.send("eth_gasPrice", []));
        gasPrice = rpcGasPrice ? BigInt(rpcGasPrice) : gasPrice;
      } catch (error) {
        console.warn("[tx] rpc gas price unavailable", error);
      }
    }

    if (preferLegacy) {
      const legacyGasPrice = gasPrice || maxFeePerGas || null;
      if (!legacyGasPrice || legacyGasPrice <= 0n) {
        throw new Error("Unable to determine network fee for this payment. Refresh and try again.");
      }
      preparedRequest.gasPrice = legacyGasPrice;
      return preparedRequest;
    }

    if (maxFeePerGas && maxFeePerGas > 0n && maxPriorityFeePerGas && maxPriorityFeePerGas > 0n) {
      preparedRequest.maxFeePerGas = maxFeePerGas;
      preparedRequest.maxPriorityFeePerGas = maxPriorityFeePerGas;
      return preparedRequest;
    }

    if (gasPrice && gasPrice > 0n) {
      preparedRequest.gasPrice = gasPrice;
      return preparedRequest;
    }

    throw new Error("Unable to determine network fee for this payment. Refresh and try again.");
  }, [wallet]);

  const sendOkxTransaction = useCallback(async (txRequest) => {
    if (!walletProvider?.request) throw new Error("Wallet provider unavailable");
    const rpcTx = {
      from: wallet,
      to: txRequest?.to,
      data: txRequest?.data || "0x",
    };
    if (txRequest?.gasLimit) rpcTx.gas = ethers.toQuantity(txRequest.gasLimit);
    if (txRequest?.gasPrice) rpcTx.gasPrice = ethers.toQuantity(txRequest.gasPrice);
    if (txRequest?.chainId) rpcTx.chainId = ethers.toQuantity(txRequest.chainId);
    if (txRequest?.value && txRequest.value > 0n) rpcTx.value = ethers.toQuantity(txRequest.value);
    try {
      const pendingNonce = await walletProvider.request({ method: "eth_getTransactionCount", params: [wallet, "pending"] });
      const nonce = toRpcQuantity(pendingNonce);
      if (nonce) rpcTx.nonce = nonce;
    } catch (error) {
      console.warn("[tx] wallet nonce lookup unavailable", error);
    }
    const hash = await walletProvider.request({ method: "eth_sendTransaction", params: [rpcTx] });
    return {
      hash,
      wait: async () => signer?.provider?.waitForTransaction(hash),
    };
  }, [signer, wallet, walletProvider]);

  const sendPreparedTransaction = useCallback(async (txRequest, fallbackGasLimit) => {
    if (!signer) throw new Error("Wallet not connected");
    const preparedRequest = await prepareTransactionRequest(txRequest, fallbackGasLimit, isOkxWallet);
    if (isOkxWallet) return sendOkxTransaction(preparedRequest);
    return signer.sendTransaction(preparedRequest);
  }, [isOkxWallet, prepareTransactionRequest, sendOkxTransaction, signer]);

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
      // Room/match payments happen repeatedly. Grant a reusable allowance once so
      // later payments usually only need the single payForGame wallet confirmation.
      const approvalRequest = await token.approve.populateTransaction(CONTRACT_ADDRESS, ethers.MaxUint256);
      await (await sendPreparedTransaction(approvalRequest, 120000n)).wait();
      const refreshedAllowance = await waitForAllowance(token, wallet, CONTRACT_ADDRESS, amount);
      if (refreshedAllowance < amount) {
        throw new Error("Token approval has not finished syncing yet. Please wait a moment and try again.");
      }
      return { resolvedUsdc };
    }

    return { resolvedUsdc };
  }, [getArena, sendPreparedTransaction, signer, wallet]);

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
      const reader = await getArenaReader();
      try {
        if (reader) {
          await reader.payForGame.staticCall(gameId, { from: wallet });
        } else {
          await arena.payForGame.staticCall(gameId);
        }
      } catch (simErr) {
        console.error("[payForGame] staticCall failed:", simErr);
        throw simErr;
      }

      const paymentRequest = await arena.payForGame.populateTransaction(gameId);
      await (await sendPreparedTransaction(paymentRequest, 300000n)).wait();
      return { approved: true, paid: true };
    } catch (err) {
      throw new Error(mapContractError(err));
    } finally {
      setLoading(false);
    }
  }, [ensureTokenApproval, ensureWalletReady, getArena, getArenaReader, mockPay, sendPreparedTransaction, shouldUseMockPayment, wallet]);

  const payForRoomEntry = useCallback(async ({ inviteCode, chainGameId = null } = {}) => {
    if (shouldUseMockPayment) return mockPay();

    await ensureWalletReady();

    const arena = getArena();
    if (!arena) throw new Error("Wallet not connected");
    if (!inviteCode) throw new Error("Missing invite code");
    try {
      let resolvedChainGameId = Number(chainGameId || 0);
      try {
        if (!resolvedChainGameId) {
          resolvedChainGameId = Number(await arena.inviteCodeToGame(inviteCode));
        }
      } catch {
        resolvedChainGameId = Number(chainGameId || 0);
      }

      if (!resolvedChainGameId || resolvedChainGameId <= 0) {
        throw new Error("Room payment is still syncing on-chain. Please wait a moment and try again.");
      }

      const result = await payForGame(resolvedChainGameId);
      return { ...result, chainGameId: resolvedChainGameId };
    } catch (err) {
      throw new Error(mapContractError(err));
    }
  }, [ensureWalletReady, getArena, mockPay, payForGame, shouldUseMockPayment, wallet]);

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
