const mongoose = require('mongoose');

// Fail fast on disconnected operations rather than buffering commands indefinitely
mongoose.set('bufferCommands', false);

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.log('[DEV/LOCAL MODE] MONGODB_URI is not set. Operating in local development mode using config/data.json fallback.');
    isConnected = false;
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true
    });

    isConnected = true;
    console.log(`MongoDB connected successfully: ${conn.connection.host || 'Atlas Cluster'}`);
    return true;
  } catch (err) {
    isConnected = false;
    console.error(`MongoDB connection failed: ${err.message}`);
    // If in production, fail hard
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Critical: Failed to connect to MongoDB Atlas in production: ${err.message}`);
    }
    console.warn('[DEV/LOCAL MODE] Falling back to local JSON store due to connection failure during development.');
    return false;
  }
}

function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

async function closeDB() {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
  }
}

module.exports = {
  connectDB,
  isMongoConnected,
  closeDB
};
