import { createClient } from "redis";

const client = await createClient({
  url: "redis://default:al1v1Xrx1MwXqyX6G85G3cJC5aiOBUnT@redis-11652.c98.us-east-1-4.ec2.cloud.redislabs.com:11652"
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
