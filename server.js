import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import cors from "cors";
import { createClient } from "redis";
import dotenv from "dotenv";
import Score from "./models/score.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const REDIS_LEADERBOARD_KEY = "leaderboard";
const LEADERBOARD_LIMIT = 10;
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const REDIS_URL = process.env.REDIS_URL;
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

async function hydrateLeaderboard(client) {
  const scores = await Score.find().select("userId value").sort({ value: -1 });
  if (!scores.length) {
    return;
  }

  await client.sendCommand(["DEL", REDIS_LEADERBOARD_KEY]);

  for (const score of scores) {
    await client.sendCommand([
      "ZADD",
      REDIS_LEADERBOARD_KEY,
      String(score.value),
      String(score.userId),
    ]);
  }
}

function toStr(v) {
  return v == null ? "" : String(v);
}

async function zRevRank(client, key, member) {
  // Use direct command to avoid mismatched client API versions
  try {
    const resp = await client.sendCommand(["ZREVRANK", key, toStr(member)]);
    // Redis returns null when the member is not present
    if (resp === null) return null;
    // sendCommand may return string, convert to number
    return Number(resp);
  } catch (err) {
    throw err;
  }
}

async function start() {
  // ------------------ MongoDB ------------------
  await mongoose.connect(MONGODB_URI);
  console.log("MongoDB connected");

  // ------------------ Redis ------------------
  let client = createClient({
    url: REDIS_URL,
  });

  client.on("error", (err) => {
    console.log("❌ Redis Error:", err.message);
  });

  client.on("end", () => {
    console.log("⚠️ Redis connection closed");
  });

  client.on("reconnecting", () => {
    console.log("🔄 Reconnecting to Redis...");
  });

  await client.connect();
  console.log("Redis connected");

  await hydrateLeaderboard(client);

  // ------------------ ROUTES ------------------

  // POST /score (update + broadcast)
  app.post("/score", async (req, res) => {
    const { userId, value } = req.body;

    if (!userId || typeof value !== "number") {
      return res.status(400).json({ error: "Invalid body" });
    }

    // 1. Update DB
    const scoreDoc = await Score.findOneAndUpdate(
      { userId },
      { value },
      { new: true, upsert: true }
    );
    // 2. Compute rank from DB (authoritative) so we don't rely on Redis availability
    let rank = 1;
    try {
      const higherCount = await Score.countDocuments({
        value: { $gt: scoreDoc.value },
      });
      rank = higherCount + 1;
    } catch (dbErr) {
      console.log("⚠️ DB rank calculation failed:", dbErr.message);
    }

    // 3. Best-effort: update Redis cache (don't block correct rank emission)
    (async () => {
      try {
        await client.sendCommand([
          "ZADD",
          REDIS_LEADERBOARD_KEY,
          String(scoreDoc.value),
          toStr(scoreDoc.userId),
        ]);
      } catch (e) {
        console.log("⚠️ Redis write failed (background):", e.message);
      }
    })();

    const payload = {
      userId,
      score: scoreDoc.value,
      rank,
    };

    console.log("🔥 Emitting score_updated:", payload);

    // 4. WebSocket event
    io.emit("score_updated", payload);

    return res.json(payload);
  });

  // GET /leaderboard
  app.get("/leaderboard", async (req, res) => {
    let cached = [];

    try {
      cached = await client.sendCommand([
        "ZREVRANGE",
        REDIS_LEADERBOARD_KEY,
        "0",
        String(LEADERBOARD_LIMIT - 1),
        "WITHSCORES",
      ]);
    } catch (e) {
      console.log("⚠️ Redis read failed:", e.message);
    }

    if (cached.length > 0) {
      const result = [];

      for (let i = 0; i < cached.length; i += 2) {
        result.push({
          userId: cached[i],
          score: Number(cached[i + 1]),
          rank: i / 2 + 1,
        });
      }

      return res.json({
        source: "redis",
        leaderboard: result,
      });
    }

    // ---------- DB fallback ----------
    const dbScores = await Score.find()
      .sort({ value: -1 })
      .limit(LEADERBOARD_LIMIT);

    // Rebuild Redis
    try {
      for (const d of dbScores) {
        await client.sendCommand([
          "ZADD",
          REDIS_LEADERBOARD_KEY,
          String(d.value),
          toStr(d.userId),
        ]);
      }

      await client.expire(REDIS_LEADERBOARD_KEY, 60);
    } catch (e) {
      console.log("⚠️ Redis rebuild failed:", e.message);
    }

    const leaderboard = dbScores.map((d, i) => ({
      userId: d.userId,
      score: d.value,
      rank: i + 1,
    }));

    return res.json({
      source: "db",
      leaderboard,
    });
  });

  // ------------------ WebSocket Logging ------------------
  io.on("connection", (socket) => {
    console.log("🟢 WS CONNECTED:", socket.id);

    socket.on("disconnect", () => {
      console.log("🔴 WS DISCONNECTED:", socket.id);
    });
  });

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

start();
