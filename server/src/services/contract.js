import { ethers } from "ethers";
import config from "../config/index.js";
import { createRpcFetchRequest, proxyUrl } from "../utils/network.js";

const TX_CONFIRM_TIMEOUT_MS = parseInt(process.env.CONTRACT_TX_CONFIRM_TIMEOUT_MS || "45000", 10);
const TX_RECOVERY_TIMEOUT_MS = parseInt(process.env.CONTRACT_TX_RECOVERY_TIMEOUT_MS || "15000", 10);
const TX_RECOVERY_POLL_MS = 2000;

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
  const message = `${error?.message || ""}`.toLowerCase();
  return (
    error?.code === "TIMEOUT" ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("network error")
  );
};

class ContractService {
  constructor() { this.initialized = false; }

  init() {
    if (!config.rpc.url || !config.contract.address || !config.contract.oracleKey) {
      console.warn("[Contract] Missing config, mock mode");
      return;
    }
    this.provider = new ethers.JsonRpcProvider(createRpcFetchRequest(config.rpc.url));
    this.wallet = new ethers.Wallet(config.contract.oracleKey, this.provider);
    this.contract = new ethers.Contract(config.contract.address, ABI, this.wallet);
    this.initialized = true;
    if (proxyUrl) {
      console.log(`[Contract] RPC proxy enabled via ${proxyUrl}`);
    }
    console.log("[Contract] Initialized");
  }

  _formatRpcError(action, error) {
    if (isRpcTimeoutLike(error)) {
      return new Error(`${action} timed out while waiting for Base Sepolia. Please retry.`);
    }
    return error instanceof Error ? error : new Error(`${action} failed`);
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

  async _waitForReceipt(tx, label) {
    if (!tx?.hash) throw new Error(`${label} transaction hash missing`);
    try {
      const receipt = await this.provider.waitForTransaction(tx.hash, 1, TX_CONFIRM_TIMEOUT_MS);
      if (receipt) return receipt;
    } catch (error) {
      if (!isRpcTimeoutLike(error)) throw error;
      console.warn(`[Contract] ${label} wait timed out`, { hash: tx.hash, error: error?.message || error });
    }

    const deadline = Date.now() + TX_RECOVERY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const receipt = await this.provider.getTransactionReceipt(tx.hash);
        if (receipt) return receipt;
      } catch (error) {
        if (!isRpcTimeoutLike(error)) throw error;
      }
      await sleep(TX_RECOVERY_POLL_MS);
    }

    throw new Error(`${label} confirmation timed out. Please retry.`);
  }

  async _recoverRoomGameId(inviteCode) {
    const deadline = Date.now() + TX_RECOVERY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const gameId = await this.contract.inviteCodeToGame(inviteCode);
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
      const tx = await this.contract.ownerCreateGame(maxPlayers, creator);
      const receipt = await this._waitForReceipt(tx, "Create game");
      const gameId = this._extractGameIdFromReceipt(receipt, { creator, isRoom: false });
      if (gameId) return gameId;
      throw new Error("Create game confirmed but game id could not be resolved");
    } catch (error) {
      throw this._formatRpcError("Create game", error);
    }
  }

  async ownerCreateRoom(maxPlayers, inviteCode, creator) {
    if (!this.initialized) return null;
    try {
      const tx = await this.contract.ownerCreateRoom(maxPlayers, inviteCode, creator);
      const receipt = await this._waitForReceipt(tx, "Create room");
      const gameId =
        this._extractGameIdFromReceipt(receipt, { creator, inviteCode, isRoom: true }) ||
        await this._recoverRoomGameId(inviteCode);
      if (gameId) return gameId;
      throw new Error("Create room confirmed but game id could not be resolved");
    } catch (error) {
      if (isRpcTimeoutLike(error)) {
        const recoveredGameId = await this._recoverRoomGameId(inviteCode);
        if (recoveredGameId) return recoveredGameId;
      }
      throw this._formatRpcError("Create room", error);
    }
  }

  async ownerJoinGame(gameId, player) {
    if (!this.initialized) return;
    await (await this.contract.ownerJoinGame(gameId, player)).wait();
  }

  async ownerJoinRoom(inviteCode, player) {
    if (!this.initialized) return;
    await (await this.contract.ownerJoinRoom(inviteCode, player)).wait();
  }

  async isPlayerPaid(gameId, wallet) {
    if (!this.initialized) return false;
    const [, hasPaid] = await this.contract.getPlayerPrediction(gameId, wallet);
    return !!hasPaid;
  }

  async allPlayersPaid(gameId) {
    if (!this.initialized) return false;
    return !!(await this.contract.allPlayersPaid(gameId));
  }

  async getGameState(gameId) {
    if (!this.initialized) return null;
    const [, , state] = await this.contract.getGameInfo(gameId);
    return Number(state);
  }

  async getPredictionDeadline(gameId) {
    if (!this.initialized) return null;
    const deadline = await this.contract.predictionDeadline(gameId);
    return Number(deadline);
  }

  async getPlayerPrediction(gameId, wallet) {
    if (!this.initialized) return null;
    const [prediction, hasPaid, reward, claimed] = await this.contract.getPlayerPrediction(gameId, wallet);
    return {
      prediction: Number(prediction),
      hasPaid: !!hasPaid,
      reward: Number(reward),
      claimed: !!claimed,
    };
  }

  async startGame(id, price) {
    if (!this.initialized) return null;
    await (await this.contract.startGame(id, price)).wait();
    const deadline = await this.contract.predictionDeadline(id);
    return Number(deadline);
  }
  async submitPredictionBySig(id, player, prediction, deadline, signature) {
    if (!this.initialized) return;
    const value = prediction === "up" ? 1 : prediction === "down" ? 2 : Number(prediction);
    await (await this.contract.submitPredictionBySig(id, player, value, deadline, signature)).wait();
  }
  async settleGame(id, price) { if (!this.initialized) return; await (await this.contract.settleGame(id, price)).wait(); }
  async cancelGame(id) { if (!this.initialized) return; await (await this.contract.cancelGame(id)).wait(); }
}

export default new ContractService();
