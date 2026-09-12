const { randomUUID } = require("crypto");
const { getProducts } = require("../services/productService");
const { isMongoConnected } = require("../config/db");
const {
  User,
  Activity,
  Reward,
  Organization,
  Redemption,
  Order,
  Event
} = require("../models");
const { store, saveStore } = require("../config/store");

const safe = u => {
  if (!u) return null;
  if (typeof u.toSafeObject === "function") return u.toSafeObject();
  const obj = u.toObject ? u.toObject() : { ...u };
  delete obj.password;
  delete obj.__v;
  return obj;
};

async function stats(req, res) {
  try {
    if (isMongoConnected()) {
      const [users, verifiedActs] = await Promise.all([
        User.find().lean(),
        Activity.find({ verificationStatus: "verified", isDemo: { $ne: true } }).lean()
      ]);

      const createdAccounts = users.filter(u => !u.isDemo);

      const dynamicTrees = verifiedActs.reduce((sum, a) => {
        const t = Number(a.impactMetrics?.trees || 0);
        const cat = String(a.category || "").toLowerCase();
        return sum + (t > 0 ? t : (cat.includes("tree") || cat.includes("plant") ? 1 : 0));
      }, 0);

      const dynamicWasteKg = verifiedActs.reduce((sum, a) => {
        const w = Number(a.impactMetrics?.wasteKg || 0);
        const cat = String(a.category || "").toLowerCase();
        return sum + (w > 0 ? w : (cat.includes("cleanup") || cat.includes("garbage") || cat.includes("waste") ? 10 : 0));
      }, 0);

      const dynamicWaterL = verifiedActs.reduce((sum, a) => {
        const wl = Number(a.impactMetrics?.waterLitres || 0);
        const cat = String(a.category || "").toLowerCase();
        return sum + (wl > 0 ? wl : (cat.includes("water") ? 150 : cat.includes("river") ? 100 : 0));
      }, 0);

      const dynamicPoints = users.reduce((sum, u) => sum + (Number(u.points) || 0), 0);

      const cleanups = verifiedActs.filter(a => {
        const cat = String(a.category || "").toLowerCase();
        return cat.includes("cleanup") || cat.includes("garbage") || cat.includes("waste") || cat.includes("river");
      }).length;

      return res.json({
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
    } else {
      // Local fallback
      const users = store.users || [];
      const createdAccounts = users.filter(u => !u.isDemo);
      const acts = store.activities || [];
      const verifiedActs = acts.filter(a => a.verificationStatus === "verified" && !a.isDemo);

      const dynamicTrees = verifiedActs.reduce((sum, a) => {
        const t = Number(a.impactMetrics?.trees || 0);
        const cat = String(a.category || "").toLowerCase();
        return sum + (t > 0 ? t : (cat.includes("tree") || cat.includes("plant") ? 1 : 0));
      }, 0);

      const dynamicWasteKg = verifiedActs.reduce((sum, a) => {
        const w = Number(a.impactMetrics?.wasteKg || 0);
        const cat = String(a.category || "").toLowerCase();
        return sum + (w > 0 ? w : (cat.includes("cleanup") || cat.includes("garbage") || cat.includes("waste") ? 10 : 0));
      }, 0);

      const dynamicWaterL = verifiedActs.reduce((sum, a) => {
        const wl = Number(a.impactMetrics?.waterLitres || 0);
        const cat = String(a.category || "").toLowerCase();
        return sum + (wl > 0 ? wl : (cat.includes("water") ? 150 : cat.includes("river") ? 100 : 0));
      }, 0);

      const dynamicPoints = users.reduce((sum, u) => sum + (Number(u.points) || 0), 0);

      const cleanups = verifiedActs.filter(a => {
        const cat = String(a.category || "").toLowerCase();
        return cat.includes("cleanup") || cat.includes("garbage") || cat.includes("waste") || cat.includes("river");
      }).length;

      return res.json({
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
  } catch (err) {
    console.error("Platform stats error:", err);
    res.status(500).json({ success: false, message: "Failed to compute platform stats" });
  }
}

async function leaderboard(req, res) {
  try {
    if (isMongoConnected()) {
      const users = await User.find().sort({ points: -1 }).limit(100).lean();
      const rows = users.map((u, i) => ({
        rank: i + 1,
        user: safe(u),
        points: u.points || 0,
        verifiedActivities: u.verifiedActivities || 0,
        impact: u.impact || { trees: 0, cleanups: 0, wasteKg: 0, waterLitres: 0 }
      }));
      return res.json({ success: true, data: rows });
    } else {
      const rows = store.users.slice().sort((a, b) => (b.points || 0) - (a.points || 0)).map((u, i) => ({
        rank: i + 1,
        user: safe(u),
        points: u.points || 0,
        verifiedActivities: u.verifiedActivities || 0,
        impact: u.impact || { trees: 0, cleanups: 0, wasteKg: 0, waterLitres: 0 }
      }));
      return res.json({ success: true, data: rows });
    }
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch leaderboard" });
  }
}

async function rewards(req, res) {
  try {
    if (isMongoConnected()) {
      const list = await Reward.find().sort({ cost: 1 }).lean();
      return res.json({ success: true, data: list });
    } else {
      return res.json({ success: true, data: store.rewards });
    }
  } catch (err) {
    console.error("Rewards list error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch rewards" });
  }
}

async function redeem(req, res) {
  try {
    const rewardId = req.params.id;
    const userId = req.userId;

    if (isMongoConnected()) {
      const r = await Reward.findById(rewardId).lean();
      if (!r) return res.status(404).json({ success: false, message: "Reward not found" });

      const u = await User.findById(userId);
      if (!u) return res.status(404).json({ success: false, message: "User not found" });

      if (u.points < r.cost) {
        return res.status(400).json({
          success: false,
          message: `You need ${r.cost - u.points} more GreenPoints`
        });
      }

      // Race-condition-safe atomic point deduction
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, points: { $gte: r.cost } },
        { $inc: { points: -r.cost } },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(400).json({
          success: false,
          message: "Insufficient GreenPoints for redemption or balance changed."
        });
      }

      const code = `${r.codePrefix || "GREEN"}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const redemption = await Redemption.create({
        _id: randomUUID(),
        user: String(updatedUser._id),
        reward: String(r._id),
        title: r.title,
        cost: r.cost,
        code,
        redeemedAt: new Date()
      });

      return res.json({
        success: true,
        data: {
          redemption: redemption.toObject(),
          user: safe(updatedUser)
        }
      });
    } else {
      // Local fallback
      const r = store.rewards.find(x => String(x._id) === String(rewardId));
      const u = store.users.find(x => String(x._id) === String(userId));
      if (!r || !u) return res.status(404).json({ success: false, message: "Reward or user not found" });

      if (u.points < r.cost) {
        return res.status(400).json({ success: false, message: `You need ${r.cost - u.points} more GreenPoints` });
      }

      u.points -= r.cost;
      const code = `${r.codePrefix || "GREEN"}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const redemption = {
        _id: randomUUID(),
        user: u._id,
        reward: r._id,
        title: r.title,
        cost: r.cost,
        code,
        redeemedAt: new Date()
      };

      store.redemptions.push(redemption);
      saveStore();

      return res.json({ success: true, data: { redemption, user: safe(u) } });
    }
  } catch (err) {
    console.error("Redeem error:", err);
    res.status(500).json({ success: false, message: "Failed to redeem reward" });
  }
}

async function myRedemptions(req, res) {
  try {
    const userId = req.userId;
    if (isMongoConnected()) {
      const list = await Redemption.find({ user: userId }).sort({ redeemedAt: -1 }).lean();
      return res.json({ success: true, data: list });
    } else {
      const list = store.redemptions
        .filter(x => String(x.user) === String(userId))
        .sort((a, b) => new Date(b.redeemedAt) - new Date(a.redeemedAt));
      return res.json({ success: true, data: list });
    }
  } catch (err) {
    console.error("myRedemptions error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch redemptions" });
  }
}

async function organizations(req, res) {
  try {
    if (isMongoConnected()) {
      const list = await Organization.find().sort({ members: -1 }).lean();
      return res.json({ success: true, data: list });
    } else {
      return res.json({ success: true, data: store.organizations });
    }
  } catch (err) {
    console.error("Organizations list error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch organizations" });
  }
}

