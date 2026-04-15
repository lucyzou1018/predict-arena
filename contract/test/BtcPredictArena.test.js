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

  it("creates a public game and opens payment when the lobby is full", async function () {
    await arena.connect(p1).createGame(2);
    await arena.connect(p2).joinGame(1);

    const info = await arena.getGameInfo(1);
    expect(info[2]).to.equal(1); // Payment
    expect(info[3]).to.equal(2n);
  });

  it("settles a two-player winner/loser game", async function () {
    const gameId = await createPaidGame([p1, p2]);

    await arena.startGame(gameId, 6700000);
    await arena.connect(p1).predict(gameId, 1);
    await arena.connect(p2).predict(gameId, 2);
    await arena.settleGame(gameId, 6800000);

    const pp1 = await arena.getPlayerPrediction(gameId, p1.address);
    const pp2 = await arena.getPlayerPrediction(gameId, p2.address);
    expect(pp1[2]).to.equal(1900000n);
    expect(pp2[2]).to.equal(0n);
  });

  it("lets the winner claim the on-chain reward", async function () {
    const gameId = await createPaidGame([p1, p2]);

    await arena.startGame(gameId, 6700000);
    await arena.connect(p1).predict(gameId, 1);
    await arena.connect(p2).predict(gameId, 2);
    await arena.settleGame(gameId, 6800000);

    const balBefore = await usdc.balanceOf(p1.address);
    await arena.connect(p1).claimReward(gameId);
    const balAfter = await usdc.balanceOf(p1.address);
    expect(balAfter - balBefore).to.equal(1900000n);
  });

  it("cancels a paid game and refunds every paid player", async function () {
    const gameId = await createPaidGame([p1, p2]);

    const bal1 = await usdc.balanceOf(p1.address);
    const bal2 = await usdc.balanceOf(p2.address);

    await arena.cancelGame(gameId);

    expect(await usdc.balanceOf(p1.address) - bal1).to.equal(ENTRY);
    expect(await usdc.balanceOf(p2.address) - bal2).to.equal(ENTRY);
  });

  it("allows anyone to force a refund after the grace period and claim it", async function () {
    const gameId = await createPaidGame([p1, p2]);

    await arena.startGame(gameId, 6700000);
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

    await arena.startGame(gameId, 6700000);
    await arena.setRefundGracePeriod(60);
    await time.increase(30);

    await expect(arena.connect(p1).forceRefund(gameId)).to.be.revertedWith("Refund not available yet");
  });
});
