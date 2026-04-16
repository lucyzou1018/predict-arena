import { io } from "socket.io-client";
import { ethers } from "ethers";

const ARENA_ABI = [
  "function payForGame(uint256) external",
  "function predict(uint256, uint8) external",
  "function usdc() external view returns (address)",
  "function predictionDeadline(uint256) external view returns (uint256)",
  "function gameEntryFee(uint256) external view returns (uint256)",
  "function getGameInfo(uint256) external view returns (uint256,uint8,uint8,uint256,uint256,uint256,bool,string)",
  "function getPlayerPrediction(uint256, address) external view returns (uint8,bool,uint256,bool)",
];

const ERC20_ABI = [
  "function approve(address, uint256) external returns (bool)",
  "function allowance(address, address) external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)",
];

const GAME_STATE = {
  CREATED: 0,
  PAYMENT: 1,
  ACTIVE: 2,
};

const SERVER_URL = process.env.SERVER_URL || process.env.API_BASE || "http://127.0.0.1:3001";
const RPC_URL = process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const USDC_ADDRESS = process.env.USDC_ADDRESS;
const TEAM_SIZE = 3;
const ENTRY_FEE_RAW = ethers.parseUnits("1", 6);
const PREDICTION_PATTERN = ["up", "down", "up"];
const ROOM_TIMEOUT_MS = 90_000;
const PAYMENT_TIMEOUT_MS = 120_000;
const GAME_START_TIMEOUT_MS = 90_000;
const PREDICT_TIMEOUT_MS = 45_000;

function fail(message) {
  throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceWithTimeout(socket, event, timeoutMs, label = event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const handler = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

function waitForEventOrError(socket, event, errorEvent, timeoutMs, label = event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onSuccess = (payload) => {
      cleanup();
      resolve(payload);
    };

    const onError = (payload) => {
      cleanup();
      reject(new Error(payload?.message || `${label} failed`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(event, onSuccess);
      socket.off(errorEvent, onError);
    };

    socket.once(event, onSuccess);
    socket.once(errorEvent, onError);
  });
}

function waitForPredictionOutcome(socket, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve({ status: "timeout" });
    }, timeoutMs);

    const onPredicted = (payload) => {
      cleanup();
      resolve({ status: "predicted", payload });
    };

    const onError = (payload) => {
      cleanup();
      resolve({ status: "error", payload });
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("game:predicted", onPredicted);
      socket.off("game:error", onError);
    };

    socket.on("game:predicted", onPredicted);
    socket.on("game:error", onError);
  });
}

async function waitForChainState(arena, gameId, expectedState, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const gameInfo = await arena.getGameInfo(gameId);
    const state = Number(gameInfo?.[2] ?? -1);
    if (state === expectedState) return gameInfo;
    await sleep(800);
  }
  fail(`Game ${gameId} did not reach on-chain state ${expectedState} in time`);
}

async function ensureAllowance(player, amount) {
  const allowance = await player.usdc.allowance(player.wallet.address, CONTRACT_ADDRESS);
  if (allowance >= amount) return;
  const approveTx = await player.usdc.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
  await approveTx.wait();
  const refreshedAllowance = await waitForAllowance(player.usdc, player.wallet.address, CONTRACT_ADDRESS, amount);
  if (refreshedAllowance < amount) {
    fail(`${player.id} allowance did not update in time`);
  }
}

async function payForGame(player, paymentInfo) {
  const amount = paymentInfo.entryFee > 0n ? paymentInfo.entryFee : ENTRY_FEE_RAW;
  await ensureAllowance(player, amount);
  const tx = await player.arena.payForGame(paymentInfo.chainGameId);
  await tx.wait();
  player.socket.emit("room:payment:confirm", {
    gameId: paymentInfo.gameId,
    chainGameId: paymentInfo.chainGameId,
    inviteCode: paymentInfo.inviteCode,
    wallet: player.wallet.address.toLowerCase(),
  });
  return tx.hash;
}

async function waitForAllowance(token, walletAddress, spender, required, retries = 5, delayMs = 500) {
  for (let index = 0; index < retries; index += 1) {
    const allowance = await token.allowance(walletAddress, spender);
    if (allowance >= required) return allowance;
    if (index < retries - 1) await sleep(delayMs);
  }
  return token.allowance(walletAddress, spender);
}

async function submitPrediction(player, chainGameId, prediction) {
  const predictionValue = prediction === "up" ? 1 : 2;
  const tx = await player.arena.predict(chainGameId, predictionValue);
  await tx.wait();
  return { prediction, hash: tx.hash };
}

function createPlayer(privateKey, index, provider) {
  const wallet = new ethers.Wallet(privateKey, provider);
  const socket = io(SERVER_URL, { autoConnect: true, transports: ["polling", "websocket"] });
  const arena = new ethers.Contract(CONTRACT_ADDRESS, ARENA_ABI, wallet);
  return {
    id: `P${index + 1}`,
    wallet,
    socket,
    arena,
    usdc: null,
    errors: [],
  };
}

async function connectPlayer(player) {
  if (!player.socket.connected) {
    await onceWithTimeout(player.socket, "connect", 10_000, `${player.id} connect`);
  }
  player.socket.emit("auth", { wallet: player.wallet.address.toLowerCase() });
}

