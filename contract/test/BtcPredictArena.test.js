const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BtcPredictArena", function () {
  let arena, usdc, owner, p1, p2;
  const ENTRY = ethers.parseUnits("1", 6);
  const MINT = ethers.parseUnits("1000", 6);

  beforeEach(async function () {
    [owner, p1, p2] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockUSDC");
    usdc = await MockERC20.deploy(); await usdc.waitForDeployment();
    const Arena = await ethers.getContractFactory("BtcPredictArena");
    arena = await Arena.deploy(await usdc.getAddress()); await arena.waitForDeployment();
    const addr = await arena.getAddress();
    for (const p of [p1, p2]) { await usdc.mint(p.address, MINT); await usdc.connect(p).approve(addr, MINT); }
  });

  it("should create game and join", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    const info = await arena.getGameInfo(1);
    expect(info[3]).to.equal(2n); // playerCount
  });

  it("should reject joining full game", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    const [,,, p3] = await ethers.getSigners();
    await usdc.mint(p3.address, MINT);
    await usdc.connect(p3).approve(await arena.getAddress(), MINT);
    await expect(arena.connect(p3).joinGame(1)).to.be.revertedWith("Game full");
  });

  it("should settle: 1 winner, 1 loser", async function () {
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
  });

  it("should settle: both correct", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    await arena.connect(p2).joinGame(1);
    await arena.startGame(1, 6700000);
    await arena.connect(p1).predict(1, 1);
    await arena.connect(p2).predict(1, 1);
    await arena.settleGame(1, 6800000);
    const pp1 = await arena.getPlayerPrediction(1, p1.address);
    expect(pp1[2]).to.equal(950000n); // 0.95 USDC
  });

  it("should cancel and refund", async function () {
    await arena.createGame(2);
    await arena.connect(p1).joinGame(1);
    const bal1 = await usdc.balanceOf(p1.address);
    await arena.cancelGame(1);
    const bal2 = await usdc.balanceOf(p1.address);
    expect(bal2 - bal1).to.equal(ENTRY);
  });

  it("should claim reward", async function () {
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
});