async function joinOrganization(req, res) {
  try {
    const orgId = req.params.id;
    const userId = req.userId;

    if (isMongoConnected()) {
      const o = await Organization.findById(orgId);
      const u = await User.findById(userId);

      if (!o || !u) return res.status(404).json({ success: false, message: "Organization or user not found" });

      u.organizations = u.organizations || [];
      if (!u.organizations.includes(String(o._id))) {
        u.organizations.push(String(o._id));
        o.members = (o.members || 0) + 1;
        await Promise.all([u.save(), o.save()]);
      }

      return res.json({ success: true, data: { organization: o.toObject(), user: safe(u) } });
    } else {
      const o = store.organizations.find(x => String(x._id) === String(orgId));
      const u = store.users.find(x => String(x._id) === String(userId));
      if (!o || !u) return res.status(404).json({ success: false, message: "Organization not found" });

      u.organizations = u.organizations || [];
      if (!u.organizations.includes(o._id)) {
        u.organizations.push(o._id);
        o.members = (o.members || 0) + 1;
        saveStore();
      }

      return res.json({ success: true, data: { organization: o, user: safe(u) } });
    }
  } catch (err) {
    console.error("joinOrganization error:", err);
    res.status(500).json({ success: false, message: "Failed to join organization" });
  }
}

