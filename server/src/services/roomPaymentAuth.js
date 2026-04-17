import { ethers } from "ethers";
import contractService from "./contract.js";

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

const ROOM_PAYMENT_AUTH_WINDOW_SEC = parseInt(process.env.ROOM_PAYMENT_AUTH_WINDOW_SEC || "900", 10);

const normalizeWallet = (wallet = "") => wallet.toLowerCase();

const hashPlayers = (players) => {
  const list = (players || []).map((wallet) => ethers.getAddress(wallet));
  return ethers.keccak256(ethers.concat(list.map((wallet) => ethers.zeroPadValue(wallet, 32))));
};

class RoomPaymentAuthService {
  async build({ inviteCode, maxPlayers, roomOwner, player, players }) {
    if (!contractService?.baseSigner || !contractService?.chainId || !contractService?.contract) {
      throw new Error("Room payment auth unavailable");
    }

    const normalizedPlayers = (players || []).map((wallet) => normalizeWallet(wallet));
    const normalizedPlayer = normalizeWallet(player);
    const normalizedOwner = normalizeWallet(roomOwner);
    const deadline = Math.floor(Date.now() / 1000) + ROOM_PAYMENT_AUTH_WINDOW_SEC;

    const payload = {
      inviteCodeHash: ethers.keccak256(ethers.toUtf8Bytes(inviteCode)),
      maxPlayers,
      roomOwner: ethers.getAddress(normalizedOwner),
      player: ethers.getAddress(normalizedPlayer),
      playersHash: hashPlayers(normalizedPlayers),
      deadline,
    };

    const signature = await contractService.baseSigner.signTypedData(
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
