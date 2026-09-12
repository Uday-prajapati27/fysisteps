const mongoose = require('mongoose');

// Fail fast on disconnected operations rather than buffering commands indefinitely
mongoose.set('bufferCommands', false);

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    const errorMsg = 'MONGODB_URI is not set in environment or .env file. Please configure MONGODB_URI to connect to MongoDB Atlas.';
    console.warn('\n==================================================================');
    console.warn('⚠️  [FysiSteps Database Warning] ' + errorMsg);
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
    return conn;
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
