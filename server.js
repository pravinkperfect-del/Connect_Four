"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const ROWS = 6;
const COLUMNS = 7;
const ROOM_TTL_MS = 30 * 60 * 1000;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const rooms = new Map();

app.get("/", (_request, response) => response.sendFile(path.join(__dirname, "index.html")));
app.get("/style.css", (_request, response) => response.sendFile(path.join(__dirname, "style.css")));
app.get("/script.js", (_request, response) => response.sendFile(path.join(__dirname, "script.js")));
app.get("/health", (_request, response) => response.json({ ok: true }));

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLUMNS).fill(null));
}

function newGame() {
  return { board: emptyBoard(), currentPlayer: "red", moves: 0, winner: null, winningCells: [], draw: false, lastMove: null };
}

function makeRoom(code) {
  return {
    code,
    players: { red: null, yellow: null },
    game: newGame(),
    cleanupTimer: null,
  };
}

function createRoomCode() {
  let code;
  do {
    code = String(crypto.randomInt(100000, 1000000));
  } while (rooms.has(code));
  return code;
}

function publicState(room) {
  return {
    roomCode: room.code,
    ...room.game,
    players: Object.fromEntries(
      Object.entries(room.players).map(([color, player]) => [color, { connected: Boolean(player?.socketId) }]),
    ),
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit("room:state", publicState(room));
}

function currentPlayer(room, socket) {
  const color = Object.keys(room.players).find((key) => room.players[key]?.socketId === socket.id);
  return color ? { color, player: room.players[color] } : null;
}

function sendError(socket, message) {
  socket.emit("game:error", { message });
}

function findWinningCells(board, row, column, color) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [rowStep, columnStep] of directions) {
    const line = [[row, column]];
    for (const sign of [-1, 1]) {
      let nextRow = row + rowStep * sign;
      let nextColumn = column + columnStep * sign;
      while (
        nextRow >= 0 && nextRow < ROWS &&
        nextColumn >= 0 && nextColumn < COLUMNS &&
        board[nextRow][nextColumn] === color
      ) {
        line.push([nextRow, nextColumn]);
        nextRow += rowStep * sign;
        nextColumn += columnStep * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return [];
}

function joinRoom(socket, room, color, token) {
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = null;
  room.players[color] = { socketId: socket.id, token };
  socket.data.roomCode = room.code;
  socket.join(room.code);
  return { ok: true, code: room.code, color, token, state: publicState(room) };
}

io.on("connection", (socket) => {
  socket.on("room:create", (_payload, acknowledge = () => {}) => {
    const code = createRoomCode();
    const room = makeRoom(code);
    const token = crypto.randomUUID();
    rooms.set(code, room);
    acknowledge(joinRoom(socket, room, "red", token));
    broadcastRoom(room);
  });

  socket.on("room:join", (payload = {}, acknowledge = () => {}) => {
    const code = String(payload.code || "").replace(/\D/g, "").slice(0, 6);
    const room = rooms.get(code);
    if (!room) return acknowledge({ ok: false, error: "We couldn’t find that room. Check the code and try again." });
    if (room.players.yellow?.socketId || room.players.red?.socketId && room.players.yellow?.token) {
      return acknowledge({ ok: false, error: "That room already has two players." });
    }
    if (room.players.yellow?.token) return acknowledge({ ok: false, error: "That room is full." });
    const token = crypto.randomUUID();
    acknowledge(joinRoom(socket, room, "yellow", token));
    broadcastRoom(room);
  });

  socket.on("room:resume", (payload = {}, acknowledge = () => {}) => {
    const code = String(payload.code || "");
    const token = String(payload.token || "");
    const room = rooms.get(code);
    if (!room || !token) return acknowledge({ ok: false, error: "That saved room is no longer available." });
    const color = Object.keys(room.players).find((key) => room.players[key]?.token === token);
    if (!color) return acknowledge({ ok: false, error: "This browser is not a player in that room." });
    if (room.players[color].socketId) return acknowledge({ ok: false, error: "That player is already connected." });
    acknowledge(joinRoom(socket, room, color, token));
    broadcastRoom(room);
  });

  socket.on("game:move", (payload = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return sendError(socket, "Join a room before playing.");
    const player = currentPlayer(room, socket);
    if (!player) return sendError(socket, "You are no longer connected to that room.");
    const { game } = room;
    if (!room.players.red?.socketId || !room.players.yellow?.socketId) return sendError(socket, "Waiting for the other player to reconnect.");
    if (game.winner || game.draw) return sendError(socket, "This game has ended. Start a new game to play again.");
    if (player.color !== game.currentPlayer) return sendError(socket, "It’s the other player’s turn.");
    const column = Number(payload.column);
    if (!Number.isInteger(column) || column < 0 || column >= COLUMNS) return sendError(socket, "Choose a valid column.");
    if (game.board[0][column] !== null) return sendError(socket, "That column is full. Choose another one.");

    let row = ROWS - 1;
    while (game.board[row][column] !== null) row -= 1;
    game.board[row][column] = player.color;
    game.moves += 1;
    game.lastMove = { row, column };
    const winningCells = findWinningCells(game.board, row, column, player.color);
    if (winningCells.length >= 4) {
      game.winner = player.color;
      game.winningCells = winningCells;
    } else if (game.moves === ROWS * COLUMNS) {
      game.draw = true;
    } else {
      game.currentPlayer = player.color === "red" ? "yellow" : "red";
    }
    broadcastRoom(room);
  });

  socket.on("game:new", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !currentPlayer(room, socket)) return;
    if (!room.players.red?.socketId || !room.players.yellow?.socketId) return sendError(socket, "Both players must be connected to start a new game.");
    room.game = newGame();
    broadcastRoom(room);
  });

  socket.on("room:leave", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    clearTimeout(room.cleanupTimer);
    io.to(code).except(socket.id).emit("room:closed");
    rooms.delete(code);
    socket.leave(code);
    delete socket.data.roomCode;
  });
  socket.on("disconnect", () => leaveRoom(socket));
});

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  const room = rooms.get(code);
  if (!room) return;
  const player = currentPlayer(room, socket);
  if (!player) return;
  room.players[player.color].socketId = null;
  socket.leave(code);
  delete socket.data.roomCode;
  broadcastRoom(room);
  if (!room.players.red?.socketId && !room.players.yellow?.socketId) {
    room.cleanupTimer = setTimeout(() => rooms.delete(code), ROOM_TTL_MS);
    room.cleanupTimer.unref?.();
  }
}

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Connect Four is running at http://localhost:${PORT}`);
});
