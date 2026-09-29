"use strict";

const ROWS = 6;
const COLS = 7;
const WIN_LENGTH = 4;
const ROOM_STORAGE_KEY = "connect-four-room";
const COLORS = ["red", "yellow"];
const PLAYER_META = {
  red: { name: "Coral", number: 1 },
  yellow: { name: "Sunshine", number: 2 },
};

const ui = {
  board: document.querySelector("#board"),
  hints: document.querySelector("#column-hints"),
  statusText: document.querySelector("#status-text"),
  statusIcon: document.querySelector("#status-icon"),
  moveCount: document.querySelector("#move-count"),
  message: document.querySelector("#message"),
  reset: document.querySelector("#reset-button"),
  playerCards: { red: document.querySelector("#player-one-card"), yellow: document.querySelector("#player-two-card") },
  connectionDot: document.querySelector("#connection-dot"),
  connectionLabel: document.querySelector("#connection-label"),
  lobby: document.querySelector("#lobby-card"),
  room: document.querySelector("#room-card"),
  createRoom: document.querySelector("#create-room"),
  joinForm: document.querySelector("#join-form"),
  roomInput: document.querySelector("#room-code"),
  lobbyFeedback: document.querySelector("#lobby-feedback"),
  roomCode: document.querySelector("#room-code-display"),
  roomStatus: document.querySelector("#room-status"),
  copyCode: document.querySelector("#copy-code"),
  leaveRoom: document.querySelector("#leave-room"),
  singlePlayer: document.querySelector("#single-player"),
  twoPlayer: document.querySelector("#two-player"),
  finish: document.querySelector("#finish-overlay"),
  finishTitle: document.querySelector("#finish-title"),
  finishScore: document.querySelector("#finish-score"),
  confetti: document.querySelector("#finish-confetti"),
  playAgain: document.querySelector("#play-again"),
  mainMenu: document.querySelector("#main-menu"),
};

let socket = null;
let mode = "single";
let myColor = null;
let roomCode = null;
let onlineState = null;
let game = newGame();

function newGame() {
  return {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    currentPlayer: "red",
    moves: 0,
    winner: null,
    winningCells: [],
    draw: false,
    lastMove: null,
  };
}

function getVisibleGame() {
  return mode === "online" ? onlineState : game;
}

function savedRoom() {
  try { return JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY)); }
  catch { return null; }
}

function saveRoom(code, token) {
  try { localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify({ code, token })); }
  catch { /* Local play still works when storage is unavailable. */ }
}

function clearSavedRoom() {
  try { localStorage.removeItem(ROOM_STORAGE_KEY); }
  catch { /* Ignore unavailable browser storage. */ }
}

function setConnection(connected) {
  ui.connectionLabel.textContent = connected ? "SERVER ONLINE" : "SERVER OFFLINE";
  ui.connectionDot.classList.toggle("connected", connected);
}

function createBoardElements() {
  ui.board.replaceChildren();
  ui.hints.replaceChildren();
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.dataset.piece = "";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}, empty`);
      ui.board.append(cell);
    }
  }
  for (let col = 0; col < COLS; col += 1) {
    const hint = document.createElement("button");
    hint.className = "hint";
    hint.type = "button";
    hint.dataset.col = String(col);
    hint.textContent = String(col + 1);
    hint.setAttribute("aria-label", `Drop a disc in column ${col + 1}`);
    ui.hints.append(hint);
  }
}

function renderBoard(state) {
  const board = state?.board || Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const winning = state?.winningCells || [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = ui.board.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      const piece = board[row][col];
      if (cell.dataset.piece !== (piece || "")) {
        cell.classList.remove("red", "yellow");
        if (piece) cell.classList.add(piece);
        cell.dataset.piece = piece || "";
      }
      cell.classList.toggle("winning", winning.some(([r, c]) => r === row && c === col));
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}${piece ? `, ${PLAYER_META[piece].name}` : ", empty"}`);
    }
  }
}

