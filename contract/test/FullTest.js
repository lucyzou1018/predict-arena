const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

describe("BtcPredictArena - Full Test Suite", function () {
  let arena, usdc, owner, p1, p2, p3, p4, p5;
  const ENTRY = ethers.parseUnits("1", 6);
  const MINT = ethers.parseUnits("1000", 6);

  beforeEach(async function () {
    [owner, p1, p2, p3, p4, p5] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockUSDC");
    usdc = await Mock.deploy();
    await usdc.waitForDeployment();

    const Arena = await ethers.getContractFactory("BtcPredictArena");
    arena = await Arena.deploy(await usdc.getAddress());
    await arena.waitForDeployment();

    const arenaAddress = await arena.getAddress();
    for (const player of [owner, p1, p2, p3, p4, p5]) {
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

  async function createPaidGame(players) {
    const gameId = await createManagedGame(players);
    for (const player of players) {
      await arena.connect(player).payForGame(gameId);
    }
    return gameId;
  }

  async function startPaidGame(players, basePrice = 6700000) {
    const gameId = await createPaidGame(players);
    await arena.startGame(gameId, basePrice);
    return gameId;
  }

  it("TC-C-16.1: should create game", async function () {
    await arena.connect(p1).createGame(2);
    const info = await arena.getGameInfo(1);
    expect(info[1]).to.equal(2);
    expect(info[2]).to.equal(0); // Created
  });

  it("TC-C-16.2: should reject invalid team size", async function () {
    await expect(arena.createGame(1)).to.be.revertedWith("Invalid team size");
    await expect(arena.createGame(6)).to.be.revertedWith("Invalid team size");
    await expect(arena.createGame(0)).to.be.revertedWith("Invalid team size");
  });

  it("TC-C-16.3/16.4/16.5: should join, open payment, and reject extra joins", async function () {
    await arena.connect(p1).createGame(2);
    await arena.connect(p2).joinGame(1);

    const info = await arena.getGameInfo(1);
    expect(info[2]).to.equal(1); // Payment
    expect(info[3]).to.equal(2n);

    await expect(arena.connect(p3).joinGame(1)).to.be.revertedWith("Game not joinable");
    await expect(arena.connect(p2).joinGame(1)).to.be.revertedWith("Game not joinable");
  });

  it("TC-C-16.6/16.7: should create room and reject duplicate invite code", async function () {
    await arena.connect(p1).createRoom(2, "ABC123");
    const info = await arena.getGameInfo(1);
    expect(info[6]).to.equal(true);
    expect(info[7]).to.equal("ABC123");
    await expect(arena.connect(p2).createRoom(2, "ABC123")).to.be.revertedWith("Invite code taken");
  });

  it("TC-C-16.8: should settle 1 winner 1 loser", async function () {
    const gameId = await startPaidGame([p1, p2]);
    await arena.connect(p1).predict(gameId, 1);
    await arena.connect(p2).predict(gameId, 2);
    await arena.settleGame(gameId, 6800000);

    const pp1 = await arena.getPlayerPrediction(gameId, p1.address);
    const pp2 = await arena.getPlayerPrediction(gameId, p2.address);
    expect(pp1[2]).to.equal(1900000n);
    expect(pp2[2]).to.equal(0n);
    expect(pp1[2] + pp2[2] + (await arena.totalFees())).to.equal(2000000n);
  });

  it("TC-C-16.9: should settle both correct", async function () {
    const gameId = await startPaidGame([p1, p2]);
    await arena.connect(p1).predict(gameId, 1);
    await arena.connect(p2).predict(gameId, 1);
    await arena.settleGame(gameId, 6800000);

    const pp1 = await arena.getPlayerPrediction(gameId, p1.address);
    const pp2 = await arena.getPlayerPrediction(gameId, p2.address);
    expect(pp1[2]).to.equal(950000n);
    expect(pp2[2]).to.equal(950000n);
  });

  it("TC-C-16.10/16.11/16.12: should claim reward once and reject losers", async function () {
    const gameId = await startPaidGame([p1, p2]);
    await arena.connect(p1).predict(gameId, 1);
    await arena.connect(p2).predict(gameId, 2);
    await arena.settleGame(gameId, 6800000);

    const balBefore = await usdc.balanceOf(p1.address);
    await arena.connect(p1).claimReward(gameId);
    const balAfter = await usdc.balanceOf(p1.address);
    expect(balAfter - balBefore).to.equal(1900000n);
    await expect(arena.connect(p1).claimReward(gameId)).to.be.revertedWith("Already claimed");
    await expect(arena.connect(p2).claimReward(gameId)).to.be.revertedWith("No reward");
  });

  it("TC-C-16.13: should cancel and refund a paid game", async function () {
    const gameId = await createPaidGame([p1, p2]);

    const b1 = await usdc.balanceOf(p1.address);
    const b2 = await usdc.balanceOf(p2.address);
    await arena.cancelGame(gameId);

    expect(await usdc.balanceOf(p1.address) - b1).to.equal(ENTRY);
    expect(await usdc.balanceOf(p2.address) - b2).to.equal(ENTRY);
    const info = await arena.getGameInfo(gameId);
    expect(info[2]).to.equal(4); // Cancelled
  });

  it("TC-EX-15.5: non-owner cannot call admin functions", async function () {
    const gameId = await createPaidGame([p1, p2]);
    await expect(arena.connect(p1).startGame(gameId, 6700000)).to.be.revertedWith("Not owner");

    await arena.startGame(gameId, 6700000);
    await expect(arena.connect(p1).settleGame(gameId, 6800000)).to.be.revertedWith("Not owner");
    await expect(arena.connect(p1).cancelGame(gameId)).to.be.revertedWith("Not owner");
  });

  it("TC-EX-15.6: should reject fee rate > 10%", async function () {
    await expect(arena.setFeeRate(1001)).to.be.revertedWith("Fee too high");
    await arena.setFeeRate(1000);
    expect(await arena.feeRate()).to.equal(1000n);
  });

  it("TC-EX-13.3/13.4: should preserve balances in a 5-player split", async function () {
    const gameId = await startPaidGame([p1, p2, p3, p4, p5]);
    await arena.connect(p1).predict(gameId, 1);
    await arena.connect(p2).predict(gameId, 1);
    await arena.connect(p3).predict(gameId, 1);
    await arena.connect(p4).predict(gameId, 2);
    await arena.connect(p5).predict(gameId, 2);
    await arena.settleGame(gameId, 6800000);

    const r1 = await arena.getPlayerPrediction(gameId, p1.address);
    const r2 = await arena.getPlayerPrediction(gameId, p2.address);
    const r3 = await arena.getPlayerPrediction(gameId, p3.address);
    const r4 = await arena.getPlayerPrediction(gameId, p4.address);
    const r5 = await arena.getPlayerPrediction(gameId, p5.address);
    const totalRewards = r1[2] + r2[2] + r3[2] + r4[2] + r5[2];
    expect(r1[2]).to.equal(1583333n);
    expect(r2[2]).to.equal(1583333n);
    expect(r3[2]).to.equal(1583333n);
    expect(r4[2]).to.equal(0n);
    expect(r5[2]).to.equal(0n);
    expect(totalRewards + (await arena.totalFees())).to.equal(5000000n);
  });

  it("TC-6.4/6.5/6.6: should handle both-wrong, flat, and no-prediction edge cases", async function () {
    const gameId1 = await startPaidGame([p1, p2]);
    await arena.connect(p1).predict(gameId1, 1);
    await arena.connect(p2).predict(gameId1, 1);
    await arena.settleGame(gameId1, 6600000);
    let pp1 = await arena.getPlayerPrediction(gameId1, p1.address);
    let pp2 = await arena.getPlayerPrediction(gameId1, p2.address);
    expect(pp1[2]).to.equal(950000n);
    expect(pp2[2]).to.equal(950000n);

    const gameId2 = await createPaidGame([p3, p4]);
    await arena.startGame(gameId2, 6700000);
    await arena.connect(p3).predict(gameId2, 1);
    await arena.connect(p4).predict(gameId2, 2);
    await arena.settleGame(gameId2, 6700000);
    pp1 = await arena.getPlayerPrediction(gameId2, p3.address);
    pp2 = await arena.getPlayerPrediction(gameId2, p4.address);
    expect(pp1[2]).to.equal(950000n);
    expect(pp2[2]).to.equal(950000n);

    const gameId3 = await createPaidGame([p1, p2, p3]);
    await arena.startGame(gameId3, 6700000);
    await arena.connect(p1).predict(gameId3, 1);
    await arena.settleGame(gameId3, 6800000);
    const winner = await arena.getPlayerPrediction(gameId3, p1.address);
    const noPrediction = await arena.getPlayerPrediction(gameId3, p2.address);
    expect(winner[2]).to.equal(2850000n);
    expect(noPrediction[2]).to.equal(0n);
  });

  it("TC-EX-7.8/7.6/7.7/7.4: should reject invalid lifecycle actions", async function () {
    await expect(arena.connect(p1).joinGame(999)).to.be.revertedWith("Game not found");

    const gameId = await createPaidGame([p1, p2]);
    await expect(arena.startGame(gameId, 0)).to.be.revertedWith("Invalid price");
    await arena.startGame(gameId, 6700000);
    await expect(arena.settleGame(gameId, 0)).to.be.revertedWith("Invalid price");
    await arena.settleGame(gameId, 6800000);
    await expect(arena.settleGame(gameId, 6900000)).to.be.revertedWith("Game not active");
  });

  it("TC-EX-7.1/7.2/7.3: should reject join/predict on the wrong game state", async function () {
    const gameId = await createPaidGame([p1, p2]);
    await arena.startGame(gameId, 6700000);

    await expect(arena.connect(p3).joinGame(gameId)).to.be.revertedWith("Game not joinable");

    await arena.connect(p1).predict(gameId, 1);
    await arena.connect(p2).predict(gameId, 2);
    await arena.settleGame(gameId, 6800000);
    await expect(arena.connect(p1).predict(gameId, 2)).to.be.revertedWith("Game not active");
  });

  it("TC-EX-Fee: should withdraw accumulated fees", async function () {
    const gameId = await startPaidGame([p1, p2]);
    await arena.connect(p1).predict(gameId, 1);
    await arena.connect(p2).predict(gameId, 2);
    await arena.settleGame(gameId, 6800000);

    const fees = await arena.totalFees();
    const before = await usdc.balanceOf(owner.address);
    await arena.withdrawFees(owner.address);
    const after = await usdc.balanceOf(owner.address);
    expect(after - before).to.equal(fees);
    expect(await arena.totalFees()).to.equal(0n);
  });

  it("TC-R-1/2: should force a refund after the grace period and block early rescues", async function () {
    const gameId = await startPaidGame([p1, p2]);
    await arena.setRefundGracePeriod(30);

    await expect(arena.connect(p1).forceRefund(gameId)).to.be.revertedWith("Refund not available yet");

    const deadline = Number(await arena.predictionDeadline(gameId));
    await time.increaseTo(deadline + 31);

    await arena.connect(p2).forceRefund(gameId);
    const info = await arena.getGameInfo(gameId);
    expect(info[2]).to.equal(5); // Refundable

    const before = await usdc.balanceOf(p1.address);
    await arena.connect(p1).claimRefund(gameId);
    const after = await usdc.balanceOf(p1.address);
    expect(after - before).to.equal(ENTRY);
    await expect(arena.connect(p1).claimRefund(gameId)).to.be.revertedWith("Already claimed");
  });
});
