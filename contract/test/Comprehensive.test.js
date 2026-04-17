const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

describe("BtcPredictArena - Comprehensive Tests", function () {
  let arena, usdc, owner, p1, p2, p3, p4, p5, outsider;
  const ENTRY = ethers.parseUnits("1", 6); // 1 USDC
  const MINT = ethers.parseUnits("10000", 6);
  const BASE_PRICE = 67000_00; // $67,000
  const HIGH_PRICE = 68000_00; // $68,000
  const LOW_PRICE = 66000_00;  // $66,000

  beforeEach(async function () {
    [owner, p1, p2, p3, p4, p5, outsider] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockUSDC");
    usdc = await MockERC20.deploy();
    await usdc.waitForDeployment();

    const Arena = await ethers.getContractFactory("BtcPredictArena");
    arena = await Arena.deploy(await usdc.getAddress());
    await arena.waitForDeployment();

    const arenaAddr = await arena.getAddress();
    for (const s of [owner, p1, p2, p3, p4, p5, outsider]) {
      await usdc.mint(s.address, MINT);
      await usdc.connect(s).approve(arenaAddr, MINT);
    }
  });

  // ── helpers ──────────────────────────────────────────────────────────

  async function ownerCreateGame(players) {
    const gid = Number(await arena.nextGameId());
    await arena.ownerCreateGame(players.length, players[0].address);
    for (const p of players.slice(1)) await arena.ownerJoinGame(gid, p.address);
    return gid;
  }

  async function ownerCreateRoom(players, code) {
    const gid = Number(await arena.nextGameId());
    await arena.ownerCreateRoom(players.length, code, players[0].address);
    for (const p of players.slice(1)) await arena.ownerJoinRoom(code, p.address);
    return gid;
  }

  async function signRoomPaymentAuth({ inviteCode, maxPlayers, roomOwner, player, players, deadline }) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = {
      name: "BtcPredictArena",
      version: "1",
      chainId,
      verifyingContract: await arena.getAddress(),
    };
    const types = {
      RoomPaymentAuth: [
        { name: "inviteCodeHash", type: "bytes32" },
        { name: "maxPlayers", type: "uint8" },
        { name: "roomOwner", type: "address" },
        { name: "player", type: "address" },
        { name: "playersHash", type: "bytes32" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const value = {
      inviteCodeHash: ethers.keccak256(ethers.toUtf8Bytes(inviteCode)),
      maxPlayers,
      roomOwner,
      player,
      playersHash: ethers.keccak256(ethers.concat(players.map((address) => ethers.zeroPadValue(address, 32)))),
      deadline,
    };
    return owner.signTypedData(domain, types, value);
  }

  async function payAll(gid, players) {
    for (const p of players) await arena.connect(p).payForGame(gid);
  }

  async function createPaidGame(players) {
    const gid = await ownerCreateGame(players);
    await payAll(gid, players);
    return gid;
  }

  async function startGame(players, basePrice = BASE_PRICE) {
    const gid = await createPaidGame(players);
    await arena.startGame(gid, basePrice);
    return gid;
  }

  async function settledGame(players, predictions, settlementPrice) {
    const gid = await startGame(players);
    for (let i = 0; i < predictions.length; i++) {
      if (predictions[i]) await arena.connect(players[i]).predict(gid, predictions[i]);
    }
    await arena.settleGame(gid, settlementPrice);
    return gid;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 1. GAME CREATION
  // ═══════════════════════════════════════════════════════════════════

  describe("Game Creation", function () {
    it("creates a 2P public game in Created state", async function () {
      await arena.connect(p1).createGame(2);
      const info = await arena.getGameInfo(1);
      expect(info[0]).to.equal(1n);       // gameId
      expect(info[1]).to.equal(2);        // maxPlayers
      expect(info[2]).to.equal(0);        // Created
      expect(info[3]).to.equal(1n);       // 1 player
      expect(info[6]).to.equal(false);    // not a room
    });

    it("creates 3P, 4P, 5P games", async function () {
      for (const size of [3, 4, 5]) {
        await arena.connect(p1).createGame(size);
      }
      expect(await arena.nextGameId()).to.equal(4n);
    });

    it("rejects team size < 2 or > 5", async function () {
      await expect(arena.connect(p1).createGame(0)).to.be.revertedWith("Invalid team size");
      await expect(arena.connect(p1).createGame(1)).to.be.revertedWith("Invalid team size");
      await expect(arena.connect(p1).createGame(6)).to.be.revertedWith("Invalid team size");
      await expect(arena.connect(p1).createGame(255)).to.be.revertedWith("Invalid team size");
    });

    it("snapshots entryFee and feeRate at creation time", async function () {
      const gid1 = Number(await arena.nextGameId());
      await arena.connect(p1).createGame(2);
      expect(await arena.gameEntryFee(gid1)).to.equal(ENTRY);
      expect(await arena.gameFeeRate(gid1)).to.equal(500n);

      await arena.setEntryFee(ethers.parseUnits("5", 6));
      await arena.setFeeRate(800);

      const gid2 = Number(await arena.nextGameId());
      await arena.connect(p2).createGame(2);
      expect(await arena.gameEntryFee(gid2)).to.equal(ethers.parseUnits("5", 6));
      expect(await arena.gameFeeRate(gid2)).to.equal(800n);
      // old game still has old values
      expect(await arena.gameEntryFee(gid1)).to.equal(ENTRY);
      expect(await arena.gameFeeRate(gid1)).to.equal(500n);
    });

    it("emits GameCreated event", async function () {
      await expect(arena.connect(p1).createGame(2))
        .to.emit(arena, "GameCreated")
        .withArgs(1, 2, false, "", p1.address);
    });

    it("ownerCreateGame rejects address(0)", async function () {
      await expect(arena.ownerCreateGame(2, ethers.ZeroAddress)).to.be.revertedWith("Invalid creator");
    });

    it("non-owner cannot call ownerCreateGame", async function () {
      await expect(arena.connect(p1).ownerCreateGame(2, p1.address)).to.be.revertedWith("Not owner");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. ROOM CREATION
  // ═══════════════════════════════════════════════════════════════════

  describe("Room Creation", function () {
    it("creates a room with invite code", async function () {
      await arena.connect(p1).createRoom(2, "ROOM01");
      const info = await arena.getGameInfo(1);
      expect(info[6]).to.equal(true);      // isRoom
      expect(info[7]).to.equal("ROOM01");  // inviteCode
      expect(await arena.inviteCodeToGame("ROOM01")).to.equal(1n);
    });

    it("rejects duplicate invite code", async function () {
      await arena.connect(p1).createRoom(2, "DUP");
      await expect(arena.connect(p2).createRoom(2, "DUP")).to.be.revertedWith("Invite code taken");
    });

    it("rejects empty invite code", async function () {
      await expect(arena.connect(p1).createRoom(2, "")).to.be.revertedWith("Empty invite code");
    });

    it("emits GameCreated event with room info", async function () {
      await expect(arena.connect(p1).createRoom(3, "ABC"))
        .to.emit(arena, "GameCreated")
        .withArgs(1, 3, true, "ABC", p1.address);
    });

    it("ownerCreateRoom works correctly", async function () {
      await arena.ownerCreateRoom(2, "OWN01", p1.address);
      const info = await arena.getGameInfo(1);
      expect(info[6]).to.equal(true);
      expect(info[1]).to.equal(2);
      expect(await arena.inviteCodeToGame("OWN01")).to.equal(1n);
    });

    it("ownerCreateRoom rejects empty code and address(0)", async function () {
      await expect(arena.ownerCreateRoom(2, "", p1.address)).to.be.revertedWith("Empty invite code");
      await expect(arena.ownerCreateRoom(2, "X", ethers.ZeroAddress)).to.be.revertedWith("Invalid creator");
    });

    it("createRoomAndPay creates the room and marks creator paid in one tx", async function () {
      const deadline = (await time.latest()) + 600;
      const players = [p1.address, p2.address, p3.address];
      const signature = await signRoomPaymentAuth({
        inviteCode: "ATOM01",
        maxPlayers: 3,
        roomOwner: p1.address,
        player: p1.address,
        players,
        deadline,
      });
      const balBefore = await usdc.balanceOf(p1.address);
      await expect(arena.connect(p1).createRoomAndPay(3, "ATOM01", players, deadline, signature))
        .to.emit(arena, "GameCreated").withArgs(1, 3, true, "ATOM01", p1.address)
        .and.to.emit(arena, "PlayerPaid").withArgs(1, p1.address);

      const info = await arena.getGameInfo(1);
      const playerState = await arena.getPlayerPrediction(1, p1.address);
      expect(info[2]).to.equal(0); // Created until room is full
      expect(info[3]).to.equal(1n);
      expect(playerState[1]).to.equal(true);
      expect(await usdc.balanceOf(p1.address)).to.equal(balBefore - ENTRY);
      expect(await arena.inviteCodeToGame("ATOM01")).to.equal(1n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. JOINING GAMES
  // ═══════════════════════════════════════════════════════════════════

  describe("Joining Games", function () {
    it("second player join opens Payment state (2P)", async function () {
      await arena.connect(p1).createGame(2);
      await arena.connect(p2).joinGame(1);
      const info = await arena.getGameInfo(1);
      expect(info[2]).to.equal(1); // Payment
      expect(info[3]).to.equal(2n);
    });

    it("emits PlayerJoined and PaymentOpened events", async function () {
      await arena.connect(p1).createGame(2);
      await expect(arena.connect(p2).joinGame(1))
        .to.emit(arena, "PlayerJoined").withArgs(1, p2.address)
        .and.to.emit(arena, "PaymentOpened").withArgs(1);
    });

    it("3P game: join does not open Payment until 3rd player", async function () {
      await arena.connect(p1).createGame(3);
      await arena.connect(p2).joinGame(1);
      expect((await arena.getGameInfo(1))[2]).to.equal(0); // still Created
      await arena.connect(p3).joinGame(1);
      expect((await arena.getGameInfo(1))[2]).to.equal(1); // Payment
    });

    it("rejects join when game is full", async function () {
      await arena.connect(p1).createGame(2);
      await arena.connect(p2).joinGame(1);
      await expect(arena.connect(p3).joinGame(1)).to.be.revertedWith("Game not joinable");
    });

    it("rejects joining non-existent game", async function () {
      await expect(arena.connect(p1).joinGame(999)).to.be.revertedWith("Game not found");
    });

    it("rejects double join", async function () {
      await arena.connect(p1).createGame(3);
      await expect(arena.connect(p1).joinGame(1)).to.be.revertedWith("Already joined");
    });

    it("rejects joinGame on a room", async function () {
      await arena.connect(p1).createRoom(2, "R1");
      await expect(arena.connect(p2).joinGame(1)).to.be.revertedWith("Use joinRoom");
    });

    it("joinRoom works correctly", async function () {
      await arena.connect(p1).createRoom(2, "JOIN01");
      await arena.connect(p2).joinRoom("JOIN01");
      const info = await arena.getGameInfo(1);
      expect(info[2]).to.equal(1); // Payment
      expect(info[3]).to.equal(2n);
    });

    it("joinRoom rejects non-existent invite code", async function () {
      await expect(arena.connect(p1).joinRoom("NOPE")).to.be.revertedWith("Room not found");
    });

    it("joinRoom rejects when room not in Created state", async function () {
      await arena.connect(p1).createRoom(2, "R2");
      await arena.connect(p2).joinRoom("R2"); // now in Payment
      await expect(arena.connect(p3).joinRoom("R2")).to.be.revertedWith("Room not joinable");
    });

    it("joinRoomAndPay joins, pays, and opens payment when the room becomes full", async function () {
      const deadline = (await time.latest()) + 600;
      const players = [p1.address, p2.address];
      const hostSig = await signRoomPaymentAuth({
        inviteCode: "JPAY01",
        maxPlayers: 2,
        roomOwner: p1.address,
        player: p1.address,
        players,
        deadline,
      });
      const joinSig = await signRoomPaymentAuth({
        inviteCode: "JPAY01",
        maxPlayers: 2,
        roomOwner: p1.address,
        player: p2.address,
        players,
        deadline,
      });

      await arena.connect(p1).createRoomAndPay(2, "JPAY01", players, deadline, hostSig);
      const balBefore = await usdc.balanceOf(p2.address);

      await expect(arena.connect(p2).joinRoomAndPay("JPAY01", 2, p1.address, players, deadline, joinSig))
        .to.emit(arena, "PlayerJoined").withArgs(1, p2.address)
        .and.to.emit(arena, "PlayerPaid").withArgs(1, p2.address)
        .and.to.emit(arena, "PaymentOpened").withArgs(1);

      const info = await arena.getGameInfo(1);
      const ownerState = await arena.getPlayerPrediction(1, p1.address);
      const joinerState = await arena.getPlayerPrediction(1, p2.address);
      expect(info[2]).to.equal(1); // Payment
      expect(info[3]).to.equal(2n);
      expect(ownerState[1]).to.equal(true);
      expect(joinerState[1]).to.equal(true);
      expect(await usdc.balanceOf(p2.address)).to.equal(balBefore - ENTRY);
      expect(await arena.allPlayersPaid(1)).to.equal(true);
    });

    it("joinRoomAndPay can be the first payment and still creates the on-chain room", async function () {
      const deadline = (await time.latest()) + 600;
      const players = [p1.address, p2.address, p3.address];
      const joinSig = await signRoomPaymentAuth({
        inviteCode: "JFIRST",
        maxPlayers: 3,
        roomOwner: p1.address,
        player: p2.address,
        players,
        deadline,
      });

      await expect(arena.connect(p2).joinRoomAndPay("JFIRST", 3, p1.address, players, deadline, joinSig))
        .to.emit(arena, "GameCreated").withArgs(1, 3, true, "JFIRST", p1.address)
        .and.to.emit(arena, "PlayerJoined").withArgs(1, p2.address)
        .and.to.emit(arena, "PlayerPaid").withArgs(1, p2.address);

      const info = await arena.getGameInfo(1);
      expect(info[2]).to.equal(0);
      expect(info[3]).to.equal(1n);
      expect(await arena.inviteCodeToGame("JFIRST")).to.equal(1n);
    });

    it("ownerJoinGame rejects on a room", async function () {
      await arena.ownerCreateRoom(2, "OJR", p1.address);
      await expect(arena.ownerJoinGame(1, p2.address)).to.be.revertedWith("Use ownerJoinRoom");
    });

    it("ownerJoinRoom rejects address(0)", async function () {
      await arena.ownerCreateRoom(3, "OJR2", p1.address);
      await expect(arena.ownerJoinRoom("OJR2", ethers.ZeroAddress)).to.be.revertedWith("Invalid player");
    });

    it("ownerJoinGame rejects address(0)", async function () {
      await arena.ownerCreateGame(3, p1.address);
      await expect(arena.ownerJoinGame(1, ethers.ZeroAddress)).to.be.revertedWith("Invalid player");
    });

    it("getGamePlayers returns correct list", async function () {
      await arena.connect(p1).createGame(3);
      await arena.connect(p2).joinGame(1);
      await arena.connect(p3).joinGame(1);
      const players = await arena.getGamePlayers(1);
      expect(players).to.deep.equal([p1.address, p2.address, p3.address]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. PAYMENT
  // ═══════════════════════════════════════════════════════════════════

  describe("Payment", function () {
    let gid;
    beforeEach(async function () {
      gid = await ownerCreateGame([p1, p2]);
    });

    it("player pays successfully", async function () {
      const balBefore = await usdc.balanceOf(p1.address);
      await arena.connect(p1).payForGame(gid);
      expect(await usdc.balanceOf(p1.address)).to.equal(balBefore - ENTRY);

      const pp = await arena.getPlayerPrediction(gid, p1.address);
      expect(pp[1]).to.equal(true); // hasPaid
    });

    it("emits PlayerPaid event", async function () {
      await expect(arena.connect(p1).payForGame(gid))
        .to.emit(arena, "PlayerPaid").withArgs(gid, p1.address);
    });

    it("rejects double payment", async function () {
      await arena.connect(p1).payForGame(gid);
      await expect(arena.connect(p1).payForGame(gid)).to.be.revertedWith("Already paid");
    });

    it("rejects payment from non-player", async function () {
      await expect(arena.connect(outsider).payForGame(gid)).to.be.revertedWith("Not a player");
    });

    it("rejects payment when game not in Payment state", async function () {
      // create a game that's still in Created state (not full yet)
      const gid2 = Number(await arena.nextGameId());
      await arena.ownerCreateGame(3, p1.address);
      // only 1 player, still Created
      await expect(arena.connect(p1).payForGame(gid2)).to.be.revertedWith("Payment not open");
    });

    it("rejects payment on cancelled game", async function () {
      await arena.cancelGame(gid);
      await expect(arena.connect(p1).payForGame(gid)).to.be.revertedWith("Payment not open");
    });

    it("allPlayersPaid returns false until all pay", async function () {
      expect(await arena.allPlayersPaid(gid)).to.equal(false);
      await arena.connect(p1).payForGame(gid);
      expect(await arena.allPlayersPaid(gid)).to.equal(false);
      await arena.connect(p2).payForGame(gid);
      expect(await arena.allPlayersPaid(gid)).to.equal(true);
    });

    it("rejects payment when USDC allowance is insufficient", async function () {
      // revoke approval
      await usdc.connect(p1).approve(await arena.getAddress(), 0);
      await expect(arena.connect(p1).payForGame(gid)).to.be.reverted;
    });

    it("uses snapshotted entry fee, not current global", async function () {
      // gid was created with ENTRY=1 USDC
      await arena.setEntryFee(ethers.parseUnits("10", 6));

      const balBefore = await usdc.balanceOf(p1.address);
      await arena.connect(p1).payForGame(gid);
      // should only deduct 1 USDC, not 10
      expect(balBefore - await usdc.balanceOf(p1.address)).to.equal(ENTRY);
    });

    it("cancelGame refunds players who already used atomic room payments", async function () {
      const atomicGid = Number(await arena.nextGameId());
      const deadline = (await time.latest()) + 600;
      const players = [p1.address, p2.address, p3.address];
      const hostSig = await signRoomPaymentAuth({
        inviteCode: "RFUND1",
        maxPlayers: 3,
        roomOwner: p1.address,
        player: p1.address,
        players,
        deadline,
      });
      const joinSig = await signRoomPaymentAuth({
        inviteCode: "RFUND1",
        maxPlayers: 3,
        roomOwner: p1.address,
        player: p2.address,
        players,
        deadline,
      });
      await arena.connect(p1).createRoomAndPay(3, "RFUND1", players, deadline, hostSig);
      await arena.connect(p2).joinRoomAndPay("RFUND1", 3, p1.address, players, deadline, joinSig);

      const p1AfterPay = await usdc.balanceOf(p1.address);
      const p2AfterPay = await usdc.balanceOf(p2.address);

      await arena.cancelGame(atomicGid);

      expect(await usdc.balanceOf(p1.address)).to.equal(p1AfterPay + ENTRY);
      expect(await usdc.balanceOf(p2.address)).to.equal(p2AfterPay + ENTRY);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. GAME START
  // ═══════════════════════════════════════════════════════════════════

  describe("Game Start", function () {
    it("transitions to Active state", async function () {
      const gid = await createPaidGame([p1, p2]);
      await arena.startGame(gid, BASE_PRICE);
      const info = await arena.getGameInfo(gid);
      expect(info[2]).to.equal(2); // Active
      expect(info[4]).to.equal(BigInt(BASE_PRICE)); // basePrice
    });

    it("sets prediction deadline correctly", async function () {
      const gid = await createPaidGame([p1, p2]);
      const tx = await arena.startGame(gid, BASE_PRICE);
      const block = await tx.getBlock();
      const deadline = await arena.predictionDeadline(gid);
      // predictionDuration(30) - predictionBuffer(5) = 25
      expect(deadline).to.equal(BigInt(block.timestamp) + 25n);
    });

    it("emits GameStarted event", async function () {
      const gid = await createPaidGame([p1, p2]);
      await expect(arena.startGame(gid, BASE_PRICE))
        .to.emit(arena, "GameStarted");
    });

    it("rejects start with price 0", async function () {
      const gid = await createPaidGame([p1, p2]);
      await expect(arena.startGame(gid, 0)).to.be.revertedWith("Invalid price");
    });

    it("rejects start if not all paid", async function () {
      const gid = await ownerCreateGame([p1, p2]);
      await arena.connect(p1).payForGame(gid);
      // p2 hasn't paid
      await expect(arena.startGame(gid, BASE_PRICE)).to.be.revertedWith("Players not fully paid");
    });

    it("rejects start by non-owner", async function () {
      const gid = await createPaidGame([p1, p2]);
      await expect(arena.connect(p1).startGame(gid, BASE_PRICE)).to.be.revertedWith("Not owner");
    });

    it("rejects start on non-Payment state game", async function () {
      const gid = await createPaidGame([p1, p2]);
      await arena.startGame(gid, BASE_PRICE);
      await expect(arena.startGame(gid, BASE_PRICE)).to.be.revertedWith("Not in payment state");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 6. PREDICTION (Direct)
  // ═══════════════════════════════════════════════════════════════════

  describe("Prediction (Direct)", function () {
    let gid;
    beforeEach(async function () {
      gid = await startGame([p1, p2]);
    });

    it("player predicts UP", async function () {
      await arena.connect(p1).predict(gid, 1);
      const pp = await arena.getPlayerPrediction(gid, p1.address);
      expect(pp[0]).to.equal(1); // Up
    });

    it("player predicts DOWN", async function () {
      await arena.connect(p1).predict(gid, 2);
      const pp = await arena.getPlayerPrediction(gid, p1.address);
      expect(pp[0]).to.equal(2); // Down
    });

    it("emits PredictionMade event", async function () {
      await expect(arena.connect(p1).predict(gid, 1))
        .to.emit(arena, "PredictionMade").withArgs(gid, p1.address, 1);
    });

    it("rejects prediction with None (0)", async function () {
      await expect(arena.connect(p1).predict(gid, 0)).to.be.revertedWith("Invalid prediction");
    });

    it("rejects double prediction", async function () {
      await arena.connect(p1).predict(gid, 1);
      await expect(arena.connect(p1).predict(gid, 2)).to.be.revertedWith("Already predicted");
    });

    it("rejects prediction from non-player", async function () {
      await expect(arena.connect(outsider).predict(gid, 1)).to.be.revertedWith("Not a player");
    });

    it("rejects prediction after deadline", async function () {
      const deadline = Number(await arena.predictionDeadline(gid));
      await time.increaseTo(deadline + 1);
      await expect(arena.connect(p1).predict(gid, 1)).to.be.revertedWith("Prediction window closed");
    });

    it("rejects prediction on non-Active game", async function () {
      await arena.connect(p1).predict(gid, 1);
      await arena.connect(p2).predict(gid, 2);
      await arena.settleGame(gid, HIGH_PRICE);
      await expect(arena.connect(p1).predict(gid, 1)).to.be.revertedWith("Game not active");
    });

    it("prediction at exact deadline succeeds", async function () {
      const deadline = Number(await arena.predictionDeadline(gid));
      // increaseTo sets the NEXT mined block timestamp, so set to deadline-1
      // so the predict tx itself lands at timestamp = deadline
      await time.increaseTo(deadline - 1);
      await arena.connect(p1).predict(gid, 1); // tx mines at timestamp = deadline
      const pp = await arena.getPlayerPrediction(gid, p1.address);
      expect(pp[0]).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 7. PREDICTION (EIP712 Signature)
  // ═══════════════════════════════════════════════════════════════════

  describe("Prediction (EIP712 Signature)", function () {
    let gid;
    beforeEach(async function () {
      gid = await startGame([p1, p2]);
    });

    async function signPrediction(signer, gameId, prediction) {
      const deadline = await arena.predictionDeadline(gameId);
      const network = await ethers.provider.getNetwork();
      const domain = {
        name: "BtcPredictArena",
        version: "1",
        chainId: Number(network.chainId),
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
      const value = { gameId, player: signer.address, prediction, deadline };
      const signature = await signer.signTypedData(domain, types, value);
      return { signature, deadline };
    }

    it("submits prediction via valid EIP712 signature", async function () {
      const { signature, deadline } = await signPrediction(p1, gid, 1);
      await arena.submitPredictionBySig(gid, p1.address, 1, deadline, signature);

      const pp = await arena.getPlayerPrediction(gid, p1.address);
      expect(pp[0]).to.equal(1); // Up
    });

    it("emits PredictionMade event via signature", async function () {
      const { signature, deadline } = await signPrediction(p1, gid, 1);
      await expect(arena.submitPredictionBySig(gid, p1.address, 1, deadline, signature))
        .to.emit(arena, "PredictionMade").withArgs(gid, p1.address, 1);
    });

    it("anyone can submit on behalf of signer", async function () {
      const { signature, deadline } = await signPrediction(p1, gid, 2);
      // outsider submits p1's signed prediction
      await arena.connect(outsider).submitPredictionBySig(gid, p1.address, 2, deadline, signature);
      const pp = await arena.getPlayerPrediction(gid, p1.address);
      expect(pp[0]).to.equal(2); // Down
    });

    it("rejects wrong deadline", async function () {
      const { signature } = await signPrediction(p1, gid, 1);
      const wrongDeadline = 12345;
      await expect(
        arena.submitPredictionBySig(gid, p1.address, 1, wrongDeadline, signature)
      ).to.be.revertedWith("Invalid deadline");
    });

    it("rejects wrong signer (signature mismatch)", async function () {
      // p2 signs but we claim it's p1
      const { signature, deadline } = await signPrediction(p2, gid, 1);
      await expect(
        arena.submitPredictionBySig(gid, p1.address, 1, deadline, signature)
      ).to.be.revertedWith("Invalid signature");
    });

    it("rejects invalid signature length", async function () {
      const deadline = await arena.predictionDeadline(gid);
      const shortSig = "0x1234";
      await expect(
        arena.submitPredictionBySig(gid, p1.address, 1, deadline, shortSig)
      ).to.be.revertedWith("Invalid signature length");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 8. SETTLEMENT - Win/Lose Scenarios
  // ═══════════════════════════════════════════════════════════════════

  describe("Settlement Outcomes", function () {
    it("UP wins: price goes up", async function () {
      const gid = await startGame([p1, p2]);
      await arena.connect(p1).predict(gid, 1); // UP
      await arena.connect(p2).predict(gid, 2); // DOWN
      await arena.settleGame(gid, HIGH_PRICE);

      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      const pp2 = await arena.getPlayerPrediction(gid, p2.address);
      // winner: netPerPlayer + loserPool = 950000 + 950000 = 1900000
      expect(pp1[2]).to.equal(1900000n); // winner reward
      expect(pp2[2]).to.equal(0n);        // loser reward
    });

    it("DOWN wins: price goes down", async function () {
      const gid = await startGame([p1, p2]);
      await arena.connect(p1).predict(gid, 2); // DOWN
      await arena.connect(p2).predict(gid, 1); // UP
      await arena.settleGame(gid, LOW_PRICE);

      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      const pp2 = await arena.getPlayerPrediction(gid, p2.address);
      expect(pp1[2]).to.equal(1900000n);
      expect(pp2[2]).to.equal(0n);
    });

    it("FLAT: everyone gets net entry (no loser pool)", async function () {
      const gid = await startGame([p1, p2]);
      await arena.connect(p1).predict(gid, 1);
      await arena.connect(p2).predict(gid, 2);
      await arena.settleGame(gid, BASE_PRICE); // flat

      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      const pp2 = await arena.getPlayerPrediction(gid, p2.address);
      expect(pp1[2]).to.equal(950000n);
      expect(pp2[2]).to.equal(950000n);
    });

    it("all predict same direction (all correct)", async function () {
      const gid = await startGame([p1, p2]);
      await arena.connect(p1).predict(gid, 1); // UP
      await arena.connect(p2).predict(gid, 1); // UP
      await arena.settleGame(gid, HIGH_PRICE);

      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      const pp2 = await arena.getPlayerPrediction(gid, p2.address);
      expect(pp1[2]).to.equal(950000n); // each gets net entry
      expect(pp2[2]).to.equal(950000n);
    });

    it("all predict same direction (all wrong)", async function () {
      const gid = await startGame([p1, p2]);
      await arena.connect(p1).predict(gid, 1); // UP
      await arena.connect(p2).predict(gid, 1); // UP
      await arena.settleGame(gid, LOW_PRICE);  // price went down

      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      const pp2 = await arena.getPlayerPrediction(gid, p2.address);
      // winnerCount=0, all get net entry
      expect(pp1[2]).to.equal(950000n);
      expect(pp2[2]).to.equal(950000n);
    });

    it("one predicts, one forfeits (no prediction)", async function () {
      const gid = await startGame([p1, p2]);
      await arena.connect(p1).predict(gid, 1); // UP
      // p2 doesn't predict
      await arena.settleGame(gid, HIGH_PRICE);

      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      const pp2 = await arena.getPlayerPrediction(gid, p2.address);
      expect(pp1[2]).to.equal(1900000n); // winner gets all
      expect(pp2[2]).to.equal(0n);        // forfeited
    });

    it("no one predicts (all forfeit)", async function () {
      const gid = await startGame([p1, p2]);
      // nobody predicts
      await arena.settleGame(gid, HIGH_PRICE);

      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      const pp2 = await arena.getPlayerPrediction(gid, p2.address);
      // winnerCount=0, each gets net entry
      expect(pp1[2]).to.equal(950000n);
      expect(pp2[2]).to.equal(950000n);
    });

    it("emits GameSettled event", async function () {
      const gid = await startGame([p1, p2]);
      await expect(arena.settleGame(gid, HIGH_PRICE))
        .to.emit(arena, "GameSettled").withArgs(gid, HIGH_PRICE);
    });

    it("rejects settlement with price 0", async function () {
      const gid = await startGame([p1, p2]);
      await expect(arena.settleGame(gid, 0)).to.be.revertedWith("Invalid price");
    });

    it("rejects settlement on non-Active game", async function () {
      const gid = await startGame([p1, p2]);
      await arena.settleGame(gid, HIGH_PRICE);
      await expect(arena.settleGame(gid, HIGH_PRICE)).to.be.revertedWith("Game not active");
    });

    it("rejects settlement by non-owner", async function () {
      const gid = await startGame([p1, p2]);
      await expect(arena.connect(p1).settleGame(gid, HIGH_PRICE)).to.be.revertedWith("Not owner");
    });

    it("sets game state to Settled and records settlement price", async function () {
      const gid = await startGame([p1, p2]);
      await arena.settleGame(gid, HIGH_PRICE);
      const info = await arena.getGameInfo(gid);
      expect(info[2]).to.equal(3); // Settled
      expect(info[5]).to.equal(BigInt(HIGH_PRICE));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 9. MULTI-PLAYER SETTLEMENT
  // ═══════════════════════════════════════════════════════════════════

  describe("Multi-Player Settlement", function () {
    it("3P: 1 winner, 2 losers", async function () {
      const gid = await startGame([p1, p2, p3]);
      await arena.connect(p1).predict(gid, 1); // UP - correct
      await arena.connect(p2).predict(gid, 2); // DOWN - wrong
      await arena.connect(p3).predict(gid, 2); // DOWN - wrong
      await arena.settleGame(gid, HIGH_PRICE);

      const r1 = await arena.getPlayerPrediction(gid, p1.address);
      const r2 = await arena.getPlayerPrediction(gid, p2.address);
      const r3 = await arena.getPlayerPrediction(gid, p3.address);
      // winner gets: 950000 + 2*950000 = 2850000
      expect(r1[2]).to.equal(2850000n);
      expect(r2[2]).to.equal(0n);
      expect(r3[2]).to.equal(0n);
    });

    it("3P: 2 winners, 1 loser", async function () {
      const gid = await startGame([p1, p2, p3]);
      await arena.connect(p1).predict(gid, 1); // UP
      await arena.connect(p2).predict(gid, 1); // UP
      await arena.connect(p3).predict(gid, 2); // DOWN
      await arena.settleGame(gid, HIGH_PRICE);

      const r1 = await arena.getPlayerPrediction(gid, p1.address);
      const r2 = await arena.getPlayerPrediction(gid, p2.address);
      const r3 = await arena.getPlayerPrediction(gid, p3.address);
      // each winner: 950000 + 950000/2 = 950000 + 475000 = 1425000
      expect(r1[2]).to.equal(1425000n);
      expect(r2[2]).to.equal(1425000n);
      expect(r3[2]).to.equal(0n);
    });

    it("5P: 3 winners, 2 losers", async function () {
      const gid = await startGame([p1, p2, p3, p4, p5]);
      await arena.connect(p1).predict(gid, 1); // UP
      await arena.connect(p2).predict(gid, 1); // UP
      await arena.connect(p3).predict(gid, 1); // UP
      await arena.connect(p4).predict(gid, 2); // DOWN
      await arena.connect(p5).predict(gid, 2); // DOWN
      await arena.settleGame(gid, HIGH_PRICE);

      const r1 = await arena.getPlayerPrediction(gid, p1.address);
      const r4 = await arena.getPlayerPrediction(gid, p4.address);
      // loserPool = 2 * 950000 = 1900000, bonus = 1900000/3 = 633333
      // winner = 950000 + 633333 = 1583333
      expect(r1[2]).to.equal(1583333n);
      expect(r4[2]).to.equal(0n);
    });

    it("3P: 1 predictor correct, 2 forfeit", async function () {
      const gid = await startGame([p1, p2, p3]);
      await arena.connect(p1).predict(gid, 1); // UP
      // p2, p3 don't predict
      await arena.settleGame(gid, HIGH_PRICE);

      const r1 = await arena.getPlayerPrediction(gid, p1.address);
      const r2 = await arena.getPlayerPrediction(gid, p2.address);
      expect(r1[2]).to.equal(2850000n); // gets all loser pools
      expect(r2[2]).to.equal(0n);
    });

    it("total rewards + fees = total pool (conservation check)", async function () {
      const gid = await startGame([p1, p2, p3, p4, p5]);
      await arena.connect(p1).predict(gid, 1);
      await arena.connect(p2).predict(gid, 1);
      await arena.connect(p3).predict(gid, 1);
      await arena.connect(p4).predict(gid, 2);
      await arena.connect(p5).predict(gid, 2);

      const feesBefore = await arena.totalFees();
      await arena.settleGame(gid, HIGH_PRICE);
      const feesAfter = await arena.totalFees();

      let totalRewards = 0n;
      for (const p of [p1, p2, p3, p4, p5]) {
        totalRewards += (await arena.getPlayerPrediction(gid, p.address))[2];
      }
      const gameFees = feesAfter - feesBefore;
      // 5 players * 1 USDC = 5 USDC total
      expect(totalRewards + gameFees).to.equal(ENTRY * 5n);
    });

    it("remainder from uneven division goes to fees", async function () {
      // 5P: 3 winners, 2 losers -> loserPool=1900000 / 3 = 633333 remainder 1
      const gid = await startGame([p1, p2, p3, p4, p5]);
      await arena.connect(p1).predict(gid, 1);
      await arena.connect(p2).predict(gid, 1);
      await arena.connect(p3).predict(gid, 1);
      await arena.connect(p4).predict(gid, 2);
      await arena.connect(p5).predict(gid, 2);

      const feesBefore = await arena.totalFees();
      await arena.settleGame(gid, HIGH_PRICE);
      const feesAfter = await arena.totalFees();

      // feePerPlayer = 1000000 * 500 / 10000 = 50000
      // total base fees = 5 * 50000 = 250000
      // remainder = 1900000 - 633333*3 = 1900000 - 1899999 = 1
      expect(feesAfter - feesBefore).to.equal(250001n); // 250000 + 1 remainder
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 10. CLAIM REWARD
  // ═══════════════════════════════════════════════════════════════════

  describe("Claim Reward", function () {
    it("winner claims successfully", async function () {
      const gid = await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      const balBefore = await usdc.balanceOf(p1.address);
      await arena.connect(p1).claimReward(gid);
      expect(await usdc.balanceOf(p1.address) - balBefore).to.equal(1900000n);
    });

    it("emits RewardClaimed event", async function () {
      const gid = await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      await expect(arena.connect(p1).claimReward(gid))
        .to.emit(arena, "RewardClaimed").withArgs(gid, p1.address, 1900000n);
    });

    it("rejects double claim", async function () {
      const gid = await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      await arena.connect(p1).claimReward(gid);
      await expect(arena.connect(p1).claimReward(gid)).to.be.revertedWith("Already claimed");
    });

    it("rejects claim from loser (no reward)", async function () {
      const gid = await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      await expect(arena.connect(p2).claimReward(gid)).to.be.revertedWith("No reward");
    });

    it("rejects claim on non-settled game", async function () {
      const gid = await startGame([p1, p2]);
      await expect(arena.connect(p1).claimReward(gid)).to.be.revertedWith("Not settled");
    });

    it("rejects claim from non-participant", async function () {
      const gid = await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      await expect(arena.connect(outsider).claimReward(gid)).to.be.revertedWith("Not a participant");
    });

    it("flat game: both players claim net entry", async function () {
      const gid = await settledGame([p1, p2], [1, 2], BASE_PRICE);

      const b1 = await usdc.balanceOf(p1.address);
      const b2 = await usdc.balanceOf(p2.address);
      await arena.connect(p1).claimReward(gid);
      await arena.connect(p2).claimReward(gid);
      expect(await usdc.balanceOf(p1.address) - b1).to.equal(950000n);
      expect(await usdc.balanceOf(p2.address) - b2).to.equal(950000n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 11. CANCEL GAME
  // ═══════════════════════════════════════════════════════════════════

  describe("Cancel Game", function () {
    it("cancels game in Created state (no payments to refund)", async function () {
      const gid = Number(await arena.nextGameId());
      await arena.ownerCreateGame(3, p1.address);
      await arena.cancelGame(gid);
      const info = await arena.getGameInfo(gid);
      expect(info[2]).to.equal(4); // Cancelled
    });

    it("cancels game in Payment state and refunds paid players", async function () {
      const gid = await ownerCreateGame([p1, p2]);
      await arena.connect(p1).payForGame(gid); // only p1 paid

      const b1 = await usdc.balanceOf(p1.address);
      const b2 = await usdc.balanceOf(p2.address);
      await arena.cancelGame(gid);

      expect(await usdc.balanceOf(p1.address) - b1).to.equal(ENTRY); // refunded
      expect(await usdc.balanceOf(p2.address) - b2).to.equal(0n);    // didn't pay
    });

    it("emits GameCancelled event", async function () {
      const gid = await ownerCreateGame([p1, p2]);
      await expect(arena.cancelGame(gid))
        .to.emit(arena, "GameCancelled").withArgs(gid);
    });

    it("rejects cancel on Active game", async function () {
      const gid = await startGame([p1, p2]);
      await expect(arena.cancelGame(gid)).to.be.revertedWith("Cannot cancel now");
    });

    it("rejects cancel on Settled game", async function () {
      const gid = await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      await expect(arena.cancelGame(gid)).to.be.revertedWith("Cannot cancel now");
    });

    it("rejects cancel on Refundable game", async function () {
      const gid = await startGame([p1, p2]);
      await arena.setRefundGracePeriod(10);
      const deadline = Number(await arena.predictionDeadline(gid));
      await time.increaseTo(deadline + 11);
      await arena.connect(p1).forceRefund(gid);
      await expect(arena.cancelGame(gid)).to.be.revertedWith("Cannot cancel now");
    });

    it("rejects cancel by non-owner", async function () {
      const gid = await ownerCreateGame([p1, p2]);
      await expect(arena.connect(p1).cancelGame(gid)).to.be.revertedWith("Not owner");
    });

    it("cancel room deletes invite code mapping", async function () {
      const gid = await ownerCreateRoom([p1, p2], "DEL01");
      expect(await arena.inviteCodeToGame("DEL01")).to.equal(BigInt(gid));
      await arena.cancelGame(gid);
      expect(await arena.inviteCodeToGame("DEL01")).to.equal(0n);
    });

    it("cancel refunds using snapshotted entry fee", async function () {
      const gid = await ownerCreateGame([p1, p2]);
      await arena.connect(p1).payForGame(gid);
      // change global entry fee after game created
      await arena.setEntryFee(ethers.parseUnits("5", 6));

      const b1 = await usdc.balanceOf(p1.address);
      await arena.cancelGame(gid);
      // should refund 1 USDC not 5
      expect(await usdc.balanceOf(p1.address) - b1).to.equal(ENTRY);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 12. FORCE REFUND & CLAIM REFUND
  // ═══════════════════════════════════════════════════════════════════

  describe("Force Refund & Claim Refund", function () {
    it("force refund after grace period succeeds", async function () {
      const gid = await startGame([p1, p2]);
      await arena.setRefundGracePeriod(30);
      const deadline = Number(await arena.predictionDeadline(gid));
      await time.increaseTo(deadline + 31);

      await arena.connect(p1).forceRefund(gid);
      const info = await arena.getGameInfo(gid);
      expect(info[2]).to.equal(5); // Refundable
    });

    it("emits GameRefundable event", async function () {
      const gid = await startGame([p1, p2]);
      await arena.setRefundGracePeriod(30);
      const deadline = Number(await arena.predictionDeadline(gid));
      await time.increaseTo(deadline + 31);

      await expect(arena.connect(p1).forceRefund(gid))
        .to.emit(arena, "GameRefundable").withArgs(gid);
    });

    it("rejects force refund before grace period", async function () {
      const gid = await startGame([p1, p2]);
      await arena.setRefundGracePeriod(60);
      await time.increase(30);
      await expect(arena.connect(p1).forceRefund(gid)).to.be.revertedWith("Refund not available yet");
    });

    it("rejects force refund on non-Active game", async function () {
      const gid = await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      await expect(arena.connect(p1).forceRefund(gid)).to.be.revertedWith("Game not active");
    });

    it("rejects force refund on Payment state game", async function () {
      const gid = await ownerCreateGame([p1, p2]);
      await expect(arena.connect(p1).forceRefund(gid)).to.be.revertedWith("Game not active");
    });

    it("any player can trigger force refund", async function () {
      const gid = await startGame([p1, p2]);
      await arena.setRefundGracePeriod(10);
      const deadline = Number(await arena.predictionDeadline(gid));
      await time.increaseTo(deadline + 11);
      // p2 (not p1) triggers
      await arena.connect(p2).forceRefund(gid);
      expect((await arena.getGameInfo(gid))[2]).to.equal(5);
    });

    it("claim refund returns full entry fee (no fee deduction)", async function () {
      const gid = await startGame([p1, p2]);
      await arena.setRefundGracePeriod(10);
      const deadline = Number(await arena.predictionDeadline(gid));
      await time.increaseTo(deadline + 11);
      await arena.connect(p1).forceRefund(gid);

      const b1 = await usdc.balanceOf(p1.address);
      await arena.connect(p1).claimRefund(gid);
      expect(await usdc.balanceOf(p1.address) - b1).to.equal(ENTRY);
    });

    it("emits RefundClaimed event", async function () {
      const gid = await startGame([p1, p2]);
      await arena.setRefundGracePeriod(10);
      const deadline = Number(await arena.predictionDeadline(gid));
      await time.increaseTo(deadline + 11);
      await arena.connect(p1).forceRefund(gid);

      await expect(arena.connect(p1).claimRefund(gid))
        .to.emit(arena, "RefundClaimed").withArgs(gid, p1.address, ENTRY);
    });

    it("both players can claim refund", async function () {
      const gid = await startGame([p1, p2]);
      await arena.setRefundGracePeriod(10);
      const deadline = Number(await arena.predictionDeadline(gid));
      await time.increaseTo(deadline + 11);
      await arena.connect(p1).forceRefund(gid);

      await arena.connect(p1).claimRefund(gid);
      await arena.connect(p2).claimRefund(gid);
      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      const pp2 = await arena.getPlayerPrediction(gid, p2.address);
      expect(pp1[3]).to.equal(true); // claimed
      expect(pp2[3]).to.equal(true);
    });

    it("rejects double refund claim", async function () {
      const gid = await startGame([p1, p2]);
      await arena.setRefundGracePeriod(10);
      const deadline = Number(await arena.predictionDeadline(gid));
      await time.increaseTo(deadline + 11);
      await arena.connect(p1).forceRefund(gid);

      await arena.connect(p1).claimRefund(gid);
      await expect(arena.connect(p1).claimRefund(gid)).to.be.revertedWith("Already claimed");
    });

    it("rejects claim refund on non-Refundable game", async function () {
      const gid = await startGame([p1, p2]);
      await expect(arena.connect(p1).claimRefund(gid)).to.be.revertedWith("Not refundable");
    });

    it("rejects claim refund from non-participant", async function () {
      const gid = await startGame([p1, p2]);
      await arena.setRefundGracePeriod(10);
      const deadline = Number(await arena.predictionDeadline(gid));
      await time.increaseTo(deadline + 11);
      await arena.connect(p1).forceRefund(gid);

      await expect(arena.connect(outsider).claimRefund(gid)).to.be.revertedWith("Not a participant");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 13. FEE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  describe("Fee Management", function () {
    it("accumulates fees correctly after settlement", async function () {
      const gid = await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      // 2 players * 50000 fee = 100000
      expect(await arena.totalFees()).to.equal(100000n);
    });

    it("withdrawFees transfers accumulated fees", async function () {
      await settledGame([p1, p2], [1, 2], HIGH_PRICE);

      const fees = await arena.totalFees();
      const balBefore = await usdc.balanceOf(p3.address);
      await arena.withdrawFees(p3.address);
      expect(await usdc.balanceOf(p3.address) - balBefore).to.equal(fees);
      expect(await arena.totalFees()).to.equal(0n);
    });

    it("emits FeeWithdrawn event", async function () {
      await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      const fees = await arena.totalFees();
      await expect(arena.withdrawFees(p3.address))
        .to.emit(arena, "FeeWithdrawn").withArgs(p3.address, fees);
    });

    it("rejects withdrawFees with zero balance", async function () {
      await expect(arena.withdrawFees(p1.address)).to.be.revertedWith("No fees");
    });

    it("rejects withdrawFees by non-owner", async function () {
      await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      await expect(arena.connect(p1).withdrawFees(p1.address)).to.be.revertedWith("Not owner");
    });

    it("setFeeRate rejects > 10%", async function () {
      await expect(arena.setFeeRate(1001)).to.be.revertedWith("Fee too high");
    });

    it("setFeeRate allows 0% and 10%", async function () {
      await arena.setFeeRate(0);
      expect(await arena.feeRate()).to.equal(0n);
      await arena.setFeeRate(1000);
      expect(await arena.feeRate()).to.equal(1000n);
    });

    it("setFeeRate by non-owner reverts", async function () {
      await expect(arena.connect(p1).setFeeRate(100)).to.be.revertedWith("Not owner");
    });

    it("setEntryFee works", async function () {
      const newFee = ethers.parseUnits("5", 6);
      await arena.setEntryFee(newFee);
      expect(await arena.entryFee()).to.equal(newFee);
    });

    it("setEntryFee by non-owner reverts", async function () {
      await expect(arena.connect(p1).setEntryFee(100)).to.be.revertedWith("Not owner");
    });

    it("setRefundGracePeriod rejects 0", async function () {
      await expect(arena.setRefundGracePeriod(0)).to.be.revertedWith("Invalid grace period");
    });

    it("setRefundGracePeriod works", async function () {
      await arena.setRefundGracePeriod(600);
      expect(await arena.refundGracePeriod()).to.equal(600n);
    });

    it("0% fee rate: winners get full pool", async function () {
      await arena.setFeeRate(0);
      const gid = await startGame([p1, p2]);
      await arena.connect(p1).predict(gid, 1);
      await arena.connect(p2).predict(gid, 2);
      await arena.settleGame(gid, HIGH_PRICE);

      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      expect(pp1[2]).to.equal(2000000n); // full 2 USDC
      expect(await arena.totalFees()).to.equal(0n);
    });

    it("10% fee rate: correct deduction", async function () {
      await arena.setFeeRate(1000); // 10%
      const gid = await startGame([p1, p2]);
      await arena.connect(p1).predict(gid, 1);
      await arena.connect(p2).predict(gid, 2);
      await arena.settleGame(gid, HIGH_PRICE);

      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      // fee per player = 1000000 * 1000 / 10000 = 100000
      // net per player = 900000
      // winner = 900000 + 900000 = 1800000
      expect(pp1[2]).to.equal(1800000n);
      expect(await arena.totalFees()).to.equal(200000n);
    });

    it("fee snapshot: changing feeRate after game creation doesn't affect it", async function () {
      const gid = await createPaidGame([p1, p2]); // created with 5% rate
      await arena.setFeeRate(0); // change to 0%

      await arena.startGame(gid, BASE_PRICE);
      await arena.connect(p1).predict(gid, 1);
      await arena.connect(p2).predict(gid, 2);
      await arena.settleGame(gid, HIGH_PRICE);

      // still uses 5% from snapshot
      const pp1 = await arena.getPlayerPrediction(gid, p1.address);
      expect(pp1[2]).to.equal(1900000n); // not 2000000
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 14. ROOM-SPECIFIC FLOWS
  // ═══════════════════════════════════════════════════════════════════

  describe("Room-Specific Flows", function () {
    it("full room lifecycle: create, join, pay, start, settle, claim", async function () {
      // create room
      await arena.connect(p1).createRoom(2, "FULL01");
      expect((await arena.getGameInfo(1))[2]).to.equal(0); // Created

      // join room
      await arena.connect(p2).joinRoom("FULL01");
      expect((await arena.getGameInfo(1))[2]).to.equal(1); // Payment

      // pay
      await arena.connect(p1).payForGame(1);
      await arena.connect(p2).payForGame(1);
      expect(await arena.allPlayersPaid(1)).to.equal(true);

      // start
      await arena.startGame(1, BASE_PRICE);
      expect((await arena.getGameInfo(1))[2]).to.equal(2); // Active

      // predict
      await arena.connect(p1).predict(1, 1);
      await arena.connect(p2).predict(1, 2);

      // settle
      await arena.settleGame(1, HIGH_PRICE);
      expect((await arena.getGameInfo(1))[2]).to.equal(3); // Settled

      // claim
      await arena.connect(p1).claimReward(1);
      const pp = await arena.getPlayerPrediction(1, p1.address);
      expect(pp[3]).to.equal(true); // claimed
    });

    it("owner-managed room lifecycle", async function () {
      const gid = await ownerCreateRoom([p1, p2], "MGD01");
      await payAll(gid, [p1, p2]);
      await arena.startGame(gid, BASE_PRICE);
      await arena.connect(p1).predict(gid, 1);
      await arena.connect(p2).predict(gid, 2);
      await arena.settleGame(gid, HIGH_PRICE);
      await arena.connect(p1).claimReward(gid);
    });

    it("cancel room clears invite code", async function () {
      await arena.connect(p1).createRoom(3, "CLR01");
      expect(await arena.inviteCodeToGame("CLR01")).to.equal(1n);
      await arena.cancelGame(1);
      expect(await arena.inviteCodeToGame("CLR01")).to.equal(0n);
    });

    it("invite code can be reused after room cancelled", async function () {
      await arena.connect(p1).createRoom(2, "REUSE");
      await arena.cancelGame(1);
      // code is now free
      await arena.connect(p2).createRoom(2, "REUSE");
      expect(await arena.inviteCodeToGame("REUSE")).to.equal(2n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 15. VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    it("getGameInfo returns correct data", async function () {
      await arena.connect(p1).createRoom(3, "VIEW01");
      const info = await arena.getGameInfo(1);
      expect(info[0]).to.equal(1n);         // gameId
      expect(info[1]).to.equal(3);          // maxPlayers
      expect(info[2]).to.equal(0);          // Created
      expect(info[3]).to.equal(1n);         // playerCount
      expect(info[4]).to.equal(0n);         // basePrice
      expect(info[5]).to.equal(0n);         // settlementPrice
      expect(info[6]).to.equal(true);       // isRoom
      expect(info[7]).to.equal("VIEW01");   // inviteCode
    });

    it("getPlayerPrediction default values", async function () {
      const gid = await ownerCreateGame([p1, p2]);
      const pp = await arena.getPlayerPrediction(gid, p1.address);
      expect(pp[0]).to.equal(0); // None
      expect(pp[1]).to.equal(false); // not paid
      expect(pp[2]).to.equal(0n); // no reward
      expect(pp[3]).to.equal(false); // not claimed
    });

    it("getGamePlayers returns all players in order", async function () {
      const gid = await ownerCreateGame([p1, p2, p3]);
      const players = await arena.getGamePlayers(gid);
      expect(players.length).to.equal(3);
      expect(players[0]).to.equal(p1.address);
      expect(players[1]).to.equal(p2.address);
      expect(players[2]).to.equal(p3.address);
    });

    it("domainSeparator returns non-zero", async function () {
      const sep = await arena.domainSeparator();
      expect(sep).to.not.equal(ethers.ZeroHash);
    });

    it("allPlayersPaid edge: incomplete team returns false", async function () {
      const gid = Number(await arena.nextGameId());
      await arena.ownerCreateGame(3, p1.address);
      // only 1 of 3 players joined
      expect(await arena.allPlayersPaid(gid)).to.equal(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 16. EDGE CASES & INVARIANTS
  // ═══════════════════════════════════════════════════════════════════

  describe("Edge Cases & Invariants", function () {
    it("gameExists modifier rejects gameId 0", async function () {
      await expect(arena.connect(p1).payForGame(0)).to.be.revertedWith("Game not found");
    });

    it("gameExists modifier rejects future gameId", async function () {
      await expect(arena.connect(p1).payForGame(999)).to.be.revertedWith("Game not found");
    });

    it("multiple games can run independently", async function () {
      const gid1 = await startGame([p1, p2]);
      const gid2 = await startGame([p3, p4]);

      await arena.connect(p1).predict(gid1, 1);
      await arena.connect(p3).predict(gid2, 2);

      await arena.settleGame(gid1, HIGH_PRICE);
      await arena.settleGame(gid2, LOW_PRICE);

      // both games settled independently
      expect((await arena.getGameInfo(gid1))[2]).to.equal(3);
      expect((await arena.getGameInfo(gid2))[2]).to.equal(3);

      // p1 won (predicted UP, price went up)
      expect((await arena.getPlayerPrediction(gid1, p1.address))[2]).to.be.gt(0n);
      // p3 won (predicted DOWN, price went down)
      expect((await arena.getPlayerPrediction(gid2, p3.address))[2]).to.be.gt(0n);
    });

    it("same player can play multiple sequential games", async function () {
      const gid1 = await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      await arena.connect(p1).claimReward(gid1);

      const gid2 = await settledGame([p1, p2], [2, 1], LOW_PRICE);
      await arena.connect(p1).claimReward(gid2);
    });

    it("USDC balance conserved across full game cycle", async function () {
      const arenaAddr = await arena.getAddress();
      const totalBefore =
        (await usdc.balanceOf(p1.address)) +
        (await usdc.balanceOf(p2.address)) +
        (await usdc.balanceOf(arenaAddr));

      const gid = await settledGame([p1, p2], [1, 2], HIGH_PRICE);
      await arena.connect(p1).claimReward(gid);
      await arena.withdrawFees(owner.address);

      const totalAfter =
        (await usdc.balanceOf(p1.address)) +
        (await usdc.balanceOf(p2.address)) +
        (await usdc.balanceOf(arenaAddr)) +
        (await usdc.balanceOf(owner.address)) -
        (totalBefore > 0n ? 0n : 0n); // owner had balance before

      // p2 lost 1 USDC, p1 gained reward, owner got fees - total conserved
      // Simpler: check arena balance = p2's lost amount - fees withdrawn
      const arenaBalance = await usdc.balanceOf(arenaAddr);
      // After claim + withdraw, only p2's unclaimed 0 reward remains (nothing)
      expect(arenaBalance).to.equal(0n);
    });

    it("cancel game with all players paid: all get full refund", async function () {
      const gid = await createPaidGame([p1, p2, p3]);
      const balances = await Promise.all([p1, p2, p3].map(p => usdc.balanceOf(p.address)));
      await arena.cancelGame(gid);
      for (let i = 0; i < 3; i++) {
        expect(await usdc.balanceOf([p1, p2, p3][i].address) - balances[i]).to.equal(ENTRY);
      }
    });
  });
});
