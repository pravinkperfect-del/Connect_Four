const ROWS = 6;
const COLS = 7;
const WIN_LENGTH = 4;

const state = {
  board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
  currentPlayer: 'red',
  mode: 'local',
  winner: null,
  gameOver: false,
  moveCount: 0,
  aiThinking: false,
  roomCode: '',
  online: false,
};

const ui = {
  board: document.getElementById('board'),
  columnHints: document.getElementById('column-hints'),
  statusText: document.getElementById('status-text'),
  moveCount: document.getElementById('move-count'),
  statusIcon: document.getElementById('status-icon'),
  resetButton: document.getElementById('reset-button'),
  message: document.getElementById('message'),
  finishOverlay: document.getElementById('finish-overlay'),
  finishTitle: document.getElementById('finish-title'),
  finishScore: document.getElementById('finish-score'),
  playerOneCard: document.getElementById('player-one-card'),
  playerTwoCard: document.getElementById('player-two-card'),
  connectionLabel: document.getElementById('connection-label'),
  connectionDot: document.getElementById('connection-dot'),
  lobbyCard: document.getElementById('lobby-card'),
  roomCard: document.getElementById('room-card'),
  roomCodeDisplay: document.getElementById('room-code-display'),
  roomStatus: document.getElementById('room-status'),
  lobbyFeedback: document.getElementById('lobby-feedback'),
  roomCodeInput: document.getElementById('room-code'),
  joinForm: document.getElementById('join-form'),
  copyCode: document.getElementById('copy-code'),
  leaveRoom: document.getElementById('leave-room'),
  createRoom: document.getElementById('create-room'),
  singlePlayer: document.getElementById('single-player'),
  twoPlayer: document.getElementById('two-player'),
  playAgain: document.getElementById('play-again'),
  mainMenu: document.getElementById('main-menu'),
};

const playerMeta = {
  red: { name: 'Coral', keyboard: '1-7', label: 'PLAYER 01' },
  yellow: { name: 'Sunshine', keyboard: '1-7', label: 'PLAYER 02' },
};

function setupBoard() {
  ui.board.innerHTML = '';

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `Row ${row + 1}, column ${col + 1}`);
      ui.board.appendChild(cell);
    }
  }

  ui.columnHints.innerHTML = '';
  for (let col = 0; col < COLS; col += 1) {
    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'column-hint';
    hint.dataset.col = String(col);
    hint.setAttribute('aria-label', `Drop disc in column ${col + 1}`);
    hint.textContent = String(col + 1);
    ui.columnHints.appendChild(hint);
  }

  ui.columnHints.querySelectorAll('.column-hint').forEach((button) => {
    button.addEventListener('click', () => handleColumnInput(Number(button.dataset.col)));
  });
}

function updateConnectionStatus() {
  const online = state.online || typeof window.io !== 'undefined';
  ui.connectionDot.style.background = online ? '#7ce58a' : '#f5b447';
  ui.connectionLabel.textContent = online ? 'ONLINE' : 'LOCAL';
}

function updatePlayerCards() {
  const redActive = state.currentPlayer === 'red' && !state.gameOver;
  const yellowActive = state.currentPlayer === 'yellow' && !state.gameOver;

  ui.playerOneCard.classList.toggle('active', redActive);
  ui.playerTwoCard.classList.toggle('active', yellowActive);
}

function updateStatus() {
  if (state.gameOver) {
    ui.statusText.textContent = state.winner ? `${playerMeta[state.winner].name} wins` : 'Draw game';
    ui.statusIcon.textContent = state.winner ? '✓' : '—';
    return;
  }

  ui.statusText.textContent = `${playerMeta[state.currentPlayer].name}'s turn`;
  ui.statusIcon.textContent = state.currentPlayer === 'red' ? '↘' : '↗';
  ui.moveCount.textContent = `MOVE ${String(state.moveCount + 1).padStart(2, '0')}`;
  updatePlayerCards();
}

function getCell(row, col) {
  return ui.board.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

function renderBoard() {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const value = state.board[row][col];
      const cell = getCell(row, col);
      cell.classList.remove('red', 'yellow');
      if (value) {
        cell.classList.add(value);
      }
    }
  }
}

function findOpenRow(col) {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (!state.board[row][col]) {
      return row;
    }
  }
  return -1;
}

function checkWin(row, col, player) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    let count = 1;

    for (const direction of [-1, 1]) {
      let r = row + dr * direction;
      let c = col + dc * direction;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && state.board[r][c] === player) {
        count += 1;
        r += dr * direction;
        c += dc * direction;
      }
    }

    if (count >= WIN_LENGTH) {
      return true;
    }
  }

  return false;
}

function endGame(winner) {
  state.gameOver = true;
  state.winner = winner;
  ui.resetButton.disabled = false;
  ui.finishOverlay.hidden = false;

  if (winner) {
    ui.finishTitle.textContent = winner === 'red' ? 'CORAL WINS' : 'SUNSHINE WINS';
    ui.finishScore.textContent = `Final move ${state.moveCount}.`;
  } else {
    ui.finishTitle.textContent = 'DRAW GAME';
    ui.finishScore.textContent = 'Nobody found a line of four.';
  }

  updateStatus();
  ui.message.textContent = winner ? `${playerMeta[winner].name} connected four!` : 'It was a draw.';
}

