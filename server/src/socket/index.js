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

  io.on("connection", (socket) => {
    console.log("[Socket] Connected:", socket.id);
    let wallet = null;
    socket.on("auth", d => { wallet = d.wallet; console.log("[Socket] Auth:", wallet); });
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
      const r = matchmakingService.addPlayer(d.teamSize, wallet, socket.id);
      if (r.error) return socket.emit("match:error", { message: r.error });
      if (r.status === "matched") {
        setTimeout(async () => { await gameService.startGame(r.gameId, r.gameId, r.players); }, 2000);
      }
    });
    socket.on("match:cancel", () => { if (wallet) matchmakingService.removePlayer(wallet); });

    // Room
    socket.on("room:create", async d => {
      if (!wallet) return socket.emit("room:error", { message: "Connect wallet first" });
      const r = await roomService.createRoom(d.teamSize, wallet, socket.id);
      if (r.error) return socket.emit("room:error", { message: r.error });
      const j = await roomService.joinRoom(r.inviteCode, wallet, socket.id);
      socket.emit("room:created", { ...r, ...j });
    });
    socket.on("room:validate", d => {
      const room = roomService.getRoom(d.inviteCode);
      if (!room) return socket.emit("room:invalid", { message: "Room not found" });
      if (room.players.length >= room.maxPlayers) return socket.emit("room:invalid", { message: "Room is full" });
      if (room.players.find(p => p.wallet === wallet)) return socket.emit("room:invalid", { message: "Already in this room" });
      socket.emit("room:valid", { inviteCode: d.inviteCode, current: room.players.length, total: room.maxPlayers, expiresAt: room.expiresAt });
    });
    socket.on("room:join", async d => {
      if (!wallet) return socket.emit("room:error", { message: "Connect wallet first" });
      const r = await roomService.joinRoom(d.inviteCode, wallet, socket.id);
      if (r.error) return socket.emit("room:error", { message: r.error });
      socket.emit("room:joined", r);
      if (r.status === "full") {
        const rm = roomService.getRoom(d.inviteCode);
        if (rm) {
          const players = [...rm.players]; const gid = rm.gameId; const cid = rm.chainGameId;
          const session = gameService.startRoomPayment(gid, d.inviteCode, players);
          session.timer = setTimeout(async () => {
            const current = gameService.getRoomPayment(gid);
            if (!current) return;
            await query(`UPDATE games SET state = 'failed' WHERE id = $1`, [gid]);
            for (const p of players) io.to(p.socketId).emit("room:payment:failed", { reason: "Payment timeout" });
            await roomService._dissolve(d.inviteCode, "Payment timeout");
            gameService.clearRoomPayment(gid);
          }, config.game.paymentTimeout);
          for (const p of players) { io.to(p.socketId).emit("room:full", { gameId: gid, chainGameId: cid, players: players.map(x => x.wallet), inviteCode: d.inviteCode, paymentTimeout: config.game.paymentTimeout }); }
        }
      }
    });
    socket.on("room:leave", async () => { if (wallet) await roomService.leaveRoom(wallet); });
    socket.on("room:dissolve", async d => { if (wallet) await roomService.dissolveRoom(d.inviteCode, wallet); });

    socket.on("room:payment:confirm", async d => {
      if (!wallet) return socket.emit("room:error", { message: "Connect wallet first" });
      try {
        const pay = await gameService.confirmRoomPayment(d.gameId, wallet);
        const rm = roomService.getRoom(d.inviteCode);
        if (rm) {
          for (const p of rm.players) io.to(p.socketId).emit("room:payment:update", { ...pay, timeoutMs: config.game.paymentTimeout });
          if (pay.allPaid) {
            const session = gameService.getRoomPayment(d.gameId);
            if (session?.timer) clearTimeout(session.timer);
            const players = [...rm.players];
            delete roomService.rooms[d.inviteCode];
            gameService.clearRoomPayment(d.gameId);
            setTimeout(async () => { await gameService.startGame(rm.gameId, rm.chainGameId, players); }, 500);
          }
        }
      } catch (e) {
        socket.emit("room:error", { message: e.message || "Payment confirmation failed" });
      }
    });

    // Game
    socket.on("game:predict", d => {
      if (!wallet) return socket.emit("game:error", { message: "Connect wallet first" });
      const r = gameService.submitPrediction(d.gameId, wallet, d.prediction);
      if (r.error) return socket.emit("game:error", { message: r.error });
      socket.emit("game:predicted", { prediction: d.prediction });
    });

    socket.on("disconnect", () => {
      matchmakingService.removeBySocket(socket.id);
      roomService.leaveBySocket(socket.id);
    });
  });
  return io;
}
