import { ethers } from "ethers";
import Redis from "ioredis";
import config from "../config/index.js";
import { createRpcFetchRequest, proxyUrl } from "../utils/network.js";
import dbPool from "../config/database.js";

const TX_CONFIRM_TIMEOUT_MS = parseInt(process.env.CONTRACT_TX_CONFIRM_TIMEOUT_MS || "90000", 10);
const TX_RECOVERY_TIMEOUT_MS = parseInt(process.env.CONTRACT_TX_RECOVERY_TIMEOUT_MS || "60000", 10);
const TX_RECOVERY_POLL_MS = parseInt(process.env.CONTRACT_TX_RECOVERY_POLL_MS || "500", 10);
const NONCE_LOCK_WAIT_MS = parseInt(process.env.CONTRACT_NONCE_LOCK_WAIT_MS || "30000", 10);
const NONCE_LOCK_TTL_MS = parseInt(process.env.CONTRACT_NONCE_LOCK_TTL_MS || "15000", 10);
const NONCE_LOCK_RETRY_MS = parseInt(process.env.CONTRACT_NONCE_LOCK_RETRY_MS || "150", 10);
const RELAY_NONCE_SYNC_WAIT_MS = parseInt(process.env.CONTRACT_NONCE_SYNC_WAIT_MS || "20000", 10);
const RELAY_NONCE_RETRY_MS = parseInt(process.env.CONTRACT_NONCE_RETRY_MS || "400", 10);
const RELAY_MIN_PRIORITY_FEE = ethers.parseUnits(process.env.CONTRACT_RELAY_MIN_PRIORITY_GWEI || "0.001", "gwei");
const RELAY_MAX_PRIORITY_FEE = ethers.parseUnits(process.env.CONTRACT_RELAY_MAX_PRIORITY_GWEI || "0.02", "gwei");
const RELAY_MAX_FEE_MULTIPLIER = BigInt(parseInt(process.env.CONTRACT_RELAY_MAX_FEE_MULTIPLIER || "1", 10));
const BASE_SEPOLIA_NETWORK = ethers.Network.from({ name: "base-sepolia", chainId: 84532 });
const DEFAULT_BASE_SEPOLIA_RPC_FALLBACKS = [
  "https://sepolia.base.org",
];

const RELAY_GAS_LIMITS = {
  ownerCreateGame: 220000n,
  ownerCreateRoom: 260000n,
  ownerJoinGame: 150000n,
  ownerJoinRoom: 150000n,
  startGameWithAuth: 220000n,
  submitPredictionBySig: 180000n,
  submitPredictionsBySigBatch: 420000n,
  settleGameWithAuth: 220000n,
  cancelExpiredGame: 320000n,
};

const START_GAME_AUTH_WINDOW_SEC = parseInt(process.env.START_GAME_AUTH_WINDOW_SEC || "180", 10);
const SETTLEMENT_AUTH_WINDOW_SEC = parseInt(process.env.SETTLEMENT_AUTH_WINDOW_SEC || "180", 10);

const START_GAME_AUTH_TYPES = {
  StartGameAuth: [
    { name: "gameId", type: "uint256" },
    { name: "basePrice", type: "uint256" },
    { name: "validUntil", type: "uint256" },
  ],
};

const SETTLEMENT_AUTH_TYPES = {
  SettlementAuth: [
    { name: "gameId", type: "uint256" },
    { name: "settlementPrice", type: "uint256" },
    { name: "resultRoot", type: "bytes32" },
    { name: "totalPayout", type: "uint256" },
    { name: "validUntil", type: "uint256" },
  ],
};

const PREDICTION_RECEIPT_TYPES = {
  PredictionReceipt: [
    { name: "gameId", type: "uint256" },
    { name: "player", type: "address" },
    { name: "prediction", type: "uint8" },
    { name: "deadline", type: "uint256" },
  ],
};

