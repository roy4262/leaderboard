# Mini Leaderboard

A small leaderboard service using MongoDB (authoritative store), Redis (cache for leaderboard reads), Express HTTP API and Socket.IO for real-time score broadcasts.

This README explains the project design, environment configuration, how to run it, example API and WebSocket usage, and troubleshooting tips.

**Tech stack**:

- **Node.js** (ES modules) + Express
- **MongoDB** (Mongoose) — authoritative score storage
- **Redis** — sorted-set cache for leaderboard reads (best-effort)
- **Socket.IO** — real-time `score_updated` broadcasts

**Files of interest**:

- `server.js` — main server, routes, Redis/Mongo integration and WebSocket emits
- `models/score.js` — Mongoose schema for scores
- `package.json` — scripts and dependencies
- `test-socket.html` — (optional) a simple WebSocket client to inspect events

**Design & behavior**

- The canonical source of truth for scores and ranks is MongoDB. When a score is updated the server writes to MongoDB first and computes the rank from the DB (deterministic).
- Redis is used as a best-effort cache for leaderboard reads. All Redis updates are non-blocking / best-effort so the server continues to emit correct ranks even if Redis is unavailable or reconnecting.
- WebSocket events `score_updated` are emitted after DB update with payload `{ userId, score, rank }`.

```Data Flow
sequenceDiagram
    participant C as Client
    participant A as Express API
    participant DB as MongoDB
    participant R as Redis
    participant S as Socket.IO

    C->>A: POST /score {userId, value}
    A->>DB: Update score
    DB->>A: Updated record
    A->>R: Update sorted-set (best effort)
    A->>S: Emit "score_updated" {userId, score, rank}
    C->>A: GET /leaderboard
    A->>R: Try get top N
    R-->>A: Cached leaderboard
    A-->>C: Response
```

```Work-Flow
flowchart LR
    Client -->|HTTP /score| API[Express API]
    Client -->|WS Events| WS[Socket.IO]

    API --> MongoDB[(MongoDB)]
    API --> Redis[(Redis Cache)]

    MongoDB --> WS
    API --> WS

    API -->|GET /leaderboard| Redis
    Redis --> API

```
Requirements

- Node 18+ (or any modern Node that supports ES modules)
- MongoDB instance (URI in `MONGODB_URI`)
- Redis instance (URI in `REDIS_URL`) — optional for basic operation, recommended for leaderboard performance

Environment
Create a `.env` file in the project root or set these environment variables in your shell:

```
MONGODB_URI=mongodb://user:pass@host:port/dbname
REDIS_URL=redis://[:password@]host:port
PORT=3000
```
Clone Repositary
```bash
git clone https://github.com/roy4262/leaderboard
```


Install

```bash
npm install
```

Run

```bash
npm start
```

Development (auto restart)

```bash
npm run dev
```

HTTP API

- POST /score — update a user's score and broadcast the change

Request (JSON):

```json
{ "userId": "user123", "value": 250 }
```

Response (JSON):

```json
{ "userId": "user123", "score": 250, "rank": 4 }
```

- GET /leaderboard — returns top N leaderboard entries (default limit 10)

Response (JSON):

```json
{
  "source": "redis", // or "db" when Redis was rebuilt
  "leaderboard": [
    { "userId": "user10", "score": 300, "rank": 1 },
    { "userId": "user11", "score": 250, "rank": 2 }
  ]
}
```

WebSocket (Socket.IO)

The server emits `score_updated` events to all connected clients whenever a score is changed.

Example client (browser):

```html
<!-- test-socket.html contains similar code; snippet here for quick testing -->
<script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
<script>
  const socket = io("http://localhost:3000");
  socket.on("connect", () => console.log("connected", socket.id));
  socket.on("score_updated", (msg) =>
    console.log("score_updated received:", msg)
  );
  socket.on("disconnect", () => console.log("disconnected"));
</script>
```

Example: update a score using cURL (PowerShell compatible):

```powershell
curl -X POST http://localhost:3000/score -H "Content-Type: application/json" -d '{ "userId": "user9", "value": 200 }'
```


Test socket client (browser)

You can open `test-socket.html` included in the project to see real-time `score_updated` events in your browser.

Quick steps:

- Option A — Open the file directly (may be blocked by some browsers for Socket.IO):

  1. Open `c:\mini-leaderboard\test-socket.html` in your browser (double-click or `File -> Open`).
  2. Open DevTools Console to see logs (F12 / Ctrl+Shift+I).



What you'll see:

- When the page connects it will log the socket id and any `score_updated` events emitted by the server.
- When you POST to `/score` (or update a score from another client), the page will receive and display the `score_updated` payload in real time.

If you do not see updates:

- Ensure the server is running (`npm start`) and the `PORT` matches the URL used by `test-socket.html` (default `http://localhost:3000`).
- Check the browser console for connection errors. If cross-origin or direct-file restrictions occur, use the local HTTP server approach (Option B).


License

- MIT (or update to your desired license)

If you want, I can add the graceful shutdown and structured logging now, or create an `env.example` file and a basic test to validate ranking behavior.
