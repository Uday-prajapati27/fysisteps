const mongoose = require('mongoose');

// Fail fast on disconnected operations rather than buffering commands indefinitely
mongoose.set('bufferCommands', false);

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    const msg = '[FysiSteps] MONGODB_URI is not set. Please configure MONGODB_URI in your .env file to connect to MongoDB Atlas.';
    console.warn('\n==================================================================');
    console.warn('⚠️  ' + msg);
    console.warn('==================================================================\n');
    isConnected = false;
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true
    });

    isConnected = true;
    console.log(`✓ [FysiSteps] MongoDB Atlas connected: ${conn.connection.host || 'Cluster'}/${conn.connection.name || 'fysisteps'}`);
    return true;
  } catch (err) {
    isConnected = false;
    const errorMsg = `Failed to connect to MongoDB Atlas (${err.message}). Please verify credentials and Network Access IP Whitelist in MongoDB Atlas.`;
    console.error('\n==================================================================');
    console.error('🚨 [FysiSteps Database Error] ' + errorMsg);
    console.error('==================================================================\n');
    throw new Error(errorMsg);
  }
}

function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

async function closeDB() {
  if (isConnected || mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    isConnected = false;
  }
}

module.exports = {
  connectDB,
  isMongoConnected,
  closeDB
};
