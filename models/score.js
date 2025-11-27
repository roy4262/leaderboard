import mongoose from "mongoose";

const scoreSchema = new mongoose.Schema({
  userId: { type: String, unique: true, required: true },
  value: { type: Number, required: true }
});

export default mongoose.model("Score", scoreSchema);
