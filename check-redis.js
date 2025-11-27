import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL;
const client = await createClient({
  url: REDIS_URL
})
  .on("error", (err) => console.log("Redis Error:", err))
  .connect();

console.log("Connected to Redis!");

const data = await client.zRange(
  "leaderboard",
  0,
  -1,
  { REV: true, WITHSCORES: true }
);

console.log("\nRAW REDIS DATA:");
console.log(data);

await client.quit();
