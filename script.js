"use strict";

const ROWS = 6;
const COLUMNS = 7;
const PLAYER_NAMES = { red: "Coral", yellow: "Sunshine" };
const PLAYER_CARDS = {
  red: document.querySelector("#player-one-card"),
  yellow: document.querySelector("#player-two-card"),
};
const boardElement = document.querySelector("#board");
const hintsElement = document.querySelector("#column-hints");
const statusText = document.querySelector("#status-text");
const statusIcon = document.querySelector("#status-icon");
const moveCount = document.querySelector("#move-count");
const message = document.querySelector("#message");
const resetButton = document.querySelector("#reset-button");
const lobbyCard = document.querySelector("#lobby-card");
const roomCard = document.querySelector("#room-card");
const createButton = document.querySelector("#create-room");
const joinForm = document.querySelector("#join-form");
const roomInput = document.querySelector("#room-code");
const feedback = document.querySelector("#lobby-feedback");
const roomCodeDisplay = document.querySelector("#room-code-display");
const roomStatus = document.querySelector("#room-status");
const copyButton = document.querySelector("#copy-code");
const leaveButton = document.querySelector("#leave-room");
const connectionDot = document.querySelector("#connection-dot");
const connectionLabel = document.querySelector("#connection-label");

let socket;
let myColor = null;
let roomState = null;
let roomCode = null;
let isConnected = false;

function savedRoom() {
  try { return JSON.parse(localStorage.getItem("connect-four-room")); }
  catch { return null; }
}

function saveRoom(code, token) {
  localStorage.setItem("connect-four-room", JSON.stringify({ code, token }));
}

function clearSavedRoom() {
  localStorage.removeItem("connect-four-room");
}

function setConnection(connected) {
  isConnected = connected;
  connectionLabel.textContent = connected ? "SERVER ONLINE" : "RECONNECTING";
  connectionDot.classList.toggle("connected", connected);
}

function connectToServer() {
  socket = io();
  socket.on("connect", () => {
    setConnection(true);
    const saved = savedRoom();
    if (saved?.code && saved?.token) {
      socket.emit("room:resume", saved, (result) => {
        if (result?.ok) enterRoom(result);
        else {
          clearSavedRoom();
          showLobbyMessage(result?.error || "Create or join a room to play.");
        }
      });
    }
  });
  socket.on("disconnect", () => {
    setConnection(false);
    if (roomState) {
      message.textContent = "Connection lost. Trying to reconnect…";
      disableBoard();
    }
  });
  socket.on("room:state", (state) => {
    roomState = state;
    render();
  });
  socket.on("game:error", ({ message: errorMessage }) => {
    message.textContent = errorMessage;
  });
  socket.on("room:closed", () => {
    clearSavedRoom();
    roomState = null;
    roomCode = null;
    myColor = null;
    showLobbyMessage("The other player closed this room.");
    showLobby();
    renderEmptyBoard();
  });
}

function showLobbyMessage(text) {
  feedback.textContent = text;
}

function enterRoom(result) {
  if (!result?.ok) {
    showLobbyMessage(result?.error || "Could not enter that room.");
    return;
  }
  roomCode = result.code;
  myColor = result.color;
  roomState = result.state;
  saveRoom(roomCode, result.token);
  feedback.textContent = "";
  lobbyCard.hidden = true;
  roomCard.hidden = false;
  roomCodeDisplay.textContent = roomCode;
  roomInput.value = "";
  render();
}

function showLobby() {
  lobbyCard.hidden = false;
  roomCard.hidden = true;
}

function disableBoard() {
  boardElement.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  hintsElement.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  resetButton.disabled = true;
}

function renderEmptyBoard() {
  roomState = null;
  render();
}

