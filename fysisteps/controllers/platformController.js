const { randomUUID } = require("crypto");
const { getProducts } = require("../services/productService");
const { store, saveStore } = require("../config/store");
const safe = u => {
  if (!u) return null;
  const { password, ...x } = u;
  return x;
};

function stats(req, res) {
  const users = store.users || [];
  const createdAccounts = users.filter(u => !u.isDemo);
  const acts = store.activities || [];
  const verifiedActs = acts.filter(a => a.verificationStatus === 'verified' && !a.isDemo);

  // Real dynamic calculations from user activities in the database
  const dynamicTrees = verifiedActs.reduce((sum, a) => {
    const t = Number(a.impactMetrics?.trees || 0);
    const cat = String(a.category || '').toLowerCase();
    return sum + (t > 0 ? t : (cat.includes('tree') || cat.includes('plant') ? 1 : 0));
  }, 0);

  const dynamicWasteKg = verifiedActs.reduce((sum, a) => {
    const w = Number(a.impactMetrics?.wasteKg || 0);
    const cat = String(a.category || '').toLowerCase();
    return sum + (w > 0 ? w : (cat.includes('cleanup') || cat.includes('garbage') || cat.includes('waste') ? 10 : 0));
  }, 0);

  const dynamicWaterL = verifiedActs.reduce((sum, a) => {
    const wl = Number(a.impactMetrics?.waterLitres || 0);
    const cat = String(a.category || '').toLowerCase();
    return sum + (wl > 0 ? wl : (cat.includes('water') ? 150 : cat.includes('river') ? 100 : 0));
  }, 0);

  const dynamicPoints = users.reduce((sum, u) => sum + (Number(u.points) || 0), 0);

  const cleanups = verifiedActs.filter(a => {
    const cat = String(a.category || '').toLowerCase();
    return cat.includes('cleanup') || cat.includes('garbage') || cat.includes('waste') || cat.includes('river');
  }).length;

  res.json({
    success: true,
    data: {
      activeWarriors: createdAccounts.length || users.length || 0,
      treesPlanted: dynamicTrees,
      kgWasteRemoved: dynamicWasteKg,
      waterConservedL: dynamicWaterL,
      totalGreenPoints: dynamicPoints,
      cleanupsDone: cleanups
    }
  });
}

function leaderboard(req, res) {
  const rows = store.users.slice().sort((a, b) => b.points - a.points).map((u, i) => ({
    rank: i + 1,
    user: safe(u),
    points: u.points,
    verifiedActivities: u.verifiedActivities,
    impact: u.impact
  }));
  res.json({ success: true, data: rows });
}

function rewards(req, res) {
  res.json({ success: true, data: store.rewards });
}

