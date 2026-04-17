import { ethers } from "ethers";
import Redis from "ioredis";
import config from "../config/index.js";
import { createRpcFetchRequest, proxyUrl } from "../utils/network.js";
import dbPool from "../config/database.js";

const TX_CONFIRM_TIMEOUT_MS = parseInt(process.env.CONTRACT_TX_CONFIRM_TIMEOUT_MS || "90000", 10);
const TX_RECOVERY_TIMEOUT_MS = parseInt(process.env.CONTRACT_TX_RECOVERY_TIMEOUT_MS || "60000", 10);
const TX_RECOVERY_POLL_MS = 2000;
const NONCE_LOCK_WAIT_MS = parseInt(process.env.CONTRACT_NONCE_LOCK_WAIT_MS || "30000", 10);
const NONCE_LOCK_TTL_MS = parseInt(process.env.CONTRACT_NONCE_LOCK_TTL_MS || "15000", 10);
const NONCE_LOCK_RETRY_MS = parseInt(process.env.CONTRACT_NONCE_LOCK_RETRY_MS || "150", 10);
const RELAY_NONCE_SYNC_WAIT_MS = parseInt(process.env.CONTRACT_NONCE_SYNC_WAIT_MS || "20000", 10);
const RELAY_NONCE_RETRY_MS = parseInt(process.env.CONTRACT_NONCE_RETRY_MS || "400", 10);
const RELAY_MIN_PRIORITY_FEE = ethers.parseUnits(process.env.CONTRACT_RELAY_MIN_PRIORITY_GWEI || "3", "gwei");
const RELAY_MAX_FEE_MULTIPLIER = BigInt(parseInt(process.env.CONTRACT_RELAY_MAX_FEE_MULTIPLIER || "4", 10));
const DEFAULT_BASE_SEPOLIA_RPC_FALLBACKS = [
  "https://sepolia.base.org",
];

const RELAY_GAS_LIMITS = {
  ownerCreateGame: 220000n,
  ownerCreateRoom: 260000n,
  ownerJoinGame: 150000n,
  ownerJoinRoom: 150000n,
  startGame: 180000n,
  submitPredictionBySig: 180000n,
  settleGame: 320000n,
  cancelGame: 320000n,
};

