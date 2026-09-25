# Connect Four Online — 10X Arcade

A two-player Connect Four game with private six-digit rooms. The server owns each room’s board and validates turns, moves, wins, and draws. A disconnected player can return to their room in the same browser for 30 minutes.

## Run locally

1. Install [Node.js 18 or newer](https://nodejs.org/).
2. Open a terminal in this project folder and run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` in two browser tabs. Create a room in one tab and join using its code in the other.

For development, `npm run dev` restarts the server when `server.js` changes.

## Put it online

The server must be deployed as a **web service** that supports persistent WebSocket connections. For Render:

1. Put this project in a Git repository and push it to GitHub.
2. In Render, create a **New → Web Service** and connect that repository.
3. Set the build command to `npm install` and the start command to `npm start`.
4. After deployment, share the service’s `https://…onrender.com` address. Both players open that same address and use the room code.

Render web services accept WebSocket connections. This app uses in-memory rooms, so rooms are temporary and restart when the server restarts. Keep one server instance for this club project; multiple instances would need shared room storage and a Socket.IO adapter.

## Controls and features

- Create a room, copy its code, and share it with a friend.
- Join with a six-digit room code.
- Click a column or press `1`–`7` to drop a disc.
- Start a new game with the button (when both players are connected).
- The server validates every move and broadcasts the updated board to both players.

## Project files

- `index.html` — game and room interface
- `style.css` — responsive visual design
- `script.js` — browser interface and Socket.IO client
- `server.js` — room management and authoritative game rules
- `package.json` — Node.js dependencies and run scripts