function render() {
  const state = getVisibleGame();
  renderBoard(state);
  const finished = Boolean(state?.winner || state?.draw);
  const currentPlayer = state?.currentPlayer || "red";
  const ready = mode !== "online" || Boolean(onlineState?.players?.red?.connected && onlineState?.players?.yellow?.connected);

  for (const color of COLORS) {
    ui.playerCards[color].classList.toggle("active", Boolean(state && ready && currentPlayer === color && !finished));
  }

  ui.moveCount.textContent = `MOVE ${String(Math.max(1, Math.min((state?.moves || 0) + 1, ROWS * COLS))).padStart(2, "0")}`;
  if (!state) {
    ui.statusText.textContent = "Create or join an online room";
    ui.statusIcon.textContent = "↗";
  } else if (mode === "online" && !ready) {
    ui.statusText.textContent = "Waiting for the other player";
    ui.statusIcon.textContent = "…";
  } else if (state.winner) {
    ui.statusText.textContent = mode === "online"
      ? (state.winner === myColor ? "You win!" : `${PLAYER_META[state.winner].name} wins!`)
      : mode === "two" ? `Player ${PLAYER_META[state.winner].number} wins!` : `${PLAYER_META[state.winner].name} wins!`;
    ui.statusIcon.textContent = "★";
  } else if (state.draw) {
    ui.statusText.textContent = "It’s a draw!";
    ui.statusIcon.textContent = "↔";
  } else {
    ui.statusText.textContent = mode === "online" && currentPlayer !== myColor
      ? `${PLAYER_META[currentPlayer].name}’s turn`
      : `${PLAYER_META[currentPlayer].name}’s turn`;
    ui.statusIcon.textContent = currentPlayer === "red" ? "↘" : "↙";
  }

  ui.reset.disabled = mode === "online" ? !ready : false;
  ui.finish.hidden = !finished;
  if (finished) updateFinish(state);
  if (mode === "online" && onlineState) {
    const otherColor = myColor === "red" ? "yellow" : "red";
    ui.roomStatus.textContent = ready
      ? `You’re Player ${PLAYER_META[myColor].number} (${PLAYER_META[myColor].name}). ${PLAYER_META[otherColor].name} is Player ${PLAYER_META[otherColor].number}.`
      : "Waiting for your friend to join or reconnect…";
  }
}

function updateFinish(state) {
  if (state.winner) {
    ui.finishTitle.textContent = mode === "two"
      ? `PLAYER ${PLAYER_META[state.winner].number} WINS`
      : mode === "online"
        ? (state.winner === myColor ? "YOU WIN!" : `${PLAYER_META[state.winner].name.toUpperCase()} WINS!`)
        : "YOU WIN!";
  } else {
    ui.finishTitle.textContent = "DRAW";
  }
  const redCount = state.board.flat().filter((piece) => piece === "red").length;
  const yellowCount = state.board.flat().filter((piece) => piece === "yellow").length;
  ui.finishScore.textContent = `CORAL ${redCount}  ·  SUNSHINE ${yellowCount}`;
  if (!ui.confetti.childElementCount) {
    for (let i = 0; i < 42; i += 1) {
      const bit = document.createElement("i");
      bit.style.left = `${(i * 37 + 5) % 100}%`;
      bit.style.animationDuration = `${2.2 + (i % 9) * 0.19}s`;
      bit.style.animationDelay = `${-i * 0.11}s`;
      ui.confetti.append(bit);
    }
  }
}

function findOpenRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row -= 1) if (board[row][col] === null) return row;
  return -1;
}

function findWinningCells(board, row, col, color) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [[row, col]];
    for (const direction of [-1, 1]) {
      let r = row + dr * direction;
      let c = col + dc * direction;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === color) {
        line.push([r, c]);
        r += dr * direction;
        c += dc * direction;
      }
    }
    if (line.length >= WIN_LENGTH) return line;
  }
  return [];
}

