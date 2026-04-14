import { ethers } from "ethers";
import config from "../config/index.js";

const ABI = [
  "function ownerCreateGame(uint8, address) external returns (uint256)",
  "function ownerCreateRoom(uint8, string, address) external returns (uint256)",
  "function ownerJoinGame(uint256, address) external",
  "function ownerJoinRoom(string, address) external",
  "function startGame(uint256, uint256) external",
  "function settleGame(uint256, uint256) external",
  "function cancelGame(uint256) external",
  "function allPlayersPaid(uint256) external view returns (bool)",
  "function getPlayerPrediction(uint256, address) external view returns (uint8,bool,uint256,bool)",
  "function getGameInfo(uint256) external view returns (uint256,uint8,uint8,uint256,uint256,uint256,bool,string)",
  "event GameCreated(uint256 indexed gameId, uint8 maxPlayers, bool isRoom, string inviteCode, address creator)",
];

class ContractService {
  constructor() { this.initialized = false; }

  init() {
    if (!config.rpc.url || !config.contract.address || !config.contract.oracleKey) {
      console.warn("[Contract] Missing config, mock mode");
      return;
    }
    this.provider = new ethers.JsonRpcProvider(config.rpc.url);
    this.wallet = new ethers.Wallet(config.contract.oracleKey, this.provider);
    this.contract = new ethers.Contract(config.contract.address, ABI, this.wallet);
    this.initialized = true;
    console.log("[Contract] Initialized");
  }

  async ownerCreateGame(maxPlayers, creator) {
    if (!this.initialized) return null;
    const gameId = await this.contract.ownerCreateGame.staticCall(maxPlayers, creator);
    await (await this.contract.ownerCreateGame(maxPlayers, creator)).wait();
    return Number(gameId);
  }

  async ownerCreateRoom(maxPlayers, inviteCode, creator) {
    if (!this.initialized) return null;
    const gameId = await this.contract.ownerCreateRoom.staticCall(maxPlayers, inviteCode, creator);
    await (await this.contract.ownerCreateRoom(maxPlayers, inviteCode, creator)).wait();
    return Number(gameId);
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

  async startGame(id, price) { if (!this.initialized) return; await (await this.contract.startGame(id, price)).wait(); }
  async settleGame(id, price) { if (!this.initialized) return; await (await this.contract.settleGame(id, price)).wait(); }
  async cancelGame(id) { if (!this.initialized) return; await (await this.contract.cancelGame(id)).wait(); }
}

export default new ContractService();