const ABI = [
  "function ownerCreateGame(uint8, address) external returns (uint256)",
  "function ownerCreateRoom(uint8, string, address) external returns (uint256)",
  "function ownerJoinGame(uint256, address) external",
  "function ownerJoinRoom(string, address) external",
  "function startGame(uint256, uint256) external",
  "function startGameWithAuth(uint256, uint256, uint256, bytes) external",
  "function submitPredictionBySig(uint256, address, uint8, uint256, bytes) external",
  "function submitPredictionsBySigBatch(uint256, address[], uint8[], uint256[], bytes[]) external",
  "function settleGame(uint256, uint256) external",
  "function settleGameWithAuth(uint256, uint256, bytes32, uint256, uint256, bytes) external",
  "function cancelGame(uint256) external",
  "function cancelExpiredGame(uint256) external",
  "function allPlayersPaid(uint256) external view returns (bool)",
  "function inviteCodeToGame(string) external view returns (uint256)",
  "function predictionDeadline(uint256) external view returns (uint256)",
  "function paymentDeadlineAt(uint256) external view returns (uint256)",
  "function getPlayerPrediction(uint256, address) external view returns (uint8,bool,uint256,bool)",
  "function getGameInfo(uint256) external view returns (uint256,uint8,uint8,uint256,uint256,uint256,bool,string)",
  "event GameCreated(uint256 indexed gameId, uint8 maxPlayers, bool isRoom, string inviteCode, address creator)",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRpcTimeoutLike = (error) => {
  const responseBody = `${error?.info?.responseBody || error?.responseBody || ""}`.toLowerCase();
  const responseStatus = `${error?.info?.responseStatus || error?.responseStatus || ""}`.toLowerCase();
  const requestUrl = `${error?.info?.requestUrl || error?.requestUrl || ""}`.toLowerCase();
  const message = `${error?.message || ""} ${responseBody} ${responseStatus} ${requestUrl}`.toLowerCase();
  return (
    error?.code === "TIMEOUT" ||
    error?.code === "SERVER_ERROR" ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("network error") ||
    message.includes("timed out while waiting for confirmation") ||
    message.includes("error when dialing")
  );
};

const isNonceConflictLike = (error) => {
  const message = `${error?.message || ""}`.toLowerCase();
  return (
    message.includes("nonce has already been used") ||
    message.includes("nonce too low") ||
    message.includes("replacement transaction underpriced")
  );
};

const isAlreadyKnownLike = (error) => {
  const message = `${error?.message || ""}`.toLowerCase();
  return (
    message.includes("already known") ||
    message.includes("known transaction") ||
    message.includes("already imported")
  );
};

const buildRpcUrls = (primaryUrl) => {
  const explicitFallbacks = `${process.env.RPC_FALLBACK_URLS || ""}`
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const inferredFallbacks = `${primaryUrl || ""}`.toLowerCase().includes("sepolia")
    ? DEFAULT_BASE_SEPOLIA_RPC_FALLBACKS
    : [];

  return [...new Set([primaryUrl, ...explicitFallbacks, ...inferredFallbacks].filter(Boolean))];
};

const pickPreferredTxRpcIndex = (urls) => {
  if (!Array.isArray(urls) || urls.length === 0) return 0;
  return 0;
};

const formatEth = (value) => {
  try {
    return ethers.formatEther(value || 0n);
  } catch (_) {
    return "0";
  }
};

const toBigIntOrNull = (value) => {
  try {
    if (value === null || value === undefined) return null;
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.floor(value));
    if (typeof value === "string") return BigInt(value);
    if (typeof value?.toString === "function") return BigInt(value.toString());
  } catch (_) {}
  return null;
};

const clampBigInt = (value, min, max) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const medianBigInt = (values) => {
  const sorted = values.filter((value) => typeof value === "bigint" && value > 0n).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (sorted.length === 0) return null;
  return sorted[Math.floor(sorted.length / 2)];
};

