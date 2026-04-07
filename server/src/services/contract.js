import { ethers } from "ethers";
import config from "../config/index.js";

const ABI = [
  "function createGame(uint8) external returns (uint256)",
  "function createRoom(uint8, string) external returns (uint256)",
  "function startGame(uint256, uint256) external",
  "function settleGame(uint256, uint256) external",
  "function cancelGame(uint256) external",
  "event GameCreated(uint256 indexed gameId, uint8 maxPlayers, bool isRoom, string inviteCode)",
];

let mockId = 1;

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

  async createGame(n) {
    if (!this.initialized) return { gameId: mockId++ };
    const tx = await this.contract.createGame(n);
    const r = await tx.wait();
    return { gameId: mockId++, txHash: r.hash };
  }

  async createRoom(n, code) {
    if (!this.initialized) return { gameId: mockId++ };
    const tx = await this.contract.createRoom(n, code);
    const r = await tx.wait();
    return { gameId: mockId++, txHash: r.hash };
  }

  async startGame(id, price) { if (!this.initialized) return; await (await this.contract.startGame(id, price)).wait(); }
  async settleGame(id, price) { if (!this.initialized) return; await (await this.contract.settleGame(id, price)).wait(); }
  async cancelGame(id) { if (!this.initialized) return; await (await this.contract.cancelGame(id)).wait(); }
}

export default new ContractService();
