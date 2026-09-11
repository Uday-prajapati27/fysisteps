
const mongoose = require("mongoose");
mongoose.set("bufferCommands", false);

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("127.0.0.1:27017") || uri.includes("localhost:27017")) {
    console.log("Using persistent local real-data store (data.json).");
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
    console.log("MongoDB connected.");
    return true;
  } catch (err) {
    console.warn("MongoDB unavailable — falling back to persistent local real-data store (data.json).");
    return false;
  }
}
module.exports = connectDB;