const ABI = [
  "function ownerCreateGame(uint8, address) external returns (uint256)",
  "function ownerCreateRoom(uint8, string, address) external returns (uint256)",
  "function ownerJoinGame(uint256, address) external",
  "function ownerJoinRoom(string, address) external",
  "function startGame(uint256, uint256) external",
  "function submitPredictionBySig(uint256, address, uint8, uint256, bytes) external",
  "function settleGame(uint256, uint256) external",
  "function cancelGame(uint256) external",
  "function allPlayersPaid(uint256) external view returns (bool)",
  "function inviteCodeToGame(string) external view returns (uint256)",
  "function predictionDeadline(uint256) external view returns (uint256)",
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

class ContractService {
  constructor() {
    this.initialized = false;
    this.mockMode = config.contract.mockMode;
    this.redis = null;
    this.redisEnabled = false;
    this.instanceId = `${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
    this.feeCache = null;
    this.relayQueue = Promise.resolve();
    this._localNonce = null;
    this.rpcProviders = [];
  }

  async init() {
    if (this.mockMode) {
      console.warn("[Contract] Local chain mock enabled");
      return;
    }
    if (!config.rpc.url || !config.contract.address || !config.contract.oracleKey) {
      console.warn("[Contract] Missing config, mock mode");
      this.mockMode = true;
      return;
    }
    const rpcUrls = buildRpcUrls(config.rpc.url);
    this.rpcProviders = rpcUrls.map((url) => new ethers.JsonRpcProvider(createRpcFetchRequest(url)));
    this.txProvider = this.rpcProviders[0];
    this.provider = this.txProvider;
    this.baseSigner = new ethers.Wallet(config.contract.oracleKey, this.txProvider);
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

  _nonceLockKey() {
    return `predict-arena:contract:nonce-lock:${this.baseSigner.address.toLowerCase()}`;
  }

  _nonceCounterKey() {
    return `predict-arena:contract:nonce-next:${this.baseSigner.address.toLowerCase()}`;
  }

  _pgRelayLockKeys() {
    const normalized = this.baseSigner.address.toLowerCase().replace(/^0x/, "").padStart(40, "0");
    const toSignedInt = (hex) => {
      const value = parseInt(hex, 16);
      return value > 0x7fffffff ? value - 0x100000000 : value;
    };
    return {
      key1: toSignedInt(normalized.slice(0, 8)),
      key2: toSignedInt(normalized.slice(-8)),
    };
  }

  async _withDatabaseRelayLock(fn) {
    const client = await dbPool.connect();
    const { key1, key2 } = this._pgRelayLockKeys();
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

  async _releaseNonceLock(lockToken) {
    if (!this.redisEnabled || !this.redis || !lockToken) return;
    try {
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        this._nonceLockKey(),
        lockToken,
      );
    } catch (error) {
      console.warn("[Contract] Failed to release nonce lock", error?.message || error);
    }
  }

  async _withDistributedNonceLock(action, fn) {
    if (!this.redisEnabled || !this.redis) return fn();
    const lockToken = `${this.instanceId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const deadline = Date.now() + NONCE_LOCK_WAIT_MS;
    while (Date.now() < deadline) {
      let acquired = null;
      try {
        acquired = await this.redis.set(this._nonceLockKey(), lockToken, "PX", NONCE_LOCK_TTL_MS, "NX");
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
        await this._releaseNonceLock(lockToken);
      }
    }
    throw new Error(`${action} relay is busy. Please retry.`);
  }

  async _getNextDistributedNonce() {
    const pendingNonce = await this._readWithRpcFallback((provider) =>
      provider.getTransactionCount(this.baseSigner.address, "pending")
    );
    if (!this.redisEnabled || !this.redis) return pendingNonce;
    const storedRaw = await this.redis.get(this._nonceCounterKey());
    if (storedRaw === null) return pendingNonce;
    const storedNonce = Number(storedRaw);
    return Number.isFinite(storedNonce) ? Math.max(storedNonce, pendingNonce) : pendingNonce;
  }

  async _setDistributedNonce(nextNonce) {
    if (!this.redisEnabled || !this.redis) return;
    await this.redis.set(this._nonceCounterKey(), String(nextNonce));
  }

  async _buildRelayOverrides(methodName, txRequest) {
    const overrides = {};
    const fallbackGasLimit = RELAY_GAS_LIMITS[methodName] || null;
    try {
      if (txRequest) {
        const estimatedGas = await this._readWithRpcFallback((provider) =>
          provider.estimateGas({ ...txRequest, from: this.baseSigner.address })
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
      const feeData = await this._readWithRpcFallback((provider) => provider.getFeeData());
      this.feeCache = { feeData, fetchedAt: now };
    }
    const feeData = this.feeCache.feeData;
    const baseGasPrice = feeData.gasPrice || 0n;
    const suggestedPriority = feeData.maxPriorityFeePerGas || baseGasPrice || RELAY_MIN_PRIORITY_FEE;
    let maxPriorityFeePerGas = suggestedPriority > RELAY_MIN_PRIORITY_FEE ? suggestedPriority : RELAY_MIN_PRIORITY_FEE;
    const suggestedMaxFee = feeData.maxFeePerGas || (baseGasPrice > 0n ? baseGasPrice * 2n : maxPriorityFeePerGas * 2n);
    let maxFeePerGas = suggestedMaxFee * (RELAY_MAX_FEE_MULTIPLIER > 0n ? RELAY_MAX_FEE_MULTIPLIER : 1n);
    if (maxFeePerGas <= maxPriorityFeePerGas) {
      maxFeePerGas = maxPriorityFeePerGas * 2n;
    }

    if (overrides.gasLimit) {
      const balance = await this._readWithRpcFallback((provider) =>
        provider.getBalance(this.baseSigner.address)
      );
      const affordableMaxFee = balance > 0n ? (balance * 95n) / (overrides.gasLimit * 100n) : 0n;
      if (affordableMaxFee > 0n && maxFeePerGas > affordableMaxFee) {
        maxFeePerGas = affordableMaxFee;
      }
      if (affordableMaxFee > 0n && maxPriorityFeePerGas > maxFeePerGas) {
        maxPriorityFeePerGas = maxFeePerGas;
      }
    }

    overrides.maxPriorityFeePerGas = maxPriorityFeePerGas;
    overrides.maxFeePerGas = maxFeePerGas;
    return overrides;
  }

  async _getTransactionCount(blockTag = "pending") {
    try {
      return await this.txProvider.getTransactionCount(this.baseSigner.address, blockTag);
    } catch (error) {
      if (!isRpcTimeoutLike(error)) throw error;
      return this._readWithRpcFallback((provider) =>
        provider.getTransactionCount(this.baseSigner.address, blockTag)
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

  async _simulateUintResult(methodName, args) {
    const txRequest = await this.contract.getFunction(methodName).populateTransaction(...args);
    const raw = await this._readWithRpcFallback((provider) =>
      provider.call({ ...txRequest, from: this.baseSigner.address })
    );
    const [value] = this.contract.interface.decodeFunctionResult(methodName, raw);
    return Number(value);
  }

  async _runRelaySequence(action, fn) {
    const run = async () => {
      if (!this.redisEnabled || !this.redis) {
        return this._withDatabaseRelayLock(fn);
      }
      return this._withDistributedNonceLock(action, fn);
    };

    const next = this.relayQueue.then(run, run);
    this.relayQueue = next.catch(() => {});
    return next;
  }

  async _sendContractTransaction(methodName, args, action) {
    const txRequest = await this.contract.getFunction(methodName).populateTransaction(...args);
    const relayOverrides = await this._buildRelayOverrides(methodName, txRequest);
    const request = { ...txRequest, ...relayOverrides };
    if (!this.redisEnabled || !this.redis) {
      const deadline = Date.now() + RELAY_NONCE_SYNC_WAIT_MS;
      let attempt = 0;
      while (Date.now() < deadline) {
        const pendingNonce = await this._getTransactionCount("pending");
        const nextNonce = this._localNonce != null && this._localNonce > pendingNonce
          ? this._localNonce : pendingNonce;
        try {
          const signedTx = await this.baseSigner.signTransaction({
            ...request,
            chainId: this.chainId,
            type: 2,
            nonce: nextNonce,
          });
          const tx = await this._broadcastSignedTransaction(signedTx);
          this._localNonce = nextNonce + 1;
          return tx;
        } catch (error) {
          if (isNonceConflictLike(error)) {
            this._localNonce = Math.max((this._localNonce || 0), nextNonce + 1, pendingNonce);
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
      const nextNonce = await this._getNextDistributedNonce();
      try {
        const signedTx = await this.baseSigner.signTransaction({
          ...request,
          chainId: this.chainId,
          type: 2,
          nonce: nextNonce,
        });
        const tx = await this._broadcastSignedTransaction(signedTx);
        await this._setDistributedNonce(nextNonce + 1);
        return tx;
      } catch (error) {
        const pendingNonce = await this._getTransactionCount("pending").catch(() => nextNonce);
        if (isNonceConflictLike(error)) {
          await this._setDistributedNonce(Math.max(nextNonce + 1, pendingNonce));
          attempt += 1;
          await sleep(RELAY_NONCE_RETRY_MS * attempt);
          continue;
        } else {
          await this._setDistributedNonce(Math.max(pendingNonce, nextNonce));
        }
        throw error;
      }
    }
    throw new Error(`${action} relay is syncing another transaction. Please retry.`);
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
      const chainNonce = await this._getTransactionCount("pending");
      if (this.redisEnabled && this.redis) {
        await this._setDistributedNonce(chainNonce);
      }
      this._localNonce = chainNonce;
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

  async ownerCreateGame(maxPlayers, creator) {
    if (!this.initialized) return null;
    try {
      return await this._runRelaySequence("Create game", async () => {
        const expectedGameId = await this._simulateUintResult("ownerCreateGame", [maxPlayers, creator]).catch(() => null);
        const tx = await this._sendContractTransaction("ownerCreateGame", [maxPlayers, creator], "Create game");
        const receipt = await this._waitForReceipt(tx, "Create game");
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
      return await this._runRelaySequence("Create room", async () => {
        console.log("[Contract] ownerCreateRoom relay lock acquired", { inviteCode });
        const expectedGameId = await this._simulateUintResult("ownerCreateRoom", [maxPlayers, inviteCode, creator]).catch(() => null);
        console.log("[Contract] ownerCreateRoom sending tx", { inviteCode, expectedGameId });
        const tx = await this._sendContractTransaction("ownerCreateRoom", [maxPlayers, inviteCode, creator], "Create room");
        const receipt = await this._waitForReceipt(tx, "Create room", options);
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
    await this._runRelaySequence("Join game", async () => {
      const tx = await this._sendContractTransaction("ownerJoinGame", [gameId, player], "Join game");
      await this._waitForReceipt(tx, "Join game");
    });
  }

  async ownerJoinRoom(inviteCode, player, options = {}) {
    if (!this.initialized) return;
    await this._runRelaySequence("Join room", async () => {
      const tx = await this._sendContractTransaction("ownerJoinRoom", [inviteCode, player], "Join room");
      await this._waitForReceipt(tx, "Join room", options);
    });
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

  async getPredictionDeadline(gameId) {
    if (!this.initialized) return null;
    const deadline = await this._readWithRpcFallback((provider) =>
      this.contract.connect(provider).predictionDeadline(gameId)
    );
    return Number(deadline);
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
    await this._runRelaySequence("Start game", async () => {
      const tx = await this._sendContractTransaction("startGame", [id, price], "Start game");
      await this._waitForReceipt(tx, "Start game");
    });
    const deadline = await this._readWithRpcFallback((provider) =>
      this.contract.connect(provider).predictionDeadline(id)
    );
    return Number(deadline);
  }
  async submitPredictionBySig(id, player, prediction, deadline, signature) {
    if (!this.initialized) return;
    const value = prediction === "up" ? 1 : prediction === "down" ? 2 : Number(prediction);
    await this._runRelaySequence("Submit prediction", async () => {
      const tx = await this._sendContractTransaction("submitPredictionBySig", [id, player, value, deadline, signature], "Submit prediction");
      await this._waitForReceipt(tx, "Submit prediction");
    });
  }
  async settleGame(id, price) {
    if (!this.initialized) return;
    await this._runRelaySequence("Settle game", async () => {
      const tx = await this._sendContractTransaction("settleGame", [id, price], "Settle game");
      await this._waitForReceipt(tx, "Settle game");
    });
  }
  async cancelGame(id) {
    if (!this.initialized) return;
    await this._runRelaySequence("Cancel game", async () => {
      const tx = await this._sendContractTransaction("cancelGame", [id], "Cancel game");
      await this._waitForReceipt(tx, "Cancel game");
    });
  }
}

export default new ContractService();