async function products(req, res) {
  try {
    const data = await getProducts();
    res.json({ success: true, data });
  } catch (err) {
    console.error("Products error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch marketplace products" });
  }
}

async function dashboard(req, res) {
  try {
    const userId = req.userId;

    if (isMongoConnected()) {
      const u = await User.findById(userId);
      if (!u) return res.status(404).json({ success: false, message: "User not found" });

      const [acts, redemptions, allUsers] = await Promise.all([
        Activity.find({ user: userId, hidden: { $ne: true } }).sort({ createdAt: -1 }).lean(),
        Redemption.find({ user: userId }).sort({ redeemedAt: -1 }).limit(10).lean(),
        User.find().select("_id points").sort({ points: -1 }).lean()
      ]);

      const rankIndex = allUsers.findIndex(x => String(x._id) === String(u._id));
      const rank = rankIndex >= 0 ? rankIndex + 1 : 1;

      return res.json({
        success: true,
        data: {
          user: safe(u),
          rank,
          recentActivities: acts.map(a => ({ ...a, user: safe(u) })),
          recentRewards: redemptions.slice(0, 5)
        }
      });
    } else {
      const u = store.users.find(x => String(x._id) === String(userId));
      if (!u) return res.status(404).json({ success: false, message: "User not found" });

      const targetId = String(u._id);
      const acts = store.activities.filter(a => {
        const actUserId = typeof a.user === "object" && a.user !== null ? String(a.user._id || "") : String(a.user || "");
        return actUserId === targetId;
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const redemptions = store.redemptions.filter(r => String(r.user) === targetId);

      const rank = store.users.slice().sort((a, b) => b.points - a.points).findIndex(x => String(x._id) === String(u._id)) + 1;

      return res.json({
        success: true,
        data: {
          user: safe(u),
          rank: Math.max(1, rank),
          recentActivities: acts.map(a => ({ ...a, user: safe(u) })),
          recentRewards: redemptions.slice(-5).reverse()
        }
      });
    }
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ success: false, message: "Failed to load dashboard data" });
  }
}

