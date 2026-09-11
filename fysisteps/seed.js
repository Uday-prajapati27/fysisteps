const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { store, saveStore } = require('./config/store');

async function seedDemoData(){
  const password = await bcrypt.hash('Demo@123', 10);
  const demoUsers = [
    ['Aarav Mehta', 'aarav_mehta', 'aarav@demo.greensteps', 420, 8, { trees: 12, wasteKg: 18, waterLitres: 450 }],
    ['Priya Sharma', 'priya_sharma', 'priya@demo.greensteps', 360, 7, { trees: 9, wasteKg: 14, waterLitres: 380 }],
    ['Rahul Verma', 'rahul_verma', 'rahul@demo.greensteps', 290, 6, { trees: 7, wasteKg: 11, waterLitres: 260 }],
    ['Aditi Singh', 'aditi_singh', 'aditi@demo.greensteps', 210, 5, { trees: 5, wasteKg: 8, waterLitres: 220 }]
  ];
  const ids = {};
  for (const [name, username, email, points, verifiedActivities, impact] of demoUsers) {
    let u = store.users.find(x => x.email === email);
    if (!u) {
      u = {
        _id: randomUUID(),
        name,
        username,
        email,
        password,
        avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=2f7d32&textColor=ffffff`,
        bio: 'Active environmental protector & GreenSteps community leader. 🌍',
        points,
        verifiedActivities,
        followers: [],
        following: [],
        impact,
        organizations: [],
        createdAt: new Date(),
        isDemo: true
      };
      store.users.push(u);
    } else {
      u.isDemo = true;
      u.username = u.username || username;
      u.avatar = u.avatar || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=2f7d32&textColor=ffffff`;
      ids[email] = u._id;
    }
    ids[email] = u._id;
  }

  // Seed verified community activities if none exist
  if (!store.activities || store.activities.length === 0) {
    store.activities = [
      {
        _id: 'act_priya_cleanup_01',
        user: ids['priya@demo.greensteps'] || 'user_priya',
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
          aiSummary: 'Significant environmental transformation verified with pristine beach state.'
        },
        pointsAwarded: 50,
        impactMetrics: { trees: 0, cleanups: 1, wasteKg: 120, waterLitres: 0 },
        likes: 14,
        likedBy: [],
        comments: [
          {
            id: 'c_01',
            userId: ids['rahul@demo.greensteps'] || 'user_rahul',
            user: 'Rahul Verma',
            username: 'rahul_verma',
            avatar: 'https://api.dicebear.com/9.x/initials/svg?seed=Rahul+Verma&backgroundColor=2f7d32&textColor=ffffff',
            text: 'Incredible work on the beach! The shoreline looks completely restored.',
            createdAt: new Date(Date.now() - 3600000 * 12)
          }
        ],
        isDemo: false
      },
      {
        _id: 'act_rahul_trees_02',
        user: ids['rahul@demo.greensteps'] || 'user_rahul',
        userName: 'Rahul Verma',
        username: 'rahul_verma',
        category: 'tree_plantation',
        title: 'Native Neem & Peepal Afforestation',
        description: 'Planted 15 indigenous saplings along the riverbank green belt to prevent soil erosion and improve biodiversity.',
        beforeImage: 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?auto=format&fit=crop&w=1000&q=80',
        afterImage: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1000&q=80',
        video: '',
        latitude: 29.9457,
        longitude: 78.1642,
        locationName: 'Ganga Riverfront, Haridwar',
        locationAccuracy: 8,
        submittedAt: new Date(Date.now() - 3600000 * 36),
        createdAt: new Date(Date.now() - 3600000 * 36),
        verificationStatus: 'verified',
        verificationScore: 95,
        verificationSignals: ['GPS Coordinates Validated', 'Sapling species identified'],
        aiVerification: {
          score: 95,
          detectedObjects: ['sapling', 'fresh soil', 'protective tree guards'],
          authenticity: 'Verified Authentic',
          aiSummary: 'Native tree plantation verified with tree guards installed.'
        },
        pointsAwarded: 50,
        impactMetrics: { trees: 15, cleanups: 0, wasteKg: 0, waterLitres: 0 },
        likes: 22,
        likedBy: [],
        comments: [
          {
            id: 'c_02',
            userId: ids['aditi@demo.greensteps'] || 'user_aditi',
            user: 'Aditi Singh',
            username: 'aditi_singh',
            avatar: 'https://api.dicebear.com/9.x/initials/svg?seed=Aditi+Singh&backgroundColor=2f7d32&textColor=ffffff',
            text: 'Neem trees are so vital for local biodiversity! Wonderful initiative.',
            createdAt: new Date(Date.now() - 3600000 * 24)
          }
        ],
        isDemo: false
      },
      {
        _id: 'act_aditi_waste_03',
        user: ids['aditi@demo.greensteps'] || 'user_aditi',
        userName: 'Aditi Singh',
        username: 'aditi_singh',
        category: 'waste_management',
        title: 'Community Compost Pit Setup',
        description: 'Set up dual wet waste segregation bins and aerobic composting for 24 households in Lodhi Colony, diverting 45kg organic waste weekly.',
        beforeImage: 'https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&w=1000&q=80',
        afterImage: 'https://images.unsplash.com/photo-1584467735815-f778f274e296?auto=format&fit=crop&w=1000&q=80',
        video: '',
        latitude: 28.5916,
        longitude: 77.2274,
        locationName: 'Lodhi Colony, New Delhi',
        locationAccuracy: 10,
        submittedAt: new Date(Date.now() - 3600000 * 48),
        createdAt: new Date(Date.now() - 3600000 * 48),
        verificationStatus: 'verified',
        verificationScore: 96,
        verificationSignals: ['Community compost system active', 'Organic waste diversion confirmed'],
        aiVerification: {
          score: 96,
          detectedObjects: ['compost bin', 'organic mulch', 'segregation labels'],
          authenticity: 'Verified Authentic',
          aiSummary: 'Compost setup verified with organic waste actively cycling.'
        },
        pointsAwarded: 50,
        impactMetrics: { trees: 0, cleanups: 0, wasteKg: 45, waterLitres: 0 },
        likes: 19,
        likedBy: [],
        comments: [],
        isDemo: false
      }
    ];
  }


  const orgs=[
    ['EcoWarriors India','Community-led cleanup and tree plantation initiatives across India.','New Delhi, India','🌿','Non-Profit NGO'],
    ['Green Roots Foundation','Urban forestry, Miyawaki forests, and native tree restoration programs.','Pune, Maharashtra','🌳','Environmental Foundation'],
    ['River Guardians Collective','Water conservation, lake revival, and riverbank restoration campaigns.','Haridwar, Uttarakhand','💧','Grassroots Movement']
  ];
  for(const [name,description,location,icon,type] of orgs){
    if(!store.organizations.some(o=>o.isDemo&&o.name===name)) {
      store.organizations.push({
        _id:randomUUID(),
        name,
        description,
        location,
        icon,
        type,
        members:Math.floor(250+Math.random()*600),
        website:'https://greensteps.eco',
        isDemo:true
      });
    }
  }

  const rewards=[
    ['15% Off Eco Products & Reusables','Redeem for instant savings on organic, plastic-free living essentials.',300,'🌱','EcoStore India'],
    ['Verified Tree Plantation Certificate','Digital & physical verified certificate with GPS plot tracking for your planted tree.',250,'🌳','GreenSteps Foundation'],
    ['Free Public Bike Pass — 1 Day','Access eco-friendly smart public bicycles in participating metro cities.',200,'🚲','Smart City Mobility']
  ];
  for(const [title,description,cost,icon,partnerName] of rewards){
    if(!store.rewards.some(r=>r.isDemo&&r.title===title)) {
      store.rewards.push({
        _id:randomUUID(),
        title,
        description,
        cost,
        icon,
        partnerName,
        codePrefix:'GREEN',
        isDemo:true
      });
    }
  }
  saveStore();
}
if (require.main === module) {
  seedDemoData();
  console.log('Demo data seeded successfully.');
}
module.exports={seedDemoData};
