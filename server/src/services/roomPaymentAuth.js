import { ethers } from "ethers";
import contractService from "./contract.js";
import config from "../config/index.js";

const ROOM_PAYMENT_AUTH_TYPES = {
  RoomPaymentAuth: [
    { name: "inviteCodeHash", type: "bytes32" },
    { name: "maxPlayers", type: "uint8" },
    { name: "roomOwner", type: "address" },
    { name: "player", type: "address" },
    { name: "playersHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
};

// 合约端的 deadline 必须紧贴支付窗口，否则超时后仍能上链。
// 预留 15s 缓冲用于 RPC 广播/打包的传播时间。
const ROOM_PAYMENT_AUTH_BUFFER_SEC = parseInt(process.env.ROOM_PAYMENT_AUTH_BUFFER_SEC || "15", 10);

const normalizeWallet = (wallet = "") => wallet.toLowerCase();

const hashPlayers = (players) => {
  const list = (players || []).map((wallet) => ethers.getAddress(wallet));
  return ethers.keccak256(ethers.concat(list.map((wallet) => ethers.zeroPadValue(wallet, 32))));
};

class RoomPaymentAuthService {
  async build({ inviteCode, maxPlayers, roomOwner, player, players, paymentStartedAt }) {
    if (!contractService?.authSigner || !contractService?.chainId || !contractService?.contract) {
      throw new Error("Room payment auth unavailable");
    }

    const normalizedPlayers = (players || []).map((wallet) => normalizeWallet(wallet));
    const normalizedPlayer = normalizeWallet(player);
    const normalizedOwner = normalizeWallet(roomOwner);
    // deadline 以支付窗口开始时间为基准，保证所有重签的 auth 都指向同一个真实截止时间，
    // 避免超时后重新构造 auth 又延长了链上有效期。
    const startedAtMs = Number.isFinite(paymentStartedAt) ? paymentStartedAt : Date.now();
    const deadline = Math.floor(startedAtMs / 1000)
      + Math.ceil(config.game.paymentTimeout / 1000)
      + ROOM_PAYMENT_AUTH_BUFFER_SEC;

    const payload = {
      inviteCodeHash: ethers.keccak256(ethers.toUtf8Bytes(inviteCode)),
      maxPlayers,
      roomOwner: ethers.getAddress(normalizedOwner),
      player: ethers.getAddress(normalizedPlayer),
      playersHash: hashPlayers(normalizedPlayers),
      deadline,
    };

    const signature = await contractService.authSigner.signTypedData(
      {
        name: "BtcPredictArena",
        version: "1",
        chainId: contractService.chainId,
        verifyingContract: await contractService.contract.getAddress(),
      },
      ROOM_PAYMENT_AUTH_TYPES,
      payload,
    );

    return {
      inviteCode,
      maxPlayers,
      roomOwner: normalizedOwner,
      player: normalizedPlayer,
      players: normalizedPlayers,
      deadline,
      signature,
    };
  }
}

export default new RoomPaymentAuthService();