function render() {
  boardElement.replaceChildren();
  hintsElement.replaceChildren();
  const state = roomState;
  const board = state?.board || Array.from({ length: ROWS }, () => Array(COLUMNS).fill(null));
  const playersReady = Boolean(state?.players?.red?.connected && state?.players?.yellow?.connected);
  const finished = Boolean(state?.winner || state?.draw);
  const isMyTurn = Boolean(state && myColor === state.currentPlayer && playersReady && !finished);
  const canStart = Boolean(state && playersReady);

  if (!state) {
    statusText.textContent = isConnected ? "Create or join a room" : "Connecting to game server…";
    statusIcon.textContent = "↗";
    moveCount.textContent = "MOVE 01";
    message.textContent = "";
  } else {
    const opponentColor = myColor === "red" ? "yellow" : "red";
    if (!playersReady) {
      statusText.textContent = "Waiting for your friend";
      statusIcon.textContent = "…";
      message.textContent = state.players[opponentColor]?.connected ? "" : "Your opponent is offline. Waiting for them to reconnect…";
    } else if (state.winner) {
      statusText.textContent = state.winner === myColor ? "You win!" : `${PLAYER_NAMES[state.winner]} wins!`;
      statusIcon.textContent = "★";
      message.textContent = state.winner === myColor ? "You connected four. Nicely played!" : "Your opponent connected four. Rematch?";
    } else if (state.draw) {
      statusText.textContent = "It’s a draw!";
      statusIcon.textContent = "↔";
      message.textContent = "The board is full. Start a new game for a rematch.";
    } else {
      statusText.textContent = isMyTurn ? "Your turn" : `${PLAYER_NAMES[state.currentPlayer]}’s turn`;
      statusIcon.textContent = state.currentPlayer === "red" ? "↘" : "↙";
      message.textContent = "";
    }
    moveCount.textContent = `MOVE ${String(Math.max(1, Math.min(state.moves, ROWS * COLUMNS))).padStart(2, "0")}`;
    roomStatus.textContent = playersReady ? `You’re playing as ${PLAYER_NAMES[myColor]}. Have fun!` : "Waiting for your friend to join…";
  }

  for (const color of ["red", "yellow"]) {
    PLAYER_CARDS[color].classList.toggle("active", Boolean(state && canStart && state.currentPlayer === color && !finished));
    PLAYER_CARDS[color].classList.toggle("you", color === myColor);
  }

  for (let column = 0; column < COLUMNS; column += 1) {
    const hint = document.createElement("button");
    hint.className = "hint";
    hint.type = "button";
    hint.textContent = String(column + 1);
    hint.setAttribute("aria-label", `Drop a disc in column ${column + 1}`);
    hint.disabled = !isMyTurn || board[0][column] !== null;
    hint.addEventListener("click", () => playColumn(column));
    hintsElement.append(hint);
  }

  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}${board[row][column] ? `, ${PLAYER_NAMES[board[row][column]]}` : ", empty"}`);
      cell.disabled = !isMyTurn || board[0][column] !== null;
      cell.addEventListener("click", () => playColumn(column));
      if (state?.winningCells?.some(([winRow, winColumn]) => winRow === row && winColumn === column)) cell.classList.add("winning");
      if (board[row][column]) {
        const disc = document.createElement("span");
        const isNewDisc = state?.lastMove?.row === row && state?.lastMove?.column === column;
        disc.className = `disc ${board[row][column]}${isNewDisc ? " drop-in" : ""}`;
        disc.setAttribute("aria-hidden", "true");
        cell.append(disc);
      }
      boardElement.append(cell);
    }
  }
  resetButton.disabled = !canStart;
}

function playColumn(column) {
  if (!roomState || roomState.currentPlayer !== myColor || !isConnected) return;
  socket.emit("game:move", { column });
}

createButton.addEventListener("click", () => {
  createButton.disabled = true;
  showLobbyMessage("");
  socket.emit("room:create", {}, (result) => {
    createButton.disabled = false;
    enterRoom(result);
  });
});

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = roomInput.value.replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) {
    showLobbyMessage("Enter the 6-digit room code.");
    return;
  }
  showLobbyMessage("");
  const joinButton = joinForm.querySelector("button[type='submit']");
  joinButton.disabled = true;
  socket.emit("room:join", { code }, (result) => {
    joinButton.disabled = false;
    enterRoom(result);
  });
});

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.replace(/\D/g, "").slice(0, 6);
});

resetButton.addEventListener("click", () => socket?.emit("game:new"));
leaveButton.addEventListener("click", () => {
  socket?.emit("room:leave");
  clearSavedRoom();
  roomState = null;
  roomCode = null;
  myColor = null;
  showLobby();
  render();
});
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    copyButton.textContent = "COPIED";
    setTimeout(() => { copyButton.textContent = "COPY"; }, 1400);
  } catch {
    showLobbyMessage("Copy wasn’t available. Select the code to copy it.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement) return;
  if (/^[1-7]$/.test(event.key)) playColumn(Number(event.key) - 1);
});

render();
connectToServer();
