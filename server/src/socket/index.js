import { Server } from "socket.io";
import config from "../config/index.js";
import { query } from "../config/database.js";
import matchmakingService from "../services/matchmaking.js";
import roomService from "../services/room.js";
import gameService from "../services/game.js";
import priceService from "../services/price.js";

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["polling", "websocket"],
  });
  matchmakingService.setIO(io); roomService.setIO(io); gameService.setIO(io);
  const isStartTimeoutLike = (error) => `${error?.message || ""}`.toLowerCase().includes("timed out");

  io.on("connection", (socket) => {
    console.log("[Socket] Connected:", socket.id);
    let wallet = null;
    const getBusyMessage = (target, walletAddress) => {
      if (!walletAddress) return null;
      if (gameService.isInActiveGame(walletAddress)) return "Finish your current game first";
      if (gameService.isInRoomPayment(walletAddress)) return "Finish or cancel your current payment flow first";
      if (target === "match" && roomService.isInRoom(walletAddress)) return "Finish or cancel your active room first";
      if (target === "room" && matchmakingService.isQueued(walletAddress)) return "Finish or cancel your current match first";
      return null;
    };
    const resolvePlayersForGame = async (gameId, fallbackPlayers = []) => {
      const dbPlayers = await query(
        `SELECT wallet_address
         FROM game_players
         WHERE game_id = $1
         ORDER BY is_owner DESC, wallet_address ASC`,
        [gameId]
      );
      const fallbackByWallet = new Map(
        fallbackPlayers
          .filter((player) => player?.wallet)
          .map((player) => [player.wallet.toLowerCase(), player])
      );
      return dbPlayers.rows.map((row) => {
        const walletAddress = row.wallet_address.toLowerCase();
        let socketId = fallbackByWallet.get(walletAddress)?.socketId || null;
        if (!socketId) {
          const matchedSocket = [...io.sockets.sockets.values()].find((candidate) => candidate.data?.wallet === walletAddress);
          socketId = matchedSocket?.id || null;
        }
        return { wallet: walletAddress, socketId };
      });
    };
    const startPaidRoomGame = async ({ gameId, inviteCode, chainGameId, fallbackPlayers = [] }) => {
      const session = gameService.getRoomPayment(gameId);
      const room = inviteCode ? roomService.getRoom(inviteCode) : null;
      const players = await resolvePlayersForGame(gameId, fallbackPlayers.length ? fallbackPlayers : room?.players || session?.players || []);
      const resolvedChainGameId = chainGameId || session?.chainGameId || room?.chainGameId || null;
      if (!resolvedChainGameId || players.length === 0) return false;
      if (session?.timer) clearTimeout(session.timer);
      if (room && inviteCode) delete roomService.rooms[inviteCode];
      gameService.clearRoomPayment(gameId);
      queueMicrotask(async () => {
        try {
          await gameService.startGame(gameId, resolvedChainGameId, players);
        } catch (error) {
          console.error("[Game] start failed", { gameId, chainGameId: resolvedChainGameId, error: error?.message || error });
          if (isStartTimeoutLike(error)) {
            try {
              const recovered = await gameService.recoverStartedRoomGame(gameId, resolvedChainGameId, players, 120000);
              if (recovered) return;
            } catch (recoveryError) {
              console.error("[Game] start timeout recovery failed", { gameId, chainGameId: resolvedChainGameId, error: recoveryError?.message || recoveryError });
            }
          }
          try {
            await query(
              `UPDATE games
               SET state = CASE WHEN state = 'payment' THEN 'payment' ELSE state END,
                   error_message = $1
               WHERE id = $2`,
              [error?.message || "Game start failed", gameId],
            );
          } catch (cleanupError) {
            console.error("[Game] start failure cleanup failed", { gameId, error: cleanupError?.message || cleanupError });
          }
          for (const p of players) {
            if (p.socketId) io.to(p.socketId).emit("room:error", { message: error?.message || "Game start failed" });
          }
        }
      });
      return true;
    };
    const openPreparedRoomPayment = async ({ gameId, inviteCode, chainGameId, fallbackPlayers = [] }) => {
      const room = inviteCode ? roomService.getRoom(inviteCode) : null;
      const players = fallbackPlayers.length ? fallbackPlayers : room?.players || [];
      const session = gameService.startRoomPayment(
        gameId,
        inviteCode,
        players,
        room?.owner || players[0]?.wallet || null,
        chainGameId,
      );
      roomService.clearRoomExpiry(inviteCode);
      session.timer = setTimeout(async () => {
        const current = gameService.getRoomPayment(gameId);
        if (!current) return;
        const latestStatus = await gameService.getRoomPaymentStatus(gameId, current.chainGameId || chainGameId);
        if (latestStatus.allPaid) {
          await startPaidRoomGame({
            gameId,
            inviteCode,
            chainGameId: latestStatus.chainGameId,
            fallbackPlayers: players,
          });
          return;
        }
        await roomService._abortPaymentRoom(inviteCode, "A player timed out before completing payment. This room has been dissolved.");
      }, config.game.paymentTimeout);
      roomService.emitRoomPaymentOpened(inviteCode, chainGameId, config.game.paymentTimeout);
      return session;
    };
    socket.on("auth", d => {
      wallet = d.wallet?.toLowerCase?.() || null;
      socket.data.wallet = wallet;
      console.log("[Socket] Auth:", wallet);
      roomService.rebindPlayerSocket(wallet, socket.id);
      const resumedGame = gameService.rebindPlayerSocket(wallet, socket);
      if (resumedGame) {
        socket.emit("game:resume", resumedGame);
        return;
      }
      gameService.recoverPaidRoomForWallet(wallet)
        .then((snapshot) => {
          if (snapshot) socket.emit("game:resume", snapshot);
        })
        .catch((error) => {
          console.error("[Game] paid room recovery failed", { wallet, error: error?.message || error });
        });
    });
    socket.on("game:resume:request", () => {
      if (!wallet) return;
      const resumedGame = gameService.rebindPlayerSocket(wallet, socket);
      if (resumedGame) {
        socket.emit("game:resume", resumedGame);
        return;
      }
      gameService.recoverPaidRoomForWallet(wallet)
        .then((snapshot) => {
          if (snapshot) socket.emit("game:resume", snapshot);
        })
        .catch((error) => {
          console.error("[Game] paid room resume recovery failed", { wallet, error: error?.message || error });
        });
    });
    socket.on("price:subscribe", () => {
      let lastSent = 0;
      let pending = null;
      const THROTTLE_MS = 500; // 每 500ms 最多推送一次

      const unsub = priceService.onPrice((p) => {
        const now = Date.now();
        if (now - lastSent >= THROTTLE_MS) {
          lastSent = now;
          socket.emit("price:update", { price: p });
          if (pending) { clearTimeout(pending); pending = null; }
        } else if (!pending) {
          // 确保节流期结束后推送最新价格
          pending = setTimeout(() => {
            pending = null;
            lastSent = Date.now();
            socket.emit("price:update", { price: priceService.getPrice() });
          }, THROTTLE_MS - (now - lastSent));
        }
      });

      socket.on("disconnect", () => {
        unsub();
        if (pending) clearTimeout(pending);
      });
      socket.emit("price:update", { price: priceService.getPrice() });
    });

    // Match
    socket.on("match:join", async d => {
      if (!wallet) return socket.emit("match:error", { message: "Connect wallet first" });
      const busyMessage = getBusyMessage("match", wallet);
      if (busyMessage) return socket.emit("match:error", { message: busyMessage });
      try {
        const r = await matchmakingService.addPlayer(d.teamSize, wallet, socket.id);
        if (r.error) return socket.emit("match:error", { message: r.error });
        if (r.status === "matched") {
          const session = gameService.startRoomPayment(r.gameId, null, r.players);
          session.timer = setTimeout(async () => {
            const current = gameService.getRoomPayment(r.gameId);
      if (!current) return;
      await query(`UPDATE games SET state = 'cancelled' WHERE id = $1`, [r.gameId]);
      for (const p of r.players) io.to(p.socketId).emit("match:error", { message: "A player timed out before completing payment. This room has been dissolved." });
            gameService.clearRoomPayment(r.gameId);
          }, config.game.paymentTimeout);
        }
      } catch (e) {
        if (e?.broadcasted) return;
        socket.emit("match:error", { message: e.message || "Matchmaking failed" });
      }
    });
    socket.on("match:cancel", () => { if (wallet) matchmakingService.removePlayer(wallet); });

    // Room
    socket.on("room:create", async d => {
      console.log("[Room] create request", { wallet, teamSize: d.teamSize });
      if (!wallet) return socket.emit("room:error", { message: "Connect wallet first" });
      const busyMessage = getBusyMessage("room", wallet);
      if (busyMessage) return socket.emit("room:error", { message: busyMessage });
      try {
        const r = await roomService.createRoom(d.teamSize, wallet, socket.id);
        if (r.error) { console.log("[Room] create returned error", r.error); return socket.emit("room:error", { message: r.error }); }
        console.log("[Room] create accepted", { code: r.inviteCode, gameId: r.gameId });
        socket.emit("room:created", r);
      } catch (e) {
        console.error("[Room] create exception", e?.message || e);
        socket.emit("room:error", { message: e.message || "Create room failed" });
      }
    });
    socket.on("room:validate", d => {
      if (!wallet) return socket.emit("room:invalid", { message: "Connect wallet first" });
      const busyMessage = getBusyMessage("room", wallet);
      if (busyMessage) return socket.emit("room:invalid", { message: busyMessage });
      const room = roomService.getRoom(d.inviteCode);
      if (!room) return socket.emit("room:invalid", { message: "Room not found" });
      if (room.transitioning) return socket.emit("room:invalid", { message: "Room is updating, please retry" });
      if (room.players.length >= room.maxPlayers) return socket.emit("room:invalid", { message: "Room is full" });
      if (room.players.find(p => p.wallet === wallet)) return socket.emit("room:invalid", { message: "Already in this room" });
      for (const code in roomService.rooms) {
        if (code !== d.inviteCode && roomService.rooms[code].players.find(p => p.wallet === wallet)) {
          return socket.emit("room:invalid", { message: "Finish or cancel your current room first" });
        }
      }
      socket.emit("room:valid", { inviteCode: d.inviteCode, current: room.players.length, total: room.maxPlayers, expiresAt: room.expiresAt });
    });
    socket.on("room:join", async d => {
      if (!wallet) return socket.emit("room:error", { message: "Connect wallet first" });
      const busyMessage = getBusyMessage("room", wallet);
      if (busyMessage) return socket.emit("room:error", { message: busyMessage });
      try {
        const r = await roomService.joinRoom(d.inviteCode, wallet, socket.id);
        if (r.error) return socket.emit("room:error", { message: r.error });
        if (r.status === "full") {
          const rm = roomService.getRoom(d.inviteCode);
          if (!rm) return;
          const players = [...rm.players];
          const gid = rm.gameId;
          const cid = rm.chainGameId || null;
          if (cid) {
            await openPreparedRoomPayment({
              gameId: gid,
              inviteCode: d.inviteCode,
              chainGameId: cid,
              fallbackPlayers: players,
            });
          } else {
            roomService.prepareRoomPayment(d.inviteCode, { timeoutMs: config.game.paymentTimeout })
              .then((preparedChainGameId) => openPreparedRoomPayment({
                gameId: gid,
                inviteCode: d.inviteCode,
                chainGameId: preparedChainGameId,
                fallbackPlayers: players,
              }))
              .catch((error) => {
                console.error("[Room] prepare payment failed", {
                  inviteCode: d.inviteCode,
                  gameId: gid,
                  error: error?.message || error,
                });
              });
          }
        } else {
          socket.emit("room:joined", r);
        }
      } catch (e) {
        socket.emit("room:error", { message: e.message || "Join room failed" });
      }
    });
    socket.on("room:leave", async () => { if (wallet) await roomService.leaveRoom(wallet); });
    socket.on("room:dissolve", async d => {
      if (!wallet) return;
      try {
        const result = await roomService.dissolveRoom(d.inviteCode, wallet);
        if (result?.error) socket.emit("room:error", { message: result.error });
      } catch (error) {
        socket.emit("room:error", { message: error?.message || "Cancel room failed" });
      }
    });

    socket.on("room:payment:confirm", async d => {
      const confirmedWallet = d?.wallet?.toLowerCase?.() || wallet;
      if (!confirmedWallet) return socket.emit("room:error", { message: "Connect wallet first" });
      try {
        const pay = await gameService.confirmRoomPayment(d.gameId, d.chainGameId, confirmedWallet, d.inviteCode);
        if (d.inviteCode && pay.chainGameId) {
          roomService.setChainGameId(d.inviteCode, pay.chainGameId);
        }
        const rm = roomService.getRoom(d.inviteCode);
        const session = gameService.getRoomPayment(d.gameId);
        const fallbackPlayers = rm ? [...rm.players] : session?.players ? [...session.players] : [];
        const players = await resolvePlayersForGame(d.gameId, fallbackPlayers);
        if (pay.paymentOpened && players.length > 0) {
          for (const p of players) {
            if (p.socketId) {
              io.to(p.socketId).emit("room:payment:opened", {
                gameId: d.gameId,
                chainGameId: pay.chainGameId,
                inviteCode: d.inviteCode,
                owner: rm?.owner || session?.owner || null,
                players: players.map((player) => player.wallet),
                total: players.length,
                paymentTimeout: config.game.paymentTimeout,
              });
            }
          }
        }
        if (players.length > 0) {
          for (const p of players) {
            if (p.socketId) io.to(p.socketId).emit("room:payment:update", { ...pay, timeoutMs: config.game.paymentTimeout });
          }
        }
        if (pay.allPaid && players.length > 0) {
          await startPaidRoomGame({
            gameId: d.gameId,
            inviteCode: d.inviteCode,
            chainGameId: pay.chainGameId || d.chainGameId || rm?.chainGameId || null,
            fallbackPlayers: players,
          });
        }
      } catch (e) {
        socket.emit("room:error", { message: e.message || "Payment confirmation failed" });
      }
    });

    // Game
    socket.on("game:predict", async d => {
      if (!wallet) return socket.emit("game:error", { message: "Connect wallet first" });
      try {
        const r = await gameService.confirmPrediction(d.gameId, wallet, d.prediction, d.deadline, d.signature);
        if (r.error) return socket.emit("game:error", { message: r.error });
        socket.emit("game:predicted", { prediction: d.prediction });
      } catch (error) {
        socket.emit("game:error", { message: error?.message || "Prediction submission failed" });
      }
    });

    socket.on("disconnect", () => {
      matchmakingService.removeBySocket(socket.id);
      roomService.leaveBySocket(socket.id);
    });
  });
  return io;
}