function nextTurn() {
  state.currentPlayer = state.currentPlayer === 'red' ? 'yellow' : 'red';
  updateStatus();

  if (state.mode === 'single' && state.currentPlayer === 'yellow' && !state.gameOver) {
    state.aiThinking = true;
    ui.message.textContent = 'Sunshine is thinking…';
    window.setTimeout(makeAiMove, 400);
  }
}

function handleColumnInput(col) {
  if (state.gameOver || state.aiThinking) return;

  const row = findOpenRow(col);
  if (row === -1) {
    ui.message.textContent = 'That column is full.';
    return;
  }

  state.board[row][col] = state.currentPlayer;
  state.moveCount += 1;

  const cell = getCell(row, col);
  cell.classList.add(state.currentPlayer);
  ui.message.textContent = `${playerMeta[state.currentPlayer].name} dropped a disc.`;

  if (checkWin(row, col, state.currentPlayer)) {
    endGame(state.currentPlayer);
    return;
  }

  if (state.moveCount >= ROWS * COLS) {
    endGame(null);
    return;
  }

  nextTurn();
}

function resetBoard() {
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  state.currentPlayer = 'red';
  state.winner = null;
  state.gameOver = false;
  state.moveCount = 0;
  state.aiThinking = false;
  ui.finishOverlay.hidden = true;
  ui.resetButton.disabled = true;
  ui.message.textContent = '';
  renderBoard();
  updateStatus();
  updatePlayerCards();
}

function setMode(mode) {
  state.mode = mode;
  ui.singlePlayer.classList.toggle('is-active', mode === 'single');
  ui.twoPlayer.classList.toggle('is-active', mode === 'two');
  ui.message.textContent = mode === 'single' ? 'Single-player mode ready.' : 'Two-player mode ready.';
  resetBoard();
}

function makeAiMove() {
  if (state.gameOver) return;
  state.aiThinking = false;

  const validColumns = [];
  for (let col = 0; col < COLS; col += 1) {
    if (findOpenRow(col) !== -1) validColumns.push(col);
  }

  let chosenCol = validColumns[Math.floor(Math.random() * validColumns.length)];
  const centerBias = [3, 2, 4, 1, 5, 0, 6];
  const bestChoice = centerBias.find((col) => validColumns.includes(col));
  if (bestChoice !== undefined) chosenCol = bestChoice;

  handleColumnInput(chosenCol);
}

function generateRoomCode() {
  return Math.random().toString().slice(2, 8).padStart(6, '0');
}

function showLobby() {
  ui.lobbyCard.hidden = false;
  ui.roomCard.hidden = true;
  ui.roomStatus.textContent = 'Waiting for your friend to join…';
  ui.roomCodeDisplay.textContent = '------';
}

function showRoomCreated() {
  ui.lobbyCard.hidden = true;
  ui.roomCard.hidden = false;
  state.roomCode = generateRoomCode();
  ui.roomCodeDisplay.textContent = state.roomCode;
  ui.roomStatus.textContent = 'Room ready. Share the code with a friend.';
}

function handleJoinSubmit(event) {
  event.preventDefault();
  const rawCode = ui.roomCodeInput.value.trim();
  if (!/^[0-9]{6}$/.test(rawCode)) {
    ui.lobbyFeedback.textContent = 'Enter a valid 6-digit room code.';
    return;
  }

  state.roomCode = rawCode;
  ui.lobbyFeedback.textContent = `Joining room ${rawCode}…`;
  ui.lobbyCard.hidden = true;
  ui.roomCard.hidden = false;
  ui.roomCodeDisplay.textContent = rawCode;
  ui.roomStatus.textContent = 'Connected. Ready to play.';
  ui.roomCodeInput.value = '';
}

function handleKeydown(event) {
  if (event.key >= '1' && event.key <= '7') {
    handleColumnInput(Number(event.key) - 1);
  }
}

ui.singlePlayer.addEventListener('click', () => setMode('single'));
ui.twoPlayer.addEventListener('click', () => setMode('two'));
ui.resetButton.addEventListener('click', resetBoard);
ui.createRoom.addEventListener('click', showRoomCreated);
ui.copyCode.addEventListener('click', async () => {
  if (!state.roomCode) {
    ui.roomStatus.textContent = 'Create a room first.';
    return;
  }

  try {
    await navigator.clipboard.writeText(state.roomCode);
    ui.roomStatus.textContent = 'Room code copied.';
  } catch (error) {
    ui.roomStatus.textContent = 'Copy unavailable; room code is shown above.';
  }
});
ui.leaveRoom.addEventListener('click', showLobby);
ui.joinForm.addEventListener('submit', handleJoinSubmit);
ui.playAgain.addEventListener('click', resetBoard);
ui.mainMenu.addEventListener('click', () => {
  resetBoard();
  showLobby();
});
document.addEventListener('keydown', handleKeydown);

setupBoard();
renderBoard();
updateConnectionStatus();
setMode('single');