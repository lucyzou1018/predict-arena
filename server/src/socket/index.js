import { Server } from "socket.io";
import config from "../config/index.js";
import { query } from "../config/database.js";
import matchmakingService from "../services/matchmaking.js";
import roomService from "../services/room.js";
import gameService from "../services/game.js";
import contractService from "../services/contract.js";
import priceService from "../services/price.js";

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["polling", "websocket"],
  });
  matchmakingService.setIO(io); roomService.setIO(io); gameService.setIO(io);

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
    socket.on("auth", d => {
      wallet = d.wallet?.toLowerCase?.() || null;
      socket.data.wallet = wallet;
      console.log("[Socket] Auth:", wallet);
      roomService.rebindPlayerSocket(wallet, socket.id);
      const resumedGame = gameService.rebindPlayerSocket(wallet, socket);
      if (resumedGame) socket.emit("game:resume", resumedGame);
    });
    socket.on("game:resume:request", () => {
      if (!wallet) return;
      const resumedGame = gameService.rebindPlayerSocket(wallet, socket);
      if (resumedGame) socket.emit("game:resume", resumedGame);
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
            for (const p of r.players) io.to(p.socketId).emit("match:error", { message: "Payment timeout" });
            if (r.chainGameId) await contractService.cancelGame(r.chainGameId);
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
        socket.emit("room:joined", r);
        if (r.status === "full") {
          try {
            const prepared = await roomService.prepareRoomPayment(d.inviteCode);
            const rm = roomService.getRoom(d.inviteCode);
            if (!rm) return;
            const players = [...rm.players];
            const gid = rm.gameId;
            const cid = rm.chainGameId || prepared?.chainGameId;
            const session = gameService.startRoomPayment(gid, d.inviteCode, players);
            roomService.clearRoomExpiry(d.inviteCode);
            session.timer = setTimeout(async () => {
              const current = gameService.getRoomPayment(gid);
              if (!current) return;
              await roomService._abortPaymentRoom(d.inviteCode, "Payment timeout");
            }, config.game.paymentTimeout);
            for (const p of players) {
              io.to(p.socketId).emit("room:full", {
                gameId: gid,
                chainGameId: cid,
                players: players.map(x => x.wallet),
                inviteCode: d.inviteCode,
                paymentTimeout: config.game.paymentTimeout,
              });
            }
          } catch (e) {
            console.error("[Room] full room prepare failed", { inviteCode: d.inviteCode, error: e?.message || e });
            return;
          }
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
        const pay = await gameService.confirmRoomPayment(d.gameId, d.chainGameId, confirmedWallet);
        const rm = roomService.getRoom(d.inviteCode);
        const session = gameService.getRoomPayment(d.gameId);
        const fallbackPlayers = rm ? [...rm.players] : session?.players ? [...session.players] : [];
        const players = await resolvePlayersForGame(d.gameId, fallbackPlayers);
        if (players.length > 0) {
          for (const p of players) {
            if (p.socketId) io.to(p.socketId).emit("room:payment:update", { ...pay, timeoutMs: config.game.paymentTimeout });
          }
        }
        if (pay.allPaid && players.length > 0) {
          if (session?.timer) clearTimeout(session.timer);
          if (rm && d.inviteCode) delete roomService.rooms[d.inviteCode];
          gameService.clearRoomPayment(d.gameId);
          const chainGameId = d.chainGameId || rm?.chainGameId || d.gameId;
          setTimeout(async () => {
            try {
              await gameService.startGame(d.gameId, chainGameId, players);
            } catch (error) {
              console.error("[Game] start failed", { gameId: d.gameId, chainGameId, error: error?.message || error });
              try {
                await query(`UPDATE games SET state='failed', error_message=$1 WHERE id=$2`, [error?.message || "Game start failed", d.gameId]);
                if (chainGameId) await contractService.cancelGame(chainGameId);
              } catch (cleanupError) {
                console.error("[Game] start failure cleanup failed", { gameId: d.gameId, error: cleanupError?.message || cleanupError });
              }
              for (const p of players) {
                if (p.socketId) io.to(p.socketId).emit("room:error", { message: error?.message || "Game start failed" });
              }
            }
          }, 500);
        }
      } catch (e) {
        socket.emit("room:error", { message: e.message || "Payment confirmation failed" });
      }
    });

    // Game
    socket.on("game:predict", async d => {
      if (!wallet) return socket.emit("game:error", { message: "Connect wallet first" });
      try {
        const r = await gameService.confirmPrediction(d.gameId, wallet, d.prediction);
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
