const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

describe("BtcPredictArena", function () {
  let arena, usdc, owner, p1, p2, p3;
  const ENTRY = ethers.parseUnits("1", 6);
  const MINT = ethers.parseUnits("1000", 6);

  beforeEach(async function () {
    [owner, p1, p2, p3] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockUSDC");
    usdc = await MockERC20.deploy();
    await usdc.waitForDeployment();

    const Arena = await ethers.getContractFactory("BtcPredictArena");
    arena = await Arena.deploy(await usdc.getAddress());
    await arena.waitForDeployment();

    const arenaAddress = await arena.getAddress();
    for (const player of [owner, p1, p2, p3]) {
      await usdc.mint(player.address, MINT);
      await usdc.connect(player).approve(arenaAddress, MINT);
    }
  });

  async function createManagedGame(players) {
    const gameId = Number(await arena.nextGameId());
    await arena.ownerCreateGame(players.length, players[0].address);
    for (const player of players.slice(1)) {
      await arena.ownerJoinGame(gameId, player.address);
    }
    return gameId;
  }

  async function payAll(gameId, players) {
    for (const player of players) {
      await arena.connect(player).payForGame(gameId);
    }
  }

  async function createPaidGame(players) {
    const gameId = await createManagedGame(players);
    await payAll(gameId, players);
    return gameId;
  }

  async function signStart(gameId, basePrice) {
    const validUntil = (await time.latest()) + 3600;
    const domain = {
      name: "BtcPredictArena",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await arena.getAddress(),
    };
    const types = {
      StartGameAuth: [
        { name: "gameId", type: "uint256" },
        { name: "basePrice", type: "uint256" },
        { name: "validUntil", type: "uint256" },
      ],
    };
    const value = { gameId, basePrice, validUntil };
    const signature = await owner.signTypedData(domain, types, value);
    return { validUntil, signature };
  }

  function settlementLeaf(gameId, player, prediction, reward) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return ethers.keccak256(coder.encode(["uint256", "address", "uint8", "uint256"], [gameId, player, prediction, reward]));
  }

  function hashPair(left, right) {
    return left.toLowerCase() < right.toLowerCase()
      ? ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [left, right]))
      : ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [right, left]));
  }

  function buildSettlementTree(gameId, entries) {
    const normalized = [...entries].sort((a, b) => a.player.toLowerCase().localeCompare(b.player.toLowerCase()));
    const leaves = normalized.map((entry) => settlementLeaf(gameId, entry.player, entry.prediction, entry.reward));
    const layers = [leaves];
    while (layers[layers.length - 1].length > 1) {
      const previous = layers[layers.length - 1];
      const next = [];
      for (let i = 0; i < previous.length; i += 2) {
        const left = previous[i];
        const right = previous[i + 1];
        next.push(right ? hashPair(left, right) : left);
      }
      layers.push(next);
    }
    const proofs = new Map();
    normalized.forEach((entry, entryIndex) => {
      let index = entryIndex;
      const proof = [];
      for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
        const layer = layers[layerIndex];
        const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
        if (siblingIndex < layer.length) proof.push(layer[siblingIndex]);
        index = Math.floor(index / 2);
      }
      proofs.set(entry.player.toLowerCase(), proof);
    });
    return { root: layers[layers.length - 1][0], proofs };
  }

  async function signSettlement(gameId, settlementPrice, resultRoot, totalPayout) {
    const validUntil = (await time.latest()) + 3600;
    const domain = {
      name: "BtcPredictArena",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await arena.getAddress(),
    };
    const types = {
      SettlementAuth: [
        { name: "gameId", type: "uint256" },
        { name: "settlementPrice", type: "uint256" },
        { name: "resultRoot", type: "bytes32" },
        { name: "totalPayout", type: "uint256" },
        { name: "validUntil", type: "uint256" },
      ],
    };
    const value = { gameId, settlementPrice, resultRoot, totalPayout, validUntil };
    const signature = await owner.signTypedData(domain, types, value);
    return { validUntil, signature };
  }

  async function signPrediction(player, gameId, prediction, deadline) {
    const domain = {
      name: "BtcPredictArena",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await arena.getAddress(),
    };
    const types = {
      PredictionIntent: [
        { name: "gameId", type: "uint256" },
        { name: "player", type: "address" },
        { name: "prediction", type: "uint8" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const value = { gameId, player: player.address, prediction, deadline };
    return player.signTypedData(domain, types, value);
  }

  it("creates a public game and opens payment when the lobby is full", async function () {
    await arena.connect(p1).createGame(2);
    await arena.connect(p2).joinGame(1);

    const info = await arena.getGameInfo(1);
    expect(info[2]).to.equal(1); // Payment
    expect(info[3]).to.equal(2n);
  });

  it("settles a two-player winner/loser game", async function () {
    const gameId = await createPaidGame([p1, p2]);
    const startAuth = await signStart(gameId, 6700000);
    await arena.connect(p2).startGameWithAuth(gameId, 6700000, startAuth.validUntil, startAuth.signature);
    const deadline = await arena.predictionDeadline(gameId);
    await time.increaseTo(Number(deadline) + 1);
    const totalPayout = 1900000n;
    const tree = buildSettlementTree(gameId, [
      { player: p1.address, prediction: 1, reward: 1900000n },
      { player: p2.address, prediction: 2, reward: 0n },
    ]);
    const settlementAuth = await signSettlement(gameId, 6800000, tree.root, totalPayout);
    await arena.connect(p1).settleGameWithAuth(
      gameId,
      6800000,
      tree.root,
      totalPayout,
      settlementAuth.validUntil,
      settlementAuth.signature,
    );

    const pp1 = await arena.getPlayerPrediction(gameId, p1.address);
    const pp2 = await arena.getPlayerPrediction(gameId, p2.address);
    expect(pp1[2]).to.equal(0n);
    expect(pp2[2]).to.equal(0n);
  });

  it("lets the winner claim the on-chain reward", async function () {
    const gameId = await createPaidGame([p1, p2]);
    const startAuth = await signStart(gameId, 6700000);
    await arena.startGameWithAuth(gameId, 6700000, startAuth.validUntil, startAuth.signature);
    const deadline = await arena.predictionDeadline(gameId);
    await time.increaseTo(Number(deadline) + 1);
    const totalPayout = 1900000n;
    const tree = buildSettlementTree(gameId, [
      { player: p1.address, prediction: 1, reward: 1900000n },
      { player: p2.address, prediction: 2, reward: 0n },
    ]);
    const settlementAuth = await signSettlement(gameId, 6800000, tree.root, totalPayout);
    await arena.settleGameWithAuth(
      gameId,
      6800000,
      tree.root,
      totalPayout,
      settlementAuth.validUntil,
      settlementAuth.signature,
    );

    const balBefore = await usdc.balanceOf(p1.address);
    await arena.connect(p1)["claimReward(uint256,uint8,uint256,bytes32[])"](
      gameId,
      1,
      1900000n,
      tree.proofs.get(p1.address.toLowerCase()),
    );
    const balAfter = await usdc.balanceOf(p1.address);
    expect(balAfter - balBefore).to.equal(1900000n);
  });

  it("cancels a timed-out payment game and refunds paid players", async function () {
    await arena.setPaymentTimeout(1);
    const gameId = await createManagedGame([p1, p2]);
    await arena.connect(p1).payForGame(gameId);

    const bal1 = await usdc.balanceOf(p1.address);
    const bal2 = await usdc.balanceOf(p2.address);
    await time.increase(2);
    await arena.connect(p2).cancelExpiredGame(gameId);

    expect(await usdc.balanceOf(p1.address) - bal1).to.equal(ENTRY);
    expect(await usdc.balanceOf(p2.address) - bal2).to.equal(0n);
  });

  it("allows anyone to force a refund after the grace period and claim it", async function () {
    const gameId = await createPaidGame([p1, p2]);
    const startAuth = await signStart(gameId, 6700000);
    await arena.startGameWithAuth(gameId, 6700000, startAuth.validUntil, startAuth.signature);
    await arena.setRefundGracePeriod(30);
    const deadline = Number(await arena.predictionDeadline(gameId));
    await time.increaseTo(deadline + 31);

    await arena.connect(p2).forceRefund(gameId);
    const info = await arena.getGameInfo(gameId);
    expect(info[2]).to.equal(5); // Refundable

    const balBefore = await usdc.balanceOf(p1.address);
    await arena.connect(p1).claimRefund(gameId);
    const balAfter = await usdc.balanceOf(p1.address);
    expect(balAfter - balBefore).to.equal(ENTRY);
  });

  it("rejects a forced refund before the grace period ends", async function () {
    const gameId = await createPaidGame([p1, p2]);
    const startAuth = await signStart(gameId, 6700000);
    await arena.startGameWithAuth(gameId, 6700000, startAuth.validUntil, startAuth.signature);
    await arena.setRefundGracePeriod(60);
    await time.increase(30);

    await expect(arena.connect(p1).forceRefund(gameId)).to.be.revertedWith("Refund not available yet");
  });
});
