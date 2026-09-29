# Connect Four — Arcade

A responsive Connect Four game with local single-player practice, shared-keyboard multiplayer, and online rooms. Connect four discs in a row horizontally, vertically, or diagonally to win.

## Game modes

- **Single Player:** Play as Coral against Sunshine, the built-in computer opponent.
- **Local Two Player:** Play together in the same browser, taking turns with the same keyboard controls.
- **Online:** Create a private room and share its six-digit code, or join another player's room.

## Controls

- Click a column or use `1`–`7` to drop a disc in that column.
- In local Two Player mode, both players use `1`–`7`, taking turns. Single Player also uses `1`–`7`.
- In online mode, use the controls on your turn. The server checks whose turn it is and whether a move is valid.
- Use **New Game** to start a rematch when available. Local games can be restarted from the end screen.

## Features

- Six-row, seven-column board with animated disc drops and highlighted winning discs.
- Turn and move indicators, player status cards, and clear win or draw messages.
- End-of-game overlay with confetti, final disc counts, and Play Again and Main Menu actions. Local two-player games announce Player 1, Player 2, or a draw.
- Responsive layout, button feedback, board glow on a win, and reduced-motion support.
- Online rooms use Socket.IO. The server validates moves, broadcasts board updates, and allows players to resume a disconnected room from the same browser for up to 30 minutes.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start

Open http://localhost:3000. For development with automatic server restarts, run npm run dev.

Deploy online

Deploy as a web service that supports persistent WebSocket connections. Set the build command to npm install and the start command to npm start. Rooms are stored in memory and are cleared when the server restarts, so use one server instance unless shared room storage is added.

Project files

- index.html — game interface
- style.css — layout, responsive styling, and animations
- script.js — game interface, local modes, and Socket.IO client
- server.js — web server, online rooms, and authoritative game rules
- package.json — dependencies and run scripts