class ContractService {
  constructor() {
    this.initialized = false;
    this.mockMode = config.contract.mockMode;
    this.redis = null;
    this.redisEnabled = false;
    this.instanceId = `${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
    this.feeCache = null;
    this.relayQueues = new Map();
    this._localNonces = new Map();
    this.rpcProviders = [];
    this.ownerSigner = null;
    this.executorSigner = null;
    this.authSigner = null;
  }

  async init() {
    if (this.mockMode) {
      console.warn("[Contract] Local chain mock enabled");
      return;
    }
    if (!config.rpc.url || !config.contract.address || !config.contract.ownerKey || !config.contract.oracleKey) {
      console.warn("[Contract] Missing config, mock mode");
      this.mockMode = true;
      return;
    }
    const rpcUrls = buildRpcUrls(config.rpc.url);
    this.rpcProviders = rpcUrls.map((url) => new ethers.JsonRpcProvider(
      createRpcFetchRequest(url),
      BASE_SEPOLIA_NETWORK,
      { staticNetwork: BASE_SEPOLIA_NETWORK },
    ));
    const txProviderIndex = pickPreferredTxRpcIndex(rpcUrls);
    this.txProvider = this.rpcProviders[txProviderIndex];
    this.provider = this.txProvider;
    this.ownerSigner = new ethers.Wallet(config.contract.ownerKey, this.txProvider);
    this.executorSigner = new ethers.Wallet(config.contract.executorKey || config.contract.ownerKey, this.txProvider);
    this.authSigner = new ethers.Wallet(config.contract.oracleKey);
    this.baseSigner = this.authSigner;
    this.contract = new ethers.Contract(config.contract.address, ABI, this.provider);
    this.network = await this._readWithRpcFallback((provider) => provider.getNetwork());
    this.chainId = Number(this.network.chainId);
    await this._initRedis();
    this.initialized = true;
    if (proxyUrl) {
      console.log(`[Contract] RPC proxy enabled via ${proxyUrl}`);
    }
    if (rpcUrls.length > 1) {
      console.log("[Contract] RPC read fallback enabled", rpcUrls);
    }
    if (rpcUrls[txProviderIndex]) {
      console.log("[Contract] RPC tx primary", rpcUrls[txProviderIndex]);
    }
    console.log("[Contract] signer roles", {
      owner: this.ownerSigner.address,
      executor: this.executorSigner.address,
      oracle: this.authSigner.address,
    });
    console.log("[Contract] Initialized");
  }

  async _readWithRpcFallback(fn) {
    let lastError = null;
    for (const provider of this.rpcProviders.length > 0 ? this.rpcProviders : [this.provider]) {
      try {
        return await fn(provider);
      } catch (error) {
        if (!isRpcTimeoutLike(error)) throw error;
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    throw new Error("RPC read failed");
  }

  isMockMode() {
    return !!this.mockMode;
  }

  _formatRpcError(action, error) {
    if (isNonceConflictLike(error)) {
      return new Error(`${action} relay is syncing another transaction. Please retry.`);
    }
    if (isRpcTimeoutLike(error)) {
      return new Error(`${action} timed out while waiting for Base Sepolia. Please retry.`);
    }
    return error instanceof Error ? error : new Error(`${action} failed`);
  }

  _signatureDomain() {
    return {
      name: "BtcPredictArena",
      version: "1",
      chainId: this.chainId,
      verifyingContract: config.contract.address,
    };
  }

  _signerForMethod(methodName) {
    const ownerOnlyMethods = new Set([
      "ownerCreateGame",
      "ownerCreateRoom",
      "ownerJoinGame",
      "ownerJoinRoom",
      "startGame",
      "settleGame",
      "cancelGame",
    ]);
    return ownerOnlyMethods.has(methodName) ? this.ownerSigner : this.executorSigner;
  }

  async _signStartGameAuth(gameId, basePrice) {
    const validUntil = Math.floor(Date.now() / 1000) + START_GAME_AUTH_WINDOW_SEC;
    const signature = await this.authSigner.signTypedData(
      this._signatureDomain(),
      START_GAME_AUTH_TYPES,
      { gameId, basePrice, validUntil },
    );
    return { validUntil, signature };
  }

  async buildStartGameAuth(gameId, basePrice) {
    if (!this.initialized) return null;
    return this._signStartGameAuth(gameId, basePrice);
  }

  buildPredictionBatchHash(predictionIntents = []) {
    const intents = Array.isArray(predictionIntents) ? predictionIntents : [];
    const players = intents.map((intent) => intent.player);
    const predictions = intents.map((intent) => (intent.prediction === "up" ? 1 : intent.prediction === "down" ? 2 : Number(intent.prediction)));
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return ethers.keccak256(coder.encode(["address[]", "uint8[]"], [players, predictions]));
  }

  async _signSettlementAuth(gameId, settlementPrice, resultRoot, totalPayout) {
    const validUntil = Math.floor(Date.now() / 1000) + SETTLEMENT_AUTH_WINDOW_SEC;
    const signature = await this.authSigner.signTypedData(
      this._signatureDomain(),
      SETTLEMENT_AUTH_TYPES,
      { gameId, settlementPrice, resultRoot, totalPayout, validUntil },
    );
    return { validUntil, signature };
  }

  async buildSettlementAuth(gameId, settlementPrice, resultRoot, totalPayout) {
    if (!this.initialized) return null;
    return this._signSettlementAuth(gameId, settlementPrice, resultRoot, totalPayout);
  }

  async buildPredictionReceiptAuth(gameId, player, prediction, deadline) {
    if (!this.initialized) return null;
    const predictionValue = prediction === "up" ? 1 : prediction === "down" ? 2 : Number(prediction);
    const signature = await this.authSigner.signTypedData(
      this._signatureDomain(),
      PREDICTION_RECEIPT_TYPES,
      { gameId, player, prediction: predictionValue, deadline },
    );
    return { signature };
  }

  async _initRedis() {
    if (!config.redis.url) return;
    const client = new Redis(config.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.on("error", (error) => {
      console.warn("[Contract] Redis error", error?.message || error);
    });
    try {
      await client.connect();
      this.redis = client;
      this.redisEnabled = true;
      console.log("[Contract] Distributed nonce queue enabled");
    } catch (error) {
      console.warn("[Contract] Redis unavailable, falling back to single-instance nonce manager", error?.message || error);
      this.redis = null;
      this.redisEnabled = false;
      try { client.disconnect(); } catch (_) {}
    }
  }

  _nonceLockKey(address) {
    return `predict-arena:contract:nonce-lock:${address.toLowerCase()}`;
  }

  _nonceCounterKey(address) {
    return `predict-arena:contract:nonce-next:${address.toLowerCase()}`;
  }

  _pgRelayLockKeys(address) {
    const normalized = address.toLowerCase().replace(/^0x/, "").padStart(40, "0");
    const toSignedInt = (hex) => {
      const value = parseInt(hex, 16);
      return value > 0x7fffffff ? value - 0x100000000 : value;
    };
    return {
      key1: toSignedInt(normalized.slice(0, 8)),
      key2: toSignedInt(normalized.slice(-8)),
    };
  }

  async _withDatabaseRelayLock(address, fn) {
    const client = await dbPool.connect();
    const { key1, key2 } = this._pgRelayLockKeys(address);
    try {
      await client.query("SELECT pg_advisory_lock($1, $2)", [key1, key2]);
      return await fn();
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1, $2)", [key1, key2]);
      } finally {
        client.release();
      }
    }
  }

  async _releaseNonceLock(lockToken, address) {
    if (!this.redisEnabled || !this.redis || !lockToken) return;
    try {
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        this._nonceLockKey(address),
        lockToken,
      );
    } catch (error) {
      console.warn("[Contract] Failed to release nonce lock", error?.message || error);
    }
  }

  async _withDistributedNonceLock(action, address, fn) {
    if (!this.redisEnabled || !this.redis) return fn();
    const lockToken = `${this.instanceId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const deadline = Date.now() + NONCE_LOCK_WAIT_MS;
    while (Date.now() < deadline) {
      let acquired = null;
      try {
        acquired = await this.redis.set(this._nonceLockKey(address), lockToken, "PX", NONCE_LOCK_TTL_MS, "NX");
      } catch (error) {
        console.warn("[Contract] Nonce lock attempt failed", error?.message || error);
        break;
      }
      if (acquired !== "OK") {
        await sleep(NONCE_LOCK_RETRY_MS);
        continue;
      }
      try {
        return await fn();
      } finally {
        await this._releaseNonceLock(lockToken, address);
      }
    }
    throw new Error(`${action} relay is busy. Please retry.`);
  }

  async _getNextDistributedNonce(signer) {
    const pendingNonce = await this._readWithRpcFallback((provider) =>
      provider.getTransactionCount(signer.address, "pending")
    );
    if (!this.redisEnabled || !this.redis) return pendingNonce;
    const storedRaw = await this.redis.get(this._nonceCounterKey(signer.address));
    if (storedRaw === null) return pendingNonce;
    const storedNonce = Number(storedRaw);
    return Number.isFinite(storedNonce) ? Math.max(storedNonce, pendingNonce) : pendingNonce;
  }

  async _setDistributedNonce(address, nextNonce) {
    if (!this.redisEnabled || !this.redis) return;
    await this.redis.set(this._nonceCounterKey(address), String(nextNonce));
  }

  async _buildRelayOverrides(methodName, txRequest, signerAddress) {
    const overrides = {};
    const fallbackGasLimit = RELAY_GAS_LIMITS[methodName] || null;
    try {
      if (txRequest) {
        const estimatedGas = await this._readWithRpcFallback((provider) =>
          provider.estimateGas({ ...txRequest, from: signerAddress })
        );
        const bufferedGasLimit = (estimatedGas * 12n) / 10n;
        overrides.gasLimit = fallbackGasLimit && fallbackGasLimit > bufferedGasLimit ? fallbackGasLimit : bufferedGasLimit;
      } else if (fallbackGasLimit) {
        overrides.gasLimit = fallbackGasLimit;
      }
    } catch (_) {
      if (fallbackGasLimit) {
        overrides.gasLimit = fallbackGasLimit;
      }
    }
    const now = Date.now();
    if (!this.feeCache || (now - this.feeCache.fetchedAt) > 2000) {
      const [feeData, feeHistory] = await Promise.all([
        this._readWithRpcFallback((provider) => provider.getFeeData()),
        this._readWithRpcFallback((provider) => provider.send("eth_feeHistory", ["0x5", "latest", [10, 25, 50]])).catch(() => null),
      ]);
      this.feeCache = { feeData, feeHistory, fetchedAt: now };
    }
    const feeData = this.feeCache.feeData;
    const feeHistory = this.feeCache.feeHistory;

    const feeHistoryBaseFees = Array.isArray(feeHistory?.baseFeePerGas)
      ? feeHistory.baseFeePerGas.map((value) => toBigIntOrNull(value)).filter((value) => value && value > 0n)
      : [];
    const feeHistoryRewards = Array.isArray(feeHistory?.reward)
      ? feeHistory.reward.flatMap((bucket) => Array.isArray(bucket) ? bucket.map((value) => toBigIntOrNull(value)) : [])
      : [];

    const baseGasPrice =
      toBigIntOrNull(feeData.lastBaseFeePerGas) ||
      (feeHistoryBaseFees.length > 0 ? feeHistoryBaseFees[feeHistoryBaseFees.length - 1] : null) ||
      toBigIntOrNull(feeData.gasPrice) ||
      0n;

    const historyPriority = medianBigInt(feeHistoryRewards);
    const providerPriority = toBigIntOrNull(feeData.maxPriorityFeePerGas);
    const suggestedPriority = historyPriority || providerPriority || baseGasPrice || RELAY_MIN_PRIORITY_FEE;
    const maxPriorityFeePerGas = clampBigInt(suggestedPriority, RELAY_MIN_PRIORITY_FEE, RELAY_MAX_PRIORITY_FEE);

    const dynamicMaxFee = (baseGasPrice > 0n ? (baseGasPrice * 2n) + maxPriorityFeePerGas : maxPriorityFeePerGas * 2n);
    const suggestedMaxFee = toBigIntOrNull(feeData.maxFeePerGas) || dynamicMaxFee;
    let maxFeePerGas = dynamicMaxFee;
    if (suggestedMaxFee > 0n && suggestedMaxFee < dynamicMaxFee) {
      maxFeePerGas = suggestedMaxFee;
    }
    maxFeePerGas = maxFeePerGas * (RELAY_MAX_FEE_MULTIPLIER > 0n ? RELAY_MAX_FEE_MULTIPLIER : 1n);
    if (maxFeePerGas <= maxPriorityFeePerGas) {
      maxFeePerGas = maxPriorityFeePerGas * 2n;
    }

    overrides.maxPriorityFeePerGas = maxPriorityFeePerGas;
    overrides.maxFeePerGas = maxFeePerGas;
    return overrides;
  }

  async _assertRelayBalance(action, request, signerAddress) {
    if (!request?.gasLimit || !request?.maxFeePerGas) return;
    const balance = await this._readWithRpcFallback((provider) =>
      provider.getBalance(signerAddress)
    );
    const required = request.gasLimit * request.maxFeePerGas;
    if (balance >= required) return;
    throw new Error(
      `${action} relay wallet is low on Base Sepolia ETH. ` +
      `Executor ${signerAddress} has ${formatEth(balance)} ETH, ` +
      `but this transaction may need about ${formatEth(required)} ETH for gas.`
    );
  }

  async _getTransactionCount(signer, blockTag = "pending") {
    try {
      return await this.txProvider.getTransactionCount(signer.address, blockTag);
    } catch (error) {
      if (!isRpcTimeoutLike(error)) throw error;
      return this._readWithRpcFallback((provider) =>
        provider.getTransactionCount(signer.address, blockTag)
      );
    }
  }

  async _broadcastSignedTransaction(signedTx) {
    const hash = ethers.Transaction.from(signedTx).hash;
    let lastError = null;

    for (const provider of this.rpcProviders.length > 0 ? this.rpcProviders : [this.txProvider || this.provider]) {
      try {
        const tx = await provider.broadcastTransaction(signedTx);
        return tx || { hash };
      } catch (error) {
        if (isAlreadyKnownLike(error)) {
          return { hash };
        }
        if (isRpcTimeoutLike(error)) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    if (lastError) {
      return { hash };
    }

    throw new Error("Broadcast failed");
  }

  async _simulateUintResult(methodName, args, signer) {
    const txRequest = await this.contract.getFunction(methodName).populateTransaction(...args);
    const raw = await this._readWithRpcFallback((provider) =>
      provider.call({ ...txRequest, from: signer.address })
    );
    const [value] = this.contract.interface.decodeFunctionResult(methodName, raw);
    return Number(value);
  }

  async _runRelaySequence(action, signer, fn) {
    const run = async () => {
      if (!this.redisEnabled || !this.redis) {
        return this._withDatabaseRelayLock(signer.address, fn);
      }
      return this._withDistributedNonceLock(action, signer.address, fn);
    };

    const queueKey = signer.address.toLowerCase();
    const currentQueue = this.relayQueues.get(queueKey) || Promise.resolve();
    const next = currentQueue.then(run, run);
    this.relayQueues.set(queueKey, next.catch(() => {}));
    return next;
  }

  async _sendContractTransaction(methodName, args, action) {
    const signer = this._signerForMethod(methodName);
    const txRequest = await this.contract.getFunction(methodName).populateTransaction(...args);
    const relayOverrides = await this._buildRelayOverrides(methodName, txRequest, signer.address);
    const request = { ...txRequest, ...relayOverrides };
    await this._assertRelayBalance(action, request, signer.address);
    if (!this.redisEnabled || !this.redis) {
      const deadline = Date.now() + RELAY_NONCE_SYNC_WAIT_MS;
      let attempt = 0;
      while (Date.now() < deadline) {
        const pendingNonce = await this._getTransactionCount(signer, "pending");
        const localNonce = this._localNonces.get(signer.address.toLowerCase());
        const nextNonce = localNonce != null && localNonce > pendingNonce
          ? localNonce : pendingNonce;
        try {
          const signedTx = await signer.signTransaction({
            ...request,
            chainId: this.chainId,
            type: 2,
            nonce: nextNonce,
          });
          const tx = await this._broadcastSignedTransaction(signedTx);
          this._localNonces.set(signer.address.toLowerCase(), nextNonce + 1);
          return tx;
        } catch (error) {
          if (isNonceConflictLike(error)) {
            this._localNonces.set(
              signer.address.toLowerCase(),
              Math.max((localNonce || 0), nextNonce + 1, pendingNonce),
            );
            attempt += 1;
            await sleep(RELAY_NONCE_RETRY_MS * attempt);
            continue;
          }
          throw error;
        }
      }
      throw new Error(`${action} relay is syncing another transaction. Please retry.`);
    }
    const deadline = Date.now() + RELAY_NONCE_SYNC_WAIT_MS;
    let attempt = 0;
    while (Date.now() < deadline) {
      const nextNonce = await this._getNextDistributedNonce(signer);
      try {
        const signedTx = await signer.signTransaction({
          ...request,
          chainId: this.chainId,
          type: 2,
          nonce: nextNonce,
        });
        const tx = await this._broadcastSignedTransaction(signedTx);
        await this._setDistributedNonce(signer.address, nextNonce + 1);
        return tx;
      } catch (error) {
        const pendingNonce = await this._getTransactionCount(signer, "pending").catch(() => nextNonce);
        if (isNonceConflictLike(error)) {
          await this._setDistributedNonce(signer.address, Math.max(nextNonce + 1, pendingNonce));
          attempt += 1;
          await sleep(RELAY_NONCE_RETRY_MS * attempt);
          continue;
        } else {
          await this._setDistributedNonce(signer.address, Math.max(pendingNonce, nextNonce));
        }
        throw error;
      }
    }
    throw new Error(`${action} relay is syncing another transaction. Please retry.`);
  }

  async _reserveRelayNonces(count, methodName) {
    if (!Number.isInteger(count) || count <= 0) throw new Error("Invalid nonce reservation");
    const signer = this._signerForMethod(methodName);
    if (!this.redisEnabled || !this.redis) {
      const pendingNonce = await this._getTransactionCount(signer, "pending");
      const localNonce = this._localNonces.get(signer.address.toLowerCase());
      const nextNonce = localNonce != null && localNonce > pendingNonce
        ? localNonce : pendingNonce;
      this._localNonces.set(signer.address.toLowerCase(), nextNonce + count);
      return nextNonce;
    }
    const nextNonce = await this._getNextDistributedNonce(signer);
    await this._setDistributedNonce(signer.address, nextNonce + count);
    return nextNonce;
  }

  async _sendContractTransactionAtNonce(methodName, args, nonce) {
    const signer = this._signerForMethod(methodName);
    const txRequest = await this.contract.getFunction(methodName).populateTransaction(...args);
    const relayOverrides = await this._buildRelayOverrides(methodName, txRequest, signer.address);
    await this._assertRelayBalance(methodName, { ...txRequest, ...relayOverrides }, signer.address);
    const signedTx = await signer.signTransaction({
      ...txRequest,
      ...relayOverrides,
      chainId: this.chainId,
      type: 2,
      nonce,
    });
    return this._broadcastSignedTransaction(signedTx);
  }

  _extractGameIdFromReceipt(receipt, { creator = null, inviteCode = null, isRoom = null } = {}) {
    for (const log of receipt?.logs || []) {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (!parsed || parsed.name !== "GameCreated") continue;
        if (creator && `${parsed.args.creator}`.toLowerCase() !== creator.toLowerCase()) continue;
        if (inviteCode !== null && parsed.args.inviteCode !== inviteCode) continue;
        if (isRoom !== null && Boolean(parsed.args.isRoom) !== Boolean(isRoom)) continue;
        return Number(parsed.args.gameId);
      } catch (_) {}
    }
    return null;
  }

  async _getReceiptFromAnyProvider(txHash) {
    let lastError = null;
    for (const provider of this.rpcProviders.length > 0 ? this.rpcProviders : [this.provider]) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) return receipt;
      } catch (error) {
        if (!isRpcTimeoutLike(error)) throw error;
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return null;
  }

  async _waitForReceipt(tx, label, options = {}) {
    if (!tx?.hash) throw new Error(`${label} transaction hash missing`);
    const confirmTimeoutMs = options.confirmTimeoutMs || TX_CONFIRM_TIMEOUT_MS;
    const recoveryTimeoutMs = options.recoveryTimeoutMs || TX_RECOVERY_TIMEOUT_MS;
    const signer = options.signer || this.executorSigner;
    try {
      const receipt = await this.provider.waitForTransaction(tx.hash, 1, confirmTimeoutMs);
      if (receipt) {
        if (receipt.status === 0) throw new Error(`${label} transaction reverted on-chain`);
        return receipt;
      }
    } catch (error) {
      if (!isRpcTimeoutLike(error)) throw error;
      console.warn(`[Contract] ${label} wait timed out`, { hash: tx.hash, error: error?.message || error });
    }

    const deadline = Date.now() + recoveryTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const receipt = await this._getReceiptFromAnyProvider(tx.hash);
        if (receipt) {
          if (receipt.status === 0) throw new Error(`${label} transaction reverted on-chain`);
          return receipt;
        }
      } catch (error) {
        if (!isRpcTimeoutLike(error)) throw error;
      }
      await sleep(TX_RECOVERY_POLL_MS);
    }