function playColumn(col) {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return;
  if (mode === "online") {
    if (!onlineState || onlineState.winner || onlineState.draw) return;
    if (myColor !== onlineState.currentPlayer) {
      ui.message.textContent = "It’s the other player’s turn.";
      return;
    }
    if (!onlineState.players?.red?.connected || !onlineState.players?.yellow?.connected) {
      ui.message.textContent = "Waiting for both players to connect.";
      return;
    }
    socket.emit("game:move", { column: col });
    return;
  }
  if (game.winner || game.draw || (mode === "single" && game.currentPlayer === "yellow")) return;
  applyLocalMove(col);
}

function applyLocalMove(col) {
  const row = findOpenRow(game.board, col);
  if (row === -1) {
    ui.message.textContent = "That column is full. Choose another one.";
    return;
  }
  const color = game.currentPlayer;
  game.board[row][col] = color;
  game.moves += 1;
  game.lastMove = { row, column: col };
  game.winningCells = findWinningCells(game.board, row, col, color);
  if (game.winningCells.length >= WIN_LENGTH) game.winner = color;
  else if (game.moves === ROWS * COLS) game.draw = true;
  else game.currentPlayer = color === "red" ? "yellow" : "red";
  ui.message.textContent = `${PLAYER_META[color].name} dropped a disc.`;
  render();

  if (mode === "single" && !game.winner && !game.draw && game.currentPlayer === "yellow") {
    ui.message.textContent = "Sunshine is thinking…";
    window.setTimeout(makeAiMove, 450);
  }
}

function makeAiMove() {
  if (mode !== "single" || game.winner || game.draw || game.currentPlayer !== "yellow") return;
  const preferred = [3, 2, 4, 1, 5, 0, 6];
  const col = preferred.find((candidate) => findOpenRow(game.board, candidate) !== -1);
  if (col !== undefined) applyLocalMove(col);
}

function startLocalGame(nextMode) {
  if (mode === "online") leaveOnlineRoom();
  mode = nextMode;
  myColor = null;
  onlineState = null;
  game = newGame();
  roomCode = null;
  ui.lobby.hidden = true;
  ui.room.hidden = false;
  ui.roomCode.textContent = nextMode === "two" ? "LOCAL · 2P" : "LOCAL · 1P";
  ui.roomStatus.textContent = nextMode === "two" ? "Take turns using 1–7 to choose a column." : "Play Coral; Sunshine will respond automatically.";
  ui.leaveRoom.textContent = "BACK TO MENU";
  ui.singlePlayer.classList.toggle("is-active", nextMode === "single");
  ui.twoPlayer.classList.toggle("is-active", nextMode === "two");
  ui.message.textContent = nextMode === "two" ? "Two-player game ready." : "Single-player game ready.";
  render();
}

function showLobby() {
  ui.lobby.hidden = false;
  ui.room.hidden = true;
  ui.leaveRoom.textContent = "BACK TO MENU";
  ui.lobbyFeedback.textContent = "";
}

function leaveOnlineRoom(notifyServer = true) {
  if (mode === "online" && notifyServer && socket?.connected) socket.emit("room:leave");
  clearSavedRoom();
  roomCode = null;
  myColor = null;
  onlineState = null;
}

function enterRoom(result) {
  if (!result?.ok) {
    ui.lobbyFeedback.textContent = result?.error || "Could not enter that room.";
    return;
  }
  mode = "online";
  roomCode = result.code;
  myColor = result.color;
  onlineState = result.state;
  saveRoom(roomCode, result.token);
  ui.lobby.hidden = true;
  ui.room.hidden = false;
  ui.roomCode.textContent = roomCode;
  ui.roomInput.value = "";
  ui.lobbyFeedback.textContent = "";
  ui.leaveRoom.textContent = "LEAVE ROOM";
  ui.singlePlayer.classList.remove("is-active");
  ui.twoPlayer.classList.remove("is-active");
  ui.message.textContent = "";
  render();
}

