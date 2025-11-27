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
npm clone https://github.com/roy4262/leaderboard/tree/main
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

Notes and troubleshooting

- If Redis is unreachable (e.g. `ECONNRESET`), the server still computes rank from MongoDB and emits the correct `rank` to WebSocket clients. Redis writes are background best-effort operations and read operations fall back to the DB when needed.
- You may see Redis reconnect logs like `🔄 Reconnecting to Redis...` or `❌ Redis Error: read ECONNRESET` — this is an indication the client lost a connection; the server will continue to work using DB fallback.
- If you need stronger Redis semantics (strictly consistent cache updates), consider wrapping DB+Redis changes in a transaction-like workflow or using optimistic concurrency — note that Redis alone cannot replace the DB as the source-of-truth in this app.

Recommended improvements (future)

- Add graceful shutdown handlers to close Redis and MongoDB connections on exit (SIGINT/SIGTERM).
- Add logging via a structured logger (winston or pino) and optional request tracing.
- Add rate-limits and authentication for the `POST /score` endpoint to prevent abuse.
- Add unit/integration tests for ranking logic and Redis fallback behavior.

License

- MIT (or update to your desired license)

If you want, I can add the graceful shutdown and structured logging now, or create an `env.example` file and a basic test to validate ranking behavior.
