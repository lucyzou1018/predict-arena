const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BtcPredictArena - Full Test Suite", function () {
  let arena, usdc, owner, p1, p2, p3, p4, p5;
  const ENTRY = ethers.parseUnits("1", 6);
  const MINT = ethers.parseUnits("1000", 6);

  beforeEach(async function () {
    [owner, p1, p2, p3, p4, p5] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockUSDC");
    usdc = await Mock.deploy(); await usdc.waitForDeployment();
    const Arena = await ethers.getContractFactory("BtcPredictArena");
    arena = await Arena.deploy(await usdc.getAddress()); await arena.waitForDeployment();
    const addr = await arena.getAddress();
    for (const p of [p1, p2, p3, p4, p5]) {
      await usdc.mint(p.address, MINT);
      await usdc.connect(p).approve(addr, MINT);
    }
  });

  // TC-C-16.1
  it("TC-C-16.1: should create game", async function () {
    await arena.createGame(2);
    const info = await arena.getGameInfo(1);
    expect(info[1]).to.equal(2);
    expect(info[2]).to.equal(0); // Created
  });

  // TC-C-16.2
  it("TC-C-16.2: should reject invalid team size", async function () {
    await expect(arena.createGame(1)).to.be.revertedWith("Invalid team size");
    await expect(arena.createGame(6)).to.be.revertedWith("Invalid team size");
    await expect(arena.createGame(0)).to.be.revertedWith("Invalid team size");
  });

  // TC-C-16.3
  it("TC-C-16.3: should join and pay", async function () {
    await arena.createGame(2);
    const balBefore = await usdc.balanceOf(p1.address);
    await arena.connect(p1).joinGame(1);
    const balAfter = await usdc.balanceOf(p1.address);
    expect(balBefore - balAfter).to.equal(ENTRY);
    const players = await arena.getGamePlayers(1);
    expect(players[0]).to.equal(p1.address);
  });

  // TC-C-16.4
  it("TC-C-16.4: should reject join when full", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await expect(arena.connect(p3).joinGame(1)).to.be.revertedWith("Game full");
  });

  // TC-C-16.5
  it("TC-C-16.5: should reject duplicate join", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await expect(arena.connect(p1).joinGame(1)).to.be.revertedWith("Already joined");
  });

  // TC-C-16.6
  it("TC-C-16.6: should create room with invite code", async function () {
    await arena.createRoom(3, "ABC123");
    const info = await arena.getGameInfo(1);
    expect(info[6]).to.equal(true);
    expect(info[7]).to.equal("ABC123");
  });

  // TC-C-16.7
  it("TC-C-16.7: should reject duplicate invite code", async function () {
    await arena.createRoom(2, "SAME01");
    await expect(arena.createRoom(2, "SAME01")).to.be.revertedWith("Invite code taken");
  });

  // TC-C-16.8
  it("TC-C-16.8: should settle 1 winner 1 loser", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1); // Up
    await arena.connect(p2).predict(1, 2); // Down
    await arena.settleGame(1, 6800000); // Up wins
    const pp1 = await arena.getPlayerPrediction(1, p1.address);
    const pp2 = await arena.getPlayerPrediction(1, p2.address);
    expect(pp1[2]).to.equal(1900000n); // 1.90 USDC
    expect(pp2[2]).to.equal(0n);
    // TC-EX-13.1: balance check
    const fees = await arena.totalFees();
    expect(pp1[2] + pp2[2] + fees).to.equal(2000000n);
  });

  // TC-C-16.9
  it("TC-C-16.9: should settle both correct", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1);
    await arena.connect(p2).predict(1, 1);
    await arena.settleGame(1, 6800000);
    const pp1 = await arena.getPlayerPrediction(1, p1.address);
    const pp2 = await arena.getPlayerPrediction(1, p2.address);
    expect(pp1[2]).to.equal(950000n);
    expect(pp2[2]).to.equal(950000n);
    // TC-EX-13.2: balance check
    const fees = await arena.totalFees();
    expect(pp1[2] + pp2[2] + fees).to.equal(2000000n);
  });

  // TC-C-16.10
  it("TC-C-16.10: should claim reward", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1);
    await arena.connect(p2).predict(1, 2);
    await arena.settleGame(1, 6800000);
    const bal1 = await usdc.balanceOf(p1.address);
    await arena.connect(p1).claimReward(1);
    const bal2 = await usdc.balanceOf(p1.address);
    expect(bal2 - bal1).to.equal(1900000n);
  });

  // TC-C-16.11
  it("TC-C-16.11: should reject double claim", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1);
    await arena.connect(p2).predict(1, 2);
    await arena.settleGame(1, 6800000);
    await arena.connect(p1).claimReward(1);
    await expect(arena.connect(p1).claimReward(1)).to.be.revertedWith("Already claimed");
  });

  // TC-C-16.12
  it("TC-C-16.12: loser should have no reward", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1);
    await arena.connect(p2).predict(1, 2);
    await arena.settleGame(1, 6800000);
    await expect(arena.connect(p2).claimReward(1)).to.be.revertedWith("No reward");
  });

  // TC-C-16.13
  it("TC-C-16.13: should cancel and refund", async function () {
    await arena.createGame(3);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    const b1 = await usdc.balanceOf(p1.address);
    const b2 = await usdc.balanceOf(p2.address);
    await arena.cancelGame(1);
    expect(await usdc.balanceOf(p1.address) - b1).to.equal(ENTRY);
    expect(await usdc.balanceOf(p2.address) - b2).to.equal(ENTRY);
    const info = await arena.getGameInfo(1);
    expect(info[2]).to.equal(3); // Cancelled
  });

  // TC-EX-15.5: non-owner rejected
  it("TC-EX-15.5: non-owner cannot call admin functions", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await expect(arena.connect(p1).startGame(1, 6700000)).to.be.revertedWith("Not owner");
    await arena.startGame(1, 6700000);
    await expect(arena.connect(p1).settleGame(1, 6800000)).to.be.revertedWith("Not owner");
    await expect(arena.connect(p1).cancelGame(1)).to.be.revertedWith("Not owner");
  });

  // TC-EX-15.6: fee rate cap
  it("TC-EX-15.6: should reject fee rate > 10%", async function () {
    await expect(arena.setFeeRate(1001)).to.be.revertedWith("Fee too high");
    await arena.setFeeRate(1000); // 10% ok
    expect(await arena.feeRate()).to.equal(1000n);
  });

  // TC-EX-13.3 & 13.4: 5 players, 3 win 2 lose
  it("TC-EX-13.3/13.4: 5-player settlement balance", async function () {
    await arena.createGame(5);
    for (const p of [p1, p2, p3, p4, p5]) await arena.connect(p).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1); // Up - win
    await arena.connect(p2).predict(1, 1); // Up - win
    await arena.connect(p3).predict(1, 1); // Up - win
    await arena.connect(p4).predict(1, 2); // Down - lose
    await arena.connect(p5).predict(1, 2); // Down - lose
    await arena.settleGame(1, 6800000);

    const r1 = await arena.getPlayerPrediction(1, p1.address);
    const r2 = await arena.getPlayerPrediction(1, p2.address);
    const r3 = await arena.getPlayerPrediction(1, p3.address);
    const r4 = await arena.getPlayerPrediction(1, p4.address);
    const r5 = await arena.getPlayerPrediction(1, p5.address);

    // Winners: 950000 + 1900000/3 = 950000 + 633333 = 1583333
    expect(r1[2]).to.equal(1583333n);
    expect(r2[2]).to.equal(1583333n);
    expect(r3[2]).to.equal(1583333n);
    expect(r4[2]).to.equal(0n);
    expect(r5[2]).to.equal(0n);

    // Total balance: rewards + fees = 5 USDC
    const fees = await arena.totalFees();
    const totalRewards = r1[2] + r2[2] + r3[2] + r4[2] + r5[2];
    expect(totalRewards + fees).to.equal(5000000n);
    console.log("    Remainder in fees:", Number(fees) - 250000, "wei");
  });

  // Both wrong settlement
  it("TC-6.4: both wrong - refund minus fee", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1); // Up
    await arena.connect(p2).predict(1, 1); // Up
    await arena.settleGame(1, 6600000); // Down - both wrong
    const pp1 = await arena.getPlayerPrediction(1, p1.address);
    const pp2 = await arena.getPlayerPrediction(1, p2.address);
    expect(pp1[2]).to.equal(950000n);
    expect(pp2[2]).to.equal(950000n);
  });

  // Flat price
  it("TC-6.5: flat price - refund minus fee", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1);
    await arena.connect(p2).predict(1, 2);
    await arena.settleGame(1, 6700000); // Same price
    const pp1 = await arena.getPlayerPrediction(1, p1.address);
    const pp2 = await arena.getPlayerPrediction(1, p2.address);
    expect(pp1[2]).to.equal(950000n);
    expect(pp2[2]).to.equal(950000n);
  });

  // No prediction = lose
  it("TC-6.6: no prediction treated as loss", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1); // Up
    // p2 does not predict
    await arena.settleGame(1, 6800000); // Up wins
    const pp1 = await arena.getPlayerPrediction(1, p1.address);
    const pp2 = await arena.getPlayerPrediction(1, p2.address);
    expect(pp1[2]).to.equal(1900000n); // Winner takes all
    expect(pp2[2]).to.equal(0n);
  });

  // Game not found
  it("TC-EX-7.8: reject operations on non-existent game", async function () {
    await expect(arena.connect(p1).joinGame(999)).to.be.revertedWith("Game not found");
  });

  // Invalid price
  it("TC-EX-7.6/7.7: reject zero price", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await expect(arena.startGame(1, 0)).to.be.revertedWith("Invalid price");
    await arena.startGame(1, 6700000);
    await expect(arena.settleGame(1, 0)).to.be.revertedWith("Invalid price");
  });

  // Cannot settle twice
  it("TC-EX-7.4: cannot settle twice", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1);
    await arena.connect(p2).predict(1, 2);
    await arena.settleGame(1, 6800000);
    await expect(arena.settleGame(1, 6900000)).to.be.revertedWith("Game not active");
  });

  // Cannot join active/settled/cancelled game
  it("TC-EX-7.1/7.2/7.3: reject join on non-created game", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await expect(arena.connect(p3).joinGame(1)).to.be.revertedWith("Game not joinable");
  });

  // Cannot predict on non-active game
  it("TC-EX-7.2: reject predict on settled game", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1);
    await arena.connect(p2).predict(1, 2);
    await arena.settleGame(1, 6800000);
    // Create new game and try predict on old
    await expect(arena.connect(p1).predict(1, 2)).to.be.revertedWith("Game not active");
  });

  // Fee withdrawal
  it("TC-EX-Fee: withdraw accumulated fees", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1);
    await arena.connect(p2).predict(1, 2);
    await arena.settleGame(1, 6800000);

    const fees = await arena.totalFees();
    expect(fees).to.be.gt(0n);

    const balBefore = await usdc.balanceOf(owner.address);
    await arena.withdrawFees(owner.address);
    const balAfter = await usdc.balanceOf(owner.address);
    expect(balAfter - balBefore).to.equal(fees);
    expect(await arena.totalFees()).to.equal(0n);
  });

  // 3 players, 1 win 2 lose
  it("TC-6.8: 3-player 1 win 2 lose", async function () {
    await arena.createGame(3);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.connect(p3).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1); // win
    await arena.connect(p2).predict(1, 2); // lose
    await arena.connect(p3).predict(1, 2); // lose
    await arena.settleGame(1, 6800000);
    const r1 = await arena.getPlayerPrediction(1, p1.address);
    const r2 = await arena.getPlayerPrediction(1, p2.address);
    const r3 = await arena.getPlayerPrediction(1, p3.address);
    // Winner: 950000 + 2*950000 = 2850000
    expect(r1[2]).to.equal(2850000n);
    expect(r2[2]).to.equal(0n);
    expect(r3[2]).to.equal(0n);
    const fees = await arena.totalFees();
    expect(r1[2] + r2[2] + r3[2] + fees).to.equal(3000000n);
  });
});