function connectToServer() {
  if (typeof window.io !== "function") {
    setConnection(false);
    return;
  }
  socket = window.io();
  socket.on("connect", () => {
    setConnection(true);
    const saved = savedRoom();
    if (saved?.code && saved?.token) {
      socket.emit("room:resume", saved, (result) => {
        if (!result?.ok) clearSavedRoom();
        enterRoom(result);
      });
    }
  });
  socket.on("disconnect", () => {
    setConnection(false);
    if (mode === "online") {
      ui.message.textContent = "Connection lost. Reconnecting…";
      render();
    }
  });
  socket.on("room:state", (state) => {
    if (mode !== "online") return;
    onlineState = state;
    render();
  });
  socket.on("game:error", ({ message }) => { ui.message.textContent = message; });
  socket.on("room:closed", () => {
    clearSavedRoom();
    mode = "single";
    game = newGame();
    onlineState = null;
    roomCode = null;
    myColor = null;
    ui.lobbyFeedback.textContent = "The other player closed this room.";
    showLobby();
    render();
  });
}

ui.board.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (cell && ui.board.contains(cell)) playColumn(Number(cell.dataset.col));
});
ui.hints.addEventListener("click", (event) => {
  const hint = event.target.closest("[data-col]");
  if (hint) playColumn(Number(hint.dataset.col));
});
ui.singlePlayer.addEventListener("click", () => startLocalGame("single"));
ui.twoPlayer.addEventListener("click", () => startLocalGame("two"));
ui.reset.addEventListener("click", () => {
  if (mode === "online") socket?.emit("game:new");
  else { game = newGame(); ui.message.textContent = "New game started."; render(); }
});
ui.createRoom.addEventListener("click", () => {
  if (!socket?.connected) {
    ui.lobbyFeedback.textContent = "Can’t reach the game server. Start it with npm start and try again.";
    return;
  }
  ui.createRoom.disabled = true;
  ui.lobbyFeedback.textContent = "Creating room…";
  socket.emit("room:create", {}, (result) => {
    ui.createRoom.disabled = false;
    enterRoom(result);
  });
});
ui.joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = ui.roomInput.value.replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) {
    ui.lobbyFeedback.textContent = "Enter the 6-digit room code.";
    return;
  }
  if (!socket?.connected) {
    ui.lobbyFeedback.textContent = "Can’t reach the game server. Start it with npm start and try again.";
    return;
  }
  const joinButton = ui.joinForm.querySelector("button[type='submit']");
  joinButton.disabled = true;
  ui.lobbyFeedback.textContent = "Joining room…";
  socket.emit("room:join", { code }, (result) => {
    joinButton.disabled = false;
    enterRoom(result);
  });
});
ui.roomInput.addEventListener("input", () => { ui.roomInput.value = ui.roomInput.value.replace(/\D/g, "").slice(0, 6); });
ui.copyCode.addEventListener("click", async () => {
  if (!roomCode) return;
  try {
    await navigator.clipboard.writeText(roomCode);
    ui.copyCode.textContent = "COPIED";
    window.setTimeout(() => { ui.copyCode.textContent = "COPY"; }, 1400);
  } catch {
    ui.roomStatus.textContent = "Copy unavailable. Select the room code to copy it.";
  }
});
ui.leaveRoom.addEventListener("click", () => {
  leaveOnlineRoom();
  mode = "single";
  game = newGame();
  showLobby();
  render();
});
ui.playAgain.addEventListener("click", () => {
  if (mode === "online") socket?.emit("game:new");
  else { game = newGame(); ui.message.textContent = "New game started."; render(); }
});
ui.mainMenu.addEventListener("click", () => {
  leaveOnlineRoom();
  mode = "single";
  game = newGame();
  showLobby();
  render();
});
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
  if (/^[1-7]$/.test(event.key)) playColumn(Number(event.key) - 1);
});

createBoardElements();
connectToServer();
render();
