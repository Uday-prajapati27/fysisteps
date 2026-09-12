require('dotenv').config();
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { connectDB, closeDB, isMongoConnected } = require('./config/db');
const {
  User,
  Activity,
  Reward,
  Organization,
  Event
} = require('./models');

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
    {
      _id: 'act_priya_cleanup_01',
      user: userIds['priya@demo.greensteps'] || 'user_priya',
      userName: 'Priya Sharma',
      username: 'priya_sharma',
      category: 'cleanup',
      title: 'Versova Coastal Cleanup Drive',
      description: 'Organized a weekend community cleanup drive at Versova Beach. Cleared 120kg of microplastics and discarded fishing nets before high tide.',
      beforeImage: 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=1000&q=80',
      afterImage: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1000&q=80',
      video: '',
      latitude: 19.1316,
      longitude: 72.8139,
      locationName: 'Versova Beach, Mumbai',
      locationAccuracy: 12,
      submittedAt: new Date(Date.now() - 3600000 * 18),
      createdAt: new Date(Date.now() - 3600000 * 18),
      verificationStatus: 'verified',
      verificationScore: 98,
      verificationSignals: ['High GPS fidelity', 'Computer Vision delta verified', 'Debris cleared confirmed'],
      aiVerification: {
        score: 97,
        detectedObjects: ['coastal sand', 'ocean debris', 'recycled bags'],
        authenticity: 'Verified Authentic',
        aiSummary: 'AI-assisted analysis: Significant environmental transformation verified with pristine beach state.'
      },
      pointsAwarded: 50,
      impactMetrics: { trees: 0, cleanups: 1, wasteKg: 120, waterLitres: 0 },
      likes: 14,
      likedBy: [],
      comments: [
        {
          id: 'c_01',
          userId: String(userIds['rahul@demo.greensteps'] || 'user_rahul'),
          user: 'Rahul Verma',
          username: 'rahul_verma',
          avatar: 'https://api.dicebear.com/9.x/initials/svg?seed=Rahul+Verma&backgroundColor=2f7d32&textColor=ffffff',
          text: 'Incredible work on the beach! The shoreline looks completely restored.',
          createdAt: new Date(Date.now() - 3600000 * 12)
        }
      ],
      isDemo: true
    },
    {
      _id: 'act_rahul_trees_02',
      user: userIds['rahul@demo.greensteps'] || 'user_rahul',
      userName: 'Rahul Verma',
      username: 'rahul_verma',
      category: 'tree-planting',
      title: 'Native Neem Sapling Plantation',
      description: 'Planted 15 drought-resistant native Neem and Peepal saplings along the residential school boundary wall.',
      beforeImage: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1000&q=80',
      afterImage: 'https://images.unsplash.com/photo-1576085898323-218337e3e43c?auto=format&fit=crop&w=1000&q=80',
      video: '',
      latitude: 18.5204,
      longitude: 73.8567,
      locationName: 'Pune Greenway Corridor, Pune',
      locationAccuracy: 8,
      submittedAt: new Date(Date.now() - 3600000 * 36),
      createdAt: new Date(Date.now() - 3600000 * 36),
      verificationStatus: 'verified',
      verificationScore: 95,
      verificationSignals: ['Soil excavation validated', 'Flora species matched native catalog', 'Geo-fence matched'],
      aiVerification: {
        score: 95,
        detectedObjects: ['sapling root ball', 'mulched soil', 'tree guard'],
        authenticity: 'Verified Authentic',
        aiSummary: 'AI-assisted analysis: Genuine sapling installation verified in suitable terrain.'
      },
      pointsAwarded: 50,
      impactMetrics: { trees: 15, cleanups: 0, wasteKg: 0, waterLitres: 0 },
      likes: 22,
      likedBy: [],
      comments: [],
      isDemo: true
    },
    {
      _id: 'act_aarav_cleanup_03',
      user: userIds['aarav@demo.greensteps'] || 'user_aarav',
      userName: 'Aarav Mehta',
      username: 'aarav_mehta',
      category: 'cleanup',
      title: 'Yamuna Riverbank Clean Drive',
      description: 'Community volunteers cleared non-biodegradable textile and plastic debris from the riverbank ghats.',
      beforeImage: 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=1000&q=80',
      afterImage: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1000&q=80',
      video: '',
      latitude: 28.6139,
      longitude: 77.2090,
      locationName: 'Nigambodh Ghat, Delhi',
      locationAccuracy: 15,
      submittedAt: new Date(Date.now() - 3600000 * 52),
      createdAt: new Date(Date.now() - 3600000 * 52),
      verificationStatus: 'verified',
      verificationScore: 92,
      verificationSignals: ['Riverbank proximity verified', 'Debris reduction verified'],
      aiVerification: {
        score: 92,
        detectedObjects: ['river edge', 'waste sacks', 'cleared bank'],
        authenticity: 'Verified Authentic',
        aiSummary: 'AI-assisted analysis: Substantial waste removal confirmed along the shoreline.'
      },
      pointsAwarded: 50,
      impactMetrics: { trees: 0, cleanups: 1, wasteKg: 85, waterLitres: 0 },
      likes: 19,
      likedBy: [],
      comments: [],
      isDemo: true
    }
  ];

  for (const act of demoActs) {
    const existing = await Activity.findById(act._id);
    if (!existing) {
      await Activity.create(act);
      console.log(`✓ [Seed Mongo] Created demo activity: ${act.title}`);
    } else {
      console.log(`  [Seed Mongo] Existing demo activity found: ${act.title}`);
    }
  }

  // 3. Seed Demo Organizations
  const orgs = [
    ['EcoWarriors India', 'Community-led cleanup and tree plantation initiatives across India.', 'New Delhi, India', '🌿', 'Non-Profit NGO'],
    ['Green Roots Foundation', 'Urban forestry, Miyawaki forests, and native tree restoration programs.', 'Pune, Maharashtra', '🌳', 'Environmental Foundation'],
    ['River Guardians Collective', 'Water conservation, lake revival, and riverbank restoration campaigns.', 'Haridwar, Uttarakhand', '💧', 'Grassroots Movement']
  ];
  for (const [name, description, location, icon, type] of orgs) {
    const existing = await Organization.findOne({ name });
    if (!existing) {
      await Organization.create({
        _id: randomUUID(),
        name,
        description,
        location,
        icon,
        type,
        members: Math.floor(250 + Math.random() * 600),
        website: 'https://greensteps.eco',
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
