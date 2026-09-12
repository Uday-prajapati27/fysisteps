require('dotenv').config();
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { connectDB, closeDB, isMongoConnected } = require('../config/db');
const {
  User,
  Activity,
  Reward,
  Organization,
  Event
} = require('../models');

async function seedDemoData() {
  console.log('==============================================');
  console.log('FysiSteps: Seeding Demo Dataset to MongoDB Atlas');
  console.log('==============================================\n');

  if (!isMongoConnected()) {
    throw new Error('Database is not connected. Ensure MONGODB_URI is configured before running seed.');
  }

  const password = await bcrypt.hash('Demo@123', 10);

  const demoUsers = [
    ['Aarav Mehta', 'aarav_mehta', 'aarav@demo.greensteps', 420, 8, { trees: 12, cleanups: 4, wasteKg: 18, waterLitres: 450 }],
    ['Priya Sharma', 'priya_sharma', 'priya@demo.greensteps', 360, 7, { trees: 9, cleanups: 5, wasteKg: 14, waterLitres: 380 }],
    ['Rahul Verma', 'rahul_verma', 'rahul@demo.greensteps', 290, 6, { trees: 7, cleanups: 3, wasteKg: 11, waterLitres: 260 }],
    ['Aditi Singh', 'aditi_singh', 'aditi@demo.greensteps', 210, 5, { trees: 5, cleanups: 2, wasteKg: 8, waterLitres: 220 }]
  ];

  const userIds = {};

  // 1. Seed Demo Users
  for (const [name, username, email, points, verifiedActivities, impact] of demoUsers) {
    let u = await User.findOne({ $or: [{ email }, { username }] });
    if (!u) {
      const newId = randomUUID();
      u = await User.create({
        _id: newId,
        name,
        username,
        email,
        password,
        avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=2f7d32&textColor=ffffff`,
        bio: 'Active environmental protector & GreenSteps community leader. 🌍',
        points,
        verifiedActivities,
        impact,
        ecoCoins: 100,
        isDemo: true
      });
      console.log(`✓ [Seed Mongo] Created demo user: @${username}`);
    } else {
      console.log(`  [Seed Mongo] Existing demo user found: @${username}`);
    }
    userIds[email] = u._id;
  }

  // 2. Seed Demo Activities
  const demoActs = [
    [
      userIds['aarav@demo.greensteps'],
      'Massive Public Park Plastic Cleanup',
      'Cleaned up plastic bottles, wrappers, and debris from Central Biodiversity Park alongside 12 community volunteers.',
      'cleanup',
      'Central Park, Sector 5',
      'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=600&q=80',
      { lat: 28.6139, lng: 77.2090 },
      14,
      95
    ],
    [
      userIds['priya_sharma'],
      'Native Saplings Plantation Drive',
      'Planted 15 neem and peepal saplings in the urban community garden to improve microclimate & biodiversity.',
      'tree-planting',
      'Green Belt Sector 22',
      'https://images.unsplash.com/photo-1576085898323-218337e3e43c?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=600&q=80',
      { lat: 19.0760, lng: 72.8777 },
      18,
      92
    ]
  ];

  for (const [userId, title, description, category, location, beforeImg, afterImg, coords, impactVal, score] of demoActs) {
    if (!userId) continue;
    const existing = await Activity.findOne({ user: userId, title });
    if (!existing) {
      await Activity.create({
        _id: randomUUID(),
        user: userId,
        title,
        description,
        category,
        location,
        beforeImage: beforeImg,
        afterImage: afterImg,
        coordinates: coords,
        impactValue: impactVal,
        verificationStatus: 'verified',
        verificationScore: score,
        aiVerification: {
          verified: true,
          score,
          category,
          impactScore: score,
          reasoning: 'AI computer vision verified genuine physical transformation with high environmental contrast.'
        },
        pointsAwarded: score >= 90 ? 50 : 30,
        isDemo: true
      });
      console.log(`✓ [Seed Mongo] Created demo activity: ${title}`);
    } else {
      console.log(`  [Seed Mongo] Existing demo activity found: ${title}`);
    }
  }

  // 3. Seed Demo Organizations
  const orgs = [
    ['Youth Climate Action Alliance', 'Empowering university students and youth to lead cleanups, plastic-free drives, and green policy advocacy.', 'youth-group', 85, 'Delhi NCR', 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=400&q=80'],
    ['Green Earth Society', 'Dedicated to urban reforestation, afforestation drives, and native habitat restoration.', 'ngo', 120, 'Bengaluru', 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=400&q=80'],
    ['Ocean & River Protectors', 'Community-driven volunteer coalition eliminating ocean plastic pollution along coastal zones.', 'community', 64, 'Mumbai', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80']
  ];
  for (const [name, description, type, membersCount, location, logo] of orgs) {
    const existing = await Organization.findOne({ name });
    if (!existing) {
      await Organization.create({
        _id: randomUUID(),
        name,
        description,
        type,
        membersCount,
        location,
        logo,
        verified: true,
        isDemo: true
      });
      console.log(`✓ [Seed Mongo] Created demo organization: ${name}`);
    } else {
      console.log(`  [Seed Mongo] Existing demo organization found: ${name}`);
    }
  }

  // 4. Seed Demo Rewards
  const rewards = [
    ['15% Off Eco Products & Reusables', 'Redeem for instant savings on organic, plastic-free living essentials.', 300, '🌱', 'EcoStore India'],
    ['Verified Tree Plantation Certificate', 'Digital & physical verified certificate with GPS plot tracking for your planted tree.', 250, '🌳', 'GreenSteps Foundation'],
    ['Free Public Bike Pass — 1 Day', 'Access eco-friendly smart public bicycles in participating metro cities.', 200, '🚲', 'Smart City Mobility']
  ];
  for (const [title, description, cost, icon, partnerName] of rewards) {
    const existing = await Reward.findOne({ title });
    if (!existing) {
      await Reward.create({
        _id: randomUUID(),
        title,
        description,
        cost,
        icon,
        partnerName,
        codePrefix: 'GREEN',
        isDemo: true
      });
      console.log(`✓ [Seed Mongo] Created demo reward: ${title}`);
    } else {
      console.log(`  [Seed Mongo] Existing demo reward found: ${title}`);
    }
  }

  console.log('\n==============================================');
  console.log('✓ Demo data seeding completed successfully!');
  console.log('==============================================\n');
}

async function runSeedStandalone() {
  const connected = await connectDB();
  if (!connected) {
    console.error('Fatal: Cannot connect to MongoDB. Check MONGODB_URI in your .env file.');
    process.exit(1);
  }
  try {
    await seedDemoData();
  } finally {
    await closeDB();
  }
}

if (require.main === module) {
  runSeedStandalone()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seed script error:', err.message);
      process.exit(1);
    });
}

module.exports = { seedDemoData };