function redeem(req, res) {
  const r = store.rewards.find(x => x._id === req.params.id);
  const u = store.users.find(x => x._id === req.userId);
  if (!r || !u) return res.status(404).json({ success: false, message: "Reward or user not found" });
  if (u.points < r.cost) return res.status(400).json({ success: false, message: `You need ${r.cost - u.points} more GreenPoints` });
  u.points -= r.cost;
  const code = `${r.codePrefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const redemption = { _id: randomUUID(), user: u._id, reward: r._id, title: r.title, cost: r.cost, code, redeemedAt: new Date() };
  store.redemptions.push(redemption);
  saveStore();
  res.json({ success: true, data: { redemption, user: safe(u) } });
}

function myRedemptions(req, res) {
  res.json({
    success: true,
    data: store.redemptions.filter(x => x.user === req.userId).sort((a, b) => new Date(b.redeemedAt) - new Date(a.redeemedAt))
  });
}

function organizations(req, res) {
  res.json({ success: true, data: store.organizations });
}

function joinOrganization(req, res) {
  const o = store.organizations.find(x => x._id === req.params.id);
  const u = store.users.find(x => x._id === req.userId);
  if (!o || !u) return res.status(404).json({ success: false, message: "Organization not found" });
  if (!u.organizations.includes(o._id)) {
    u.organizations.push(o._id);
    o.members++;
  }
  saveStore();
  res.json({ success: true, data: { organization: o, user: safe(u) } });
}

async function products(req, res) {
  const data = await getProducts();
  res.json({ success: true, data });
}

function dashboard(req, res) {
  const u = store.users.find(x => String(x._id) === String(req.userId));
  if (!u) return res.status(404).json({ success: false, message: "User not found" });
  const targetId = String(u._id);
  const acts = store.activities.filter(a => {
    const actUserId = typeof a.user === "object" && a.user !== null ? String(a.user._id || "") : String(a.user || "");
    return actUserId === targetId;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const earnedFromActivities = acts.filter(a => a.verificationStatus === "verified" || !a.verificationStatus).reduce((sum, a) => sum + Number(a.pointsAwarded || a.pts || 50), 0);
  const redemptions = store.redemptions.filter(r => String(r.user) === targetId);
  const spentOnRewards = redemptions.reduce((sum, r) => sum + Number(r.cost || 0), 0);

  const cleanupActs = acts.filter(a => {
    const cat = String(a.category || '').toLowerCase();
    return cat.includes('garbage') || cat.includes('cleanup') || cat.includes('waste') || cat.includes('river');
  });
  const treeActs = acts.filter(a => {
    const cat = String(a.category || '').toLowerCase();
    return cat.includes('tree') || cat.includes('plantation');
  });

  u.impact = u.impact || { trees: 0, cleanups: 0, wasteKg: 0, waterLitres: 0 };
  u.impact.cleanups = cleanupActs.length;
  u.impact.trees = treeActs.reduce((sum, a) => sum + Number(a.impactMetrics?.trees || 1), 0);

  if (acts.length === 0 && (!u.bonusPoints || u.bonusPoints === 0)) {
    u.points = 0;
    u.verifiedActivities = 0;
    u.activities = 0;
    u.impact.trees = 0;
    u.impact.cleanups = 0;
    u.impact.wasteKg = 0;
    u.impact.waterLitres = 0;
  } else if (acts.length > 0) {
    u.verifiedActivities = acts.filter(a => a.verificationStatus === "verified").length;
    u.activities = acts.length;
    const calculatedPoints = Math.max(0, earnedFromActivities - spentOnRewards + Number(u.bonusPoints || 0));
    u.points = calculatedPoints;
  }
  saveStore();

  const rank = store.users.slice().sort((a, b) => b.points - a.points).findIndex(x => String(x._id) === String(u._id)) + 1;
  res.json({
    success: true,
    data: {
      user: safe(u),
      rank: Math.max(1, rank),
      recentActivities: acts.map(a => ({ ...a, user: safe(u) })),
      recentRewards: redemptions.slice(-5).reverse()
    }
  });
}

function events(req, res) {
  res.json({ success: true, data: store.events || [] });
}

async function checkout(req, res) {
  try {
    const {
      productId,
      productTitle,
      quantity = 1,
      price,
      totalAmount,
      shippingAddress,
      customerName,
      customerPhone,
      paymentMethod = 'upi',
      upiId,
      cardLast4,
      useEcoCoins = false,
      ecoCoinsUsed = 0,
      ecoCoinsEarned = 25
    } = req.body || {};

    if (!productTitle || !price || !shippingAddress || !customerName) {
      return res.status(400).json({
        success: false,
        message: "Missing required checkout details (product, address, and name are required)."
      });
    }

    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const transactionId = 'TXN-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now();

    const u = req.userId ? store.users.find(x => String(x._id) === String(req.userId)) : null;

    let finalCoinsUsed = 0;
    if (u && useEcoCoins && ecoCoinsUsed > 0) {
      finalCoinsUsed = Math.min(Number(u.ecoCoins || 0), Number(ecoCoinsUsed));
      u.ecoCoins = Math.max(0, (u.ecoCoins || 0) - finalCoinsUsed);
    }

    const coinsReward = Number(ecoCoinsEarned || 25);
    if (u) {
      u.ecoCoins = (u.ecoCoins || 0) + coinsReward;
    }

    const newOrder = {
      orderId,
      transactionId,
      userId: req.userId || 'guest',
      userName: customerName,
      userPhone: customerPhone || '',
      productId: productId || 'custom-item',
      productTitle,
      quantity: Number(quantity) || 1,
      unitPrice: Number(price),
      totalAmount: Number(totalAmount || price * (quantity || 1)),
      shippingAddress,
      paymentMethod,
      paymentDetails: {
        method: paymentMethod,
        upiId: upiId || (paymentMethod === 'upi' ? 'verified-upi@okaxis' : null),
        cardLast4: cardLast4 || (paymentMethod === 'card' ? '4242' : null),
        status: 'PAID',
        paidAt: new Date()
      },
      ecoCoinsUsed: finalCoinsUsed,
      ecoCoinsEarned: coinsReward,
      status: 'CONFIRMED',
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', {
        weekday: 'short', month: 'short', day: 'numeric'
      }),
      orderedAt: new Date()
    };

    if (!store.orders) store.orders = [];
    store.orders.unshift(newOrder);
    saveStore();

    res.json({
      success: true,
      message: `🎉 Order placed successfully! ₹${newOrder.totalAmount} paid via ${paymentMethod.toUpperCase()}.`,
      order: newOrder,
      user: u ? safe(u) : null
    });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ success: false, message: "Payment processing failed. Please try again." });
  }
}

function myOrders(req, res) {
  if (!store.orders) store.orders = [];
  const list = req.userId
    ? store.orders.filter(o => String(o.userId) === String(req.userId))
    : store.orders.slice(0, 10);
  res.json({ success: true, data: list });
}

module.exports = {
  stats,
  leaderboard,
  rewards,
  redeem,
  myRedemptions,
  organizations,
  joinOrganization,
  dashboard,
  products,
  events,
  checkout,
  myOrders
};
