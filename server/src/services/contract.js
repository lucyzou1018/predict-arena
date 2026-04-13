import { ethers } from "ethers";
import config from "../config/index.js";

const ABI = [
  "function startGame(uint256, uint256) external",
  "function settleGame(uint256, uint256) external",
  "function cancelGame(uint256) external",
  "function allPlayersPaid(uint256) external view returns (bool)",
  "function getPlayerPrediction(uint256, address) external view returns (uint8,bool,uint256,bool)",
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

  async isPlayerPaid(gameId, wallet) {
    if (!this.initialized) return false;
    const [, hasPaid] = await this.contract.getPlayerPrediction(gameId, wallet);
    return !!hasPaid;
  }

  async allPlayersPaid(gameId) {
    if (!this.initialized) return false;
    return !!(await this.contract.allPlayersPaid(gameId));
  }

  async startGame(id, price) { if (!this.initialized) return; await (await this.contract.startGame(id, price)).wait(); }
  async settleGame(id, price) { if (!this.initialized) return; await (await this.contract.settleGame(id, price)).wait(); }
  async cancelGame(id) { if (!this.initialized) return; await (await this.contract.cancelGame(id)).wait(); }
}

export default new ContractService();
