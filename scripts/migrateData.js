require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDB, closeDB, isMongoConnected } = require('../config/db');
const {
  User,
  Activity,
  Reward,
  Organization,
  Redemption,
  Order,
  Event
} = require('../models');

async function migrateData() {
  console.log('==============================================');
  console.log('FysiSteps: Migrating data.json to MongoDB Atlas');
  console.log('==============================================\n');

  const dataPath = path.join(__dirname, '..', 'config', 'data.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`Error: data.json file not found at ${dataPath}`);
    process.exit(1);
  }

  let rawData;
  try {
    rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (err) {
    console.error(`Error parsing data.json: ${err.message}`);
    process.exit(1);
  }

  const connected = await connectDB();
  if (!connected || !isMongoConnected()) {
    console.error('Migration aborted: Unable to establish an active connection to MongoDB.');
    console.error('Please ensure MONGODB_URI is set in your environment / .env file and network access is configured.');
    process.exit(1);
  }

  const summary = {
    users: { total: 0, imported: 0, skipped: 0 },
    activities: { total: 0, imported: 0, skipped: 0 },
    rewards: { total: 0, imported: 0, skipped: 0 },
    organizations: { total: 0, imported: 0, skipped: 0 },
    redemptions: { total: 0, imported: 0, skipped: 0 },
    orders: { total: 0, imported: 0, skipped: 0 },
    events: { total: 0, imported: 0, skipped: 0 }
  };

  try {
    // 1. Users
    const users = Array.isArray(rawData.users) ? rawData.users : [];
    summary.users.total = users.length;
    for (const u of users) {
      if (!u || !u._id) continue;
      const exists = await User.findOne({ $or: [{ _id: u._id }, { email: u.email }, { username: u.username }] });
      if (!exists) {
        await User.create(u);
        summary.users.imported++;
      } else {
        summary.users.skipped++;
      }
    }
    console.log(`✓ Users: ${summary.users.imported} imported, ${summary.users.skipped} existing/skipped (total in json: ${summary.users.total})`);

    // 2. Activities
    const activities = Array.isArray(rawData.activities) ? rawData.activities : [];
    summary.activities.total = activities.length;
    for (const a of activities) {
      if (!a || !a._id) continue;
      const exists = await Activity.findById(a._id);
      if (!exists) {
        // Ensure user reference is formatted
        const userId = typeof a.user === 'object' && a.user !== null ? (a.user._id || String(a.user)) : String(a.user || '');
        await Activity.create({
          ...a,
          user: userId
        });
        summary.activities.imported++;
      } else {
        summary.activities.skipped++;
      }
    }
    console.log(`✓ Activities: ${summary.activities.imported} imported, ${summary.activities.skipped} existing/skipped (total in json: ${summary.activities.total})`);

    // 3. Rewards
    const rewards = Array.isArray(rawData.rewards) ? rawData.rewards : [];
    summary.rewards.total = rewards.length;
    for (const r of rewards) {
      if (!r || !r._id) continue;
      const exists = await Reward.findById(r._id);
      if (!exists) {
        await Reward.create(r);
        summary.rewards.imported++;
      } else {
        summary.rewards.skipped++;
      }
    }
    console.log(`✓ Rewards: ${summary.rewards.imported} imported, ${summary.rewards.skipped} existing/skipped (total in json: ${summary.rewards.total})`);

    // 4. Organizations
    const organizations = Array.isArray(rawData.organizations) ? rawData.organizations : [];
    summary.organizations.total = organizations.length;
    for (const o of organizations) {
      if (!o || !o._id) continue;
      const exists = await Organization.findById(o._id);
      if (!exists) {
        await Organization.create(o);
        summary.organizations.imported++;
      } else {
        summary.organizations.skipped++;
      }
    }
    console.log(`✓ Organizations: ${summary.organizations.imported} imported, ${summary.organizations.skipped} existing/skipped (total in json: ${summary.organizations.total})`);

    // 5. Redemptions
    const redemptions = Array.isArray(rawData.redemptions) ? rawData.redemptions : [];
    summary.redemptions.total = redemptions.length;
    for (const red of redemptions) {
      if (!red || !red._id) continue;
      const exists = await Redemption.findById(red._id);
      if (!exists) {
        await Redemption.create(red);
        summary.redemptions.imported++;
      } else {
        summary.redemptions.skipped++;
      }
    }
    console.log(`✓ Redemptions: ${summary.redemptions.imported} imported, ${summary.redemptions.skipped} existing/skipped (total in json: ${summary.redemptions.total})`);

    // 6. Orders
    const orders = Array.isArray(rawData.orders) ? rawData.orders : [];
    summary.orders.total = orders.length;
    for (const ord of orders) {
      if (!ord || !ord.orderId) continue;
      const exists = await Order.findOne({ orderId: ord.orderId });
      if (!exists) {
        await Order.create(ord);
        summary.orders.imported++;
      } else {
        summary.orders.skipped++;
      }
    }
    console.log(`✓ Orders: ${summary.orders.imported} imported, ${summary.orders.skipped} existing/skipped (total in json: ${summary.orders.total})`);

    // 7. Events (if any)
    const events = Array.isArray(rawData.events) ? rawData.events : [];
    summary.events.total = events.length;
    for (const ev of events) {
      if (!ev || !ev._id) continue;
      const exists = await Event.findById(ev._id);
      if (!exists) {
        await Event.create(ev);
        summary.events.imported++;
      } else {
        summary.events.skipped++;
      }
    }
    if (events.length > 0) {
      console.log(`✓ Events: ${summary.events.imported} imported, ${summary.events.skipped} existing/skipped (total in json: ${summary.events.total})`);
    }

    console.log('\n==============================================');
    console.log('Data migration complete! Summary:');
    console.log(`Total records imported into MongoDB: ${
      summary.users.imported +
      summary.activities.imported +
      summary.rewards.imported +
      summary.organizations.imported +
      summary.redemptions.imported +
      summary.orders.imported +
      summary.events.imported
    }`);
    console.log('==============================================');
  } catch (err) {
    console.error(`Migration error: ${err.message}`, err);
  } finally {
    await closeDB();
  }
}

if (require.main === module) {
  migrateData().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrateData;