async function events(req, res) {
  try {
    if (isMongoConnected()) {
      const list = await Event.find().sort({ date: 1 }).lean();
      return res.json({ success: true, data: list });
    } else {
      return res.json({ success: true, data: store.events || [] });
    }
  } catch (err) {
    console.error("Events error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch events" });
  }
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
      paymentMethod = "upi",
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

    const orderId = "ORD-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const transactionId = "TXN-" + Math.random().toString(36).substring(2, 10).toUpperCase() + "-" + Date.now();

    let u = null;
    let finalCoinsUsed = 0;
    const coinsReward = Number(ecoCoinsEarned || 25);

    if (isMongoConnected()) {
      if (req.userId) {
        u = await User.findById(req.userId);
        if (u && useEcoCoins && ecoCoinsUsed > 0) {
          finalCoinsUsed = Math.min(Number(u.ecoCoins || 0), Number(ecoCoinsUsed));
          u.ecoCoins = Math.max(0, (Number(u.ecoCoins) || 0) - finalCoinsUsed);
        }
        if (u) {
          u.ecoCoins = (Number(u.ecoCoins) || 0) + coinsReward;
          await u.save();
        }
      }

      const newOrder = await Order.create({
        _id: randomUUID(),
        orderId,
        transactionId,
        userId: req.userId || "guest",
        userName: customerName,
        userPhone: customerPhone || "",
        productId: productId || "custom-item",
        productTitle,
        quantity: Number(quantity) || 1,
        unitPrice: Number(price),
        totalAmount: Number(totalAmount || price * (quantity || 1)),
        shippingAddress,
        paymentMethod,
        paymentDetails: {
          method: paymentMethod,
          upiId: upiId || (paymentMethod === "upi" ? "verified-upi@okaxis" : null),
          cardLast4: cardLast4 || (paymentMethod === "card" ? "4242" : null),
          status: "PAID",
          paidAt: new Date()
        },
        ecoCoinsUsed: finalCoinsUsed,
        ecoCoinsEarned: coinsReward,
        status: "CONFIRMED",
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", {
          weekday: "short", month: "short", day: "numeric"
        }),
        orderedAt: new Date()
      });

      return res.json({
        success: true,
        message: `🎉 Order placed successfully! ₹${newOrder.totalAmount} paid via ${paymentMethod.toUpperCase()}.`,
        order: newOrder.toObject(),
        user: u ? safe(u) : null
      });
    } else {
      // Local fallback
      u = req.userId ? store.users.find(x => String(x._id) === String(req.userId)) : null;

      if (u && useEcoCoins && ecoCoinsUsed > 0) {
        finalCoinsUsed = Math.min(Number(u.ecoCoins || 0), Number(ecoCoinsUsed));
        u.ecoCoins = Math.max(0, (u.ecoCoins || 0) - finalCoinsUsed);
      }

      if (u) {
        u.ecoCoins = (u.ecoCoins || 0) + coinsReward;
      }

      const newOrder = {
        orderId,
        transactionId,
        userId: req.userId || "guest",
        userName: customerName,
        userPhone: customerPhone || "",
        productId: productId || "custom-item",
        productTitle,
        quantity: Number(quantity) || 1,
        unitPrice: Number(price),
        totalAmount: Number(totalAmount || price * (quantity || 1)),
        shippingAddress,
        paymentMethod,
        paymentDetails: {
          method: paymentMethod,
          upiId: upiId || (paymentMethod === "upi" ? "verified-upi@okaxis" : null),
          cardLast4: cardLast4 || (paymentMethod === "card" ? "4242" : null),
          status: "PAID",
          paidAt: new Date()
        },
        ecoCoinsUsed: finalCoinsUsed,
        ecoCoinsEarned: coinsReward,
        status: "CONFIRMED",
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", {
          weekday: "short", month: "short", day: "numeric"
        }),
        orderedAt: new Date()
      };

      if (!store.orders) store.orders = [];
      store.orders.unshift(newOrder);
      saveStore();

      return res.json({
        success: true,
        message: `🎉 Order placed successfully! ₹${newOrder.totalAmount} paid via ${paymentMethod.toUpperCase()}.`,
        order: newOrder,
        user: u ? safe(u) : null
      });
    }
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ success: false, message: "Payment processing failed. Please try again." });
  }
}

async function myOrders(req, res) {
  try {
    const userId = req.userId;
    if (isMongoConnected()) {
      const list = userId
        ? await Order.find({ userId }).sort({ orderedAt: -1 }).lean()
        : await Order.find().sort({ orderedAt: -1 }).limit(10).lean();

      return res.json({ success: true, data: list });
    } else {
      if (!store.orders) store.orders = [];
      const list = userId
        ? store.orders.filter(o => String(o.userId) === String(userId))
        : store.orders.slice(0, 10);
      return res.json({ success: true, data: list });
    }
  } catch (err) {
    console.error("myOrders error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
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