    // Tx was broadcast but never confirmed — reset nonce to chain state
    // to prevent nonce drift from dropped transactions
    try {
      const chainNonce = await this._getTransactionCount(signer, "pending");
      if (this.redisEnabled && this.redis) {
        await this._setDistributedNonce(signer.address, chainNonce);
      }
      this._localNonces.set(signer.address.toLowerCase(), chainNonce);
      console.warn(`[Contract] ${label} timed out, nonce reset to ${chainNonce}`);
    } catch (_) {}

    throw new Error(`${label} confirmation timed out. Please retry.`);
  }

  async _recoverRoomGameId(inviteCode, timeoutMs = TX_RECOVERY_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const gameId = await this._readWithRpcFallback((provider) =>
          this.contract.connect(provider).inviteCodeToGame(inviteCode)
        );
        if (gameId && gameId > 0n) return Number(gameId);
      } catch (error) {
        if (!isRpcTimeoutLike(error)) throw error;
      }
      await sleep(TX_RECOVERY_POLL_MS);
    }
    return null;
  }

  async recoverRoomGameId(inviteCode, timeoutMs = TX_RECOVERY_TIMEOUT_MS) {
    if (!this.initialized || !inviteCode) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const gameId = await this._readWithRpcFallback((provider) =>
          this.contract.connect(provider).inviteCodeToGame(inviteCode)
        );
        if (gameId && gameId > 0n) return Number(gameId);
      } catch (error) {
        if (!isRpcTimeoutLike(error)) throw error;
      }
      await sleep(TX_RECOVERY_POLL_MS);
    }
    return null;
  }

  async waitForRoomPaymentOpen(inviteCode, timeoutMs = TX_RECOVERY_TIMEOUT_MS) {
    if (!this.initialized || !inviteCode) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const gameId = await this.recoverRoomGameId(inviteCode, TX_RECOVERY_POLL_MS);
        if (gameId) {
          const state = await this.getGameState(gameId);
          if (state === 1) return gameId;
        }
      } catch (error) {
        if (!isRpcTimeoutLike(error)) throw error;
      }
      await sleep(TX_RECOVERY_POLL_MS);
    }
    return null;
  }

  async ownerCreateGame(maxPlayers, creator) {
    if (!this.initialized) return null;
    try {
      return await this._runRelaySequence("Create game", this.ownerSigner, async () => {
        const expectedGameId = await this._simulateUintResult("ownerCreateGame", [maxPlayers, creator], this.ownerSigner).catch(() => null);
        const tx = await this._sendContractTransaction("ownerCreateGame", [maxPlayers, creator], "Create game");
        const receipt = await this._waitForReceipt(tx, "Create game", { signer: this.ownerSigner });
        const gameId = this._extractGameIdFromReceipt(receipt, { creator, isRoom: false }) || expectedGameId;
        if (gameId) return gameId;
        throw new Error("Create game confirmed but game id could not be resolved");
      });
    } catch (error) {
      throw this._formatRpcError("Create game", error);
    }
  }

  async ownerCreateRoom(maxPlayers, inviteCode, creator, options = {}) {
    if (!this.initialized) { console.warn("[Contract] ownerCreateRoom skipped: not initialized"); return null; }
    console.log("[Contract] ownerCreateRoom starting", { inviteCode, creator });
    try {
      return await this._runRelaySequence("Create room", this.ownerSigner, async () => {
        console.log("[Contract] ownerCreateRoom relay lock acquired", { inviteCode });
        const expectedGameId = await this._simulateUintResult("ownerCreateRoom", [maxPlayers, inviteCode, creator], this.ownerSigner).catch(() => null);
        console.log("[Contract] ownerCreateRoom sending tx", { inviteCode, expectedGameId });
        const tx = await this._sendContractTransaction("ownerCreateRoom", [maxPlayers, inviteCode, creator], "Create room");
        const receipt = await this._waitForReceipt(tx, "Create room", { ...options, signer: this.ownerSigner });
        const gameId =
          this._extractGameIdFromReceipt(receipt, { creator, inviteCode, isRoom: true }) ||
          expectedGameId ||
          await this._recoverRoomGameId(inviteCode, options.recoveryTimeoutMs);
        if (gameId) return gameId;
        throw new Error("Create room confirmed but game id could not be resolved");
      });
    } catch (error) {
      if (isRpcTimeoutLike(error)) {
        const recoveredGameId = await this._recoverRoomGameId(inviteCode, options.recoveryTimeoutMs);
        if (recoveredGameId) return recoveredGameId;
      }
      throw this._formatRpcError("Create room", error);
    }
  }

  async ownerJoinGame(gameId, player) {
    if (!this.initialized) return;
    await this._runRelaySequence("Join game", this.ownerSigner, async () => {
      const tx = await this._sendContractTransaction("ownerJoinGame", [gameId, player], "Join game");
      await this._waitForReceipt(tx, "Join game", { signer: this.ownerSigner });
    });
  }

  async ownerJoinRoom(inviteCode, player, options = {}) {
    if (!this.initialized) return;
    await this._runRelaySequence("Join room", this.ownerSigner, async () => {
      const tx = await this._sendContractTransaction("ownerJoinRoom", [inviteCode, player], "Join room");
      await this._waitForReceipt(tx, "Join room", { ...options, signer: this.ownerSigner });
    });
  }

  async prepareRoomPayment(inviteCode, maxPlayers, owner, players, options = {}) {
    if (!this.initialized) return null;
    const allPlayers = Array.isArray(players) ? players : [];
    const nonOwners = allPlayers.filter((player) => player && player.toLowerCase() !== owner?.toLowerCase());
    const timeoutMs = options.timeoutMs || TX_CONFIRM_TIMEOUT_MS;
    try {
      return await this._runRelaySequence("Prepare room", this.ownerSigner, async () => {
        const startNonce = await this._reserveRelayNonces(1 + nonOwners.length, "ownerCreateRoom");
        await this._sendContractTransactionAtNonce("ownerCreateRoom", [maxPlayers, inviteCode, owner], startNonce);
        for (let i = 0; i < nonOwners.length; i += 1) {
          await this._sendContractTransactionAtNonce("ownerJoinRoom", [inviteCode, nonOwners[i]], startNonce + 1 + i);
        }
        const gameId = await this.waitForRoomPaymentOpen(inviteCode, timeoutMs);
        if (!gameId) throw new Error("Prepare room confirmation timed out. Please retry.");
        return gameId;
      });
    } catch (error) {
      throw this._formatRpcError("Prepare room", error);
    }
  }

  async isPlayerPaid(gameId, wallet) {
    if (!this.initialized) return true;
    const [, hasPaid] = await this._readWithRpcFallback((provider) =>
      this.contract.connect(provider).getPlayerPrediction(gameId, wallet)
    );
    return !!hasPaid;
  }

  async allPlayersPaid(gameId) {
    if (!this.initialized) return true;
    return !!(await this._readWithRpcFallback((provider) =>
      this.contract.connect(provider).allPlayersPaid(gameId)
    ));
  }

  async getGameState(gameId) {
    if (!this.initialized) return null;
    const [, , state] = await this._readWithRpcFallback((provider) =>
      this.contract.connect(provider).getGameInfo(gameId)
    );
    return Number(state);
  }

  async getGameInfo(gameId) {
    if (!this.initialized) return null;
    const [id, maxPlayers, state, playerCount, basePrice, settlementPrice, isRoom, inviteCode] =
      await this._readWithRpcFallback((provider) =>
        this.contract.connect(provider).getGameInfo(gameId)
      );
    return {
      gameId: Number(id),
      maxPlayers: Number(maxPlayers),
      state: Number(state),
      playerCount: Number(playerCount),
      basePrice: Number(basePrice),
      settlementPrice: Number(settlementPrice),
      isRoom: !!isRoom,
      inviteCode,
    };
  }

  async getPredictionDeadline(gameId) {
    if (!this.initialized) return null;
    const deadline = await this._readWithRpcFallback((provider) =>
      this.contract.connect(provider).predictionDeadline(gameId)
    );
    return Number(deadline);
  }

  async getPaymentDeadline(gameId) {
    if (!this.initialized) return null;
    const deadline = await this._readWithRpcFallback((provider) =>
      this.contract.connect(provider).paymentDeadlineAt(gameId)
    );
    return Number(deadline);
  }

  async _recoverStartedGame(gameId, timeoutMs = TX_RECOVERY_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const [predictionDeadline, state] = await Promise.all([
          this._readWithRpcFallback((provider) =>
            this.contract.connect(provider).predictionDeadline(gameId)
          ),
          this._readWithRpcFallback((provider) =>
            this.contract.connect(provider).getGameInfo(gameId)
          ).then((result) => Number(result?.[2] ?? 0)),
        ]);
        if (state === 2 && predictionDeadline && predictionDeadline > 0n) {
          return Number(predictionDeadline);
        }
      } catch (error) {
        if (!isRpcTimeoutLike(error)) throw error;
      }
      await sleep(TX_RECOVERY_POLL_MS);
    }
    return null;
  }

  async recoverStartedGame(gameId, timeoutMs = TX_RECOVERY_TIMEOUT_MS) {
    if (!this.initialized) return null;
    return this._recoverStartedGame(gameId, timeoutMs);
  }

  async recoverSettledGame(gameId, timeoutMs = TX_RECOVERY_TIMEOUT_MS) {
    if (!this.initialized) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const info = await this.getGameInfo(gameId);
        if (info?.state === 3 && Number(info?.settlementPrice || 0) > 0) {
          return info;
        }
      } catch (error) {
        if (!isRpcTimeoutLike(error)) throw error;
      }
      await sleep(TX_RECOVERY_POLL_MS);
    }
    return null;
  }

  async getPlayerPrediction(gameId, wallet) {
    if (!this.initialized) {
      return {
        prediction: 0,
        hasPaid: true,
        reward: 0,
        claimed: false,
      };
    }
    const [prediction, hasPaid, reward, claimed] = await this._readWithRpcFallback((provider) =>
      this.contract.connect(provider).getPlayerPrediction(gameId, wallet)
    );
    return {
      prediction: Number(prediction),
      hasPaid: !!hasPaid,
      reward: Number(reward),
      claimed: !!claimed,
    };
  }

  async startGame(id, price) {
    if (!this.initialized) return null;
    try {
      const auth = await this._signStartGameAuth(id, price);
      await this._runRelaySequence("Start game", this.executorSigner, async () => {
        const tx = await this._sendContractTransaction("startGameWithAuth", [id, price, auth.validUntil, auth.signature], "Start game");
        await this._waitForReceipt(tx, "Start game", { signer: this.executorSigner });
      });
      const deadline = await this._readWithRpcFallback((provider) =>
        this.contract.connect(provider).predictionDeadline(id)
      );
      return Number(deadline);
    } catch (error) {
      if (isRpcTimeoutLike(error)) {
        const recoveredDeadline = await this._recoverStartedGame(id);
        if (recoveredDeadline) return recoveredDeadline;
      }
      throw this._formatRpcError("Start game", error);
    }
  }
  async submitPredictionBySig(id, player, prediction, deadline, signature) {
    if (!this.initialized) return;
    const value = prediction === "up" ? 1 : prediction === "down" ? 2 : Number(prediction);
    await this._runRelaySequence("Submit prediction", this.executorSigner, async () => {
      const tx = await this._sendContractTransaction("submitPredictionBySig", [id, player, value, deadline, signature], "Submit prediction");
      await this._waitForReceipt(tx, "Submit prediction", { signer: this.executorSigner });
    });
  }

  async submitPredictionsBatch(id, intents = []) {
    if (!this.initialized || !Array.isArray(intents) || intents.length === 0) return;
    const players = intents.map((intent) => intent.player);
    const predictions = intents.map((intent) => (intent.prediction === "up" ? 1 : intent.prediction === "down" ? 2 : Number(intent.prediction)));
    const deadlines = intents.map((intent) => Number(intent.deadline));
    const signatures = intents.map((intent) => intent.signature);
    await this._runRelaySequence("Submit predictions", this.executorSigner, async () => {
      const tx = await this._sendContractTransaction(
        "submitPredictionsBySigBatch",
        [id, players, predictions, deadlines, signatures],
        "Submit predictions",
      );
      await this._waitForReceipt(tx, "Submit predictions", { signer: this.executorSigner });
    });
  }

  async settleGame(id, price, resultRoot, totalPayout) {
    if (!this.initialized) return null;
    const auth = await this._signSettlementAuth(id, price, resultRoot, totalPayout);
    try {
      await this._runRelaySequence("Settle game", this.executorSigner, async () => {
        const tx = await this._sendContractTransaction(
          "settleGameWithAuth",
          [id, price, resultRoot, totalPayout, auth.validUntil, auth.signature],
          "Settle game",
        );
        await this._waitForReceipt(tx, "Settle game", { signer: this.executorSigner });
      });
      return this.getGameInfo(id);
    } catch (error) {
      if (isRpcTimeoutLike(error)) {
        const recovered = await this.recoverSettledGame(id);
        if (recovered) return recovered;
      }
      throw this._formatRpcError("Settle game", error);
    }
  }
  async cancelGame(id, options = {}) {
    if (!this.initialized) return;
    const expiredOnly = !!options.expiredOnly;
    const methodName = expiredOnly ? "cancelExpiredGame" : "cancelGame";
    const signer = expiredOnly ? this.executorSigner : this.ownerSigner;
    await this._runRelaySequence("Cancel game", signer, async () => {
      const tx = await this._sendContractTransaction(methodName, [id], "Cancel game");
      await this._waitForReceipt(tx, "Cancel game", { signer });
    });
  }
}

export default new ContractService();