async function main() {
  const privateKeys = process.argv.slice(2).filter(Boolean);
  if (!RPC_URL || !CONTRACT_ADDRESS || !USDC_ADDRESS) {
    fail("Missing RPC_URL, CONTRACT_ADDRESS, or USDC_ADDRESS in environment");
  }
  if (privateKeys.length !== TEAM_SIZE) {
    fail(`Expected ${TEAM_SIZE} private keys, received ${privateKeys.length}`);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const arenaRead = new ethers.Contract(CONTRACT_ADDRESS, ARENA_ABI, provider);
  const players = privateKeys.map((privateKey, index) => createPlayer(privateKey, index, provider));

  try {
    console.log(`Using backend ${SERVER_URL}`);
    console.log(`Using contract ${CONTRACT_ADDRESS} on chain ${chainId}`);

    for (const player of players) {
      player.socket.on("room:error", (payload) => player.errors.push({ event: "room:error", payload }));
      player.socket.on("game:error", (payload) => player.errors.push({ event: "game:error", payload }));
      player.socket.on("connect_error", (payload) => player.errors.push({ event: "connect_error", payload: { message: payload?.message || String(payload) } }));
      await connectPlayer(player);
    }

    const balances = await Promise.all(players.map(async (player) => {
      const resolvedUsdcAddress = await player.arena.usdc().catch(() => USDC_ADDRESS);
      player.usdc = new ethers.Contract(resolvedUsdcAddress, ERC20_ABI, player.wallet);
      const [ethBalance, usdcBalance] = await Promise.all([
        provider.getBalance(player.wallet.address),
        player.usdc.balanceOf(player.wallet.address),
      ]);
      return {
        id: player.id,
        address: player.wallet.address,
        usdcAddress: resolvedUsdcAddress,
        eth: ethers.formatEther(ethBalance),
        usdc: ethers.formatUnits(usdcBalance, 6),
      };
    }));
    console.table(balances);

    for (const balance of balances) {
      if (Number(balance.eth) <= 0) fail(`${balance.id} has no ETH for gas`);
      if (Number(balance.usdc) < 1) fail(`${balance.id} has less than 1 USDC`);
    }

    const roomCreatedPromise = waitForEventOrError(players[0].socket, "room:created", "room:error", ROOM_TIMEOUT_MS, "room:created");
    const roomFullPromises = players.map((player) => waitForEventOrError(player.socket, "room:full", "room:error", ROOM_TIMEOUT_MS, `${player.id} room:full`));

    players[0].socket.emit("room:create", { teamSize: TEAM_SIZE });
    const created = await roomCreatedPromise;
    console.log(`Room created: inviteCode=${created.inviteCode} chainGameId=${created.chainGameId}`);

    players[1].socket.emit("room:join", { inviteCode: created.inviteCode });
    players[2].socket.emit("room:join", { inviteCode: created.inviteCode });

    const roomFullEvents = await Promise.all(roomFullPromises);
    const paymentInfo = roomFullEvents[0];
    console.log(`Room full: gameId=${paymentInfo.gameId} chainGameId=${paymentInfo.chainGameId}`);

    const gameInfo = await waitForChainState(arenaRead, paymentInfo.chainGameId, GAME_STATE.PAYMENT);
    const entryFee = gameInfo?.[5] > 0n ? gameInfo[5] : ENTRY_FEE_RAW;
    const gameStartPromises = players.map((player) => waitForEventOrError(player.socket, "game:start", "game:error", GAME_START_TIMEOUT_MS, `${player.id} game:start`));

    const paymentHashes = await Promise.all(players.map((player) =>
      payForGame(player, { ...paymentInfo, entryFee }),
    ));
    console.log("Payment tx hashes:");
    paymentHashes.forEach((hash, index) => console.log(`  ${players[index].id}: ${hash}`));

    const gameStartEvents = await Promise.all(gameStartPromises);
    const gameStart = gameStartEvents[0];
    console.log(`Game started: gameId=${gameStart.gameId} chainGameId=${gameStart.chainGameId} basePrice=${gameStart.basePrice}`);

    await waitForChainState(arenaRead, gameStart.chainGameId, GAME_STATE.ACTIVE);
    const deadline = Number(gameStart.predictionDeadline || await arenaRead.predictionDeadline(gameStart.chainGameId));
    if (!deadline) fail("Prediction deadline unavailable");

    const submittedPredictions = await Promise.all(players.map((player, index) =>
      submitPrediction(player, gameStart.chainGameId, PREDICTION_PATTERN[index]),
    ));

    const outcomePromises = players.map((player) => waitForPredictionOutcome(player.socket, PREDICT_TIMEOUT_MS));
    await sleep(300);
    submittedPredictions.forEach((submitted, index) => {
      players[index].socket.emit("game:predict", {
        gameId: gameStart.gameId,
        prediction: submitted.prediction,
        hash: submitted.hash,
        deadline,
      });
    });

    const outcomes = await Promise.all(outcomePromises);
    console.table(outcomes.map((outcome, index) => ({
      player: players[index].id,
      status: outcome.status,
      detail: outcome.payload?.message || outcome.payload?.prediction || "",
    })));

    await sleep(2_000);
    const playerStates = await Promise.all(players.map(async (player) => {
      const [prediction] = await arenaRead.getPlayerPrediction(gameStart.chainGameId, player.wallet.address);
      return {
        player: player.id,
        address: player.wallet.address,
        onchainPrediction: Number(prediction),
        errors: player.errors.map((entry) => entry.payload?.message || entry.event).join(" | "),
      };
    }));
    console.table(playerStates);

    const failedOutcomes = outcomes.filter((outcome) => outcome.status !== "predicted");
    const failedPlayers = playerStates.filter((state) => state.onchainPrediction === 0);
    if (failedOutcomes.length > 0 || failedPlayers.length > 0) {
      fail("3P verification failed: at least one player did not complete prediction");
    }

    console.log("3P verification passed: all players paid and submitted predictions on-chain.");
  } finally {
    await Promise.all(players.map(async (player) => {
      if (player?.socket?.connected) {
        player.socket.disconnect();
      }
    }));
  }
}

main().catch((error) => {
  console.error("[verify-room-3p] failed", error?.message || error);
  process.exit(1);
});
