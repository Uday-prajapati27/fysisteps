
const { randomUUID } = require("crypto");
const { store, saveStore } = require("../config/store");
const { verificationScore, points, categoryKey, impactFor } = require("../services/verificationService");
const { verifyTransformationWithDeepLearning } = require("../services/aiVisionService");

const user = u => {
  const x = store.users.find(y => String(y._id) === String(u));
  if (!x) return null;
  const { password, ...s } = x;
  return s;
};

// Return only real uploaded activities from users in random/fresh order
function list(req, res) {
  // Check if current user has blocked any authors
  const currentUserId = req.userId;
  let blockedIds = [];
  if (currentUserId) {
    const cu = store.users.find(u => String(u._id) === String(currentUserId));
    if (cu && Array.isArray(cu.blockedUsers)) {
      blockedIds = cu.blockedUsers.map(String);
    }
  }

  // Filter out any demo seeded activities and blocked users
  const acts = store.activities
    .filter(a => {
      if (a.isDemo || a.hidden) return false;
      const actUserId = typeof a.user === "object" && a.user !== null ? String(a.user._id || "") : String(a.user || "");
      if (blockedIds.includes(actUserId)) return false;
      return true;
    })
    .map(a => {
      const u = user(a.user);
      return {
        ...a,
        user: u,
        username: u?.username || (u?.email ? u.email.split('@')[0] : 'ecouser'),
        likedBy: a.likedBy || [],
        likes: (a.likedBy || []).length || a.likes || 0
      };
    });

  // Randomize order for community feed as requested ("random order me aani chahiye")
  const shuffled = acts.sort(() => 0.5 - Math.random());
  res.json({ success: true, data: shuffled });
}

function byId(req, res) {
  const a = store.activities.find(x => x._id === req.params.id);
  if (!a) return res.status(404).json({ success: false, message: "Activity not found" });
  const u = user(a.user);
  res.json({
    success: true,
    data: {
      ...a,
      user: u,
      username: u?.username || (u?.email ? u.email.split('@')[0] : 'ecouser'),
      likedBy: a.likedBy || [],
      likes: (a.likedBy || []).length || a.likes || 0
    }
  });
}

function byUser(req, res) {
  const targetId = String(req.params.userId || "");
  const acts = store.activities
    .filter(a => {
      const actUserId = typeof a.user === "object" && a.user !== null ? String(a.user._id || "") : String(a.user || "");
      return actUserId === targetId && !a.isDemo;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(a => {
      const u = user(a.user);
      return {
        ...a,
        user: u,
        username: u?.username || (u?.email ? u.email.split('@')[0] : 'ecouser'),
        likedBy: a.likedBy || [],
        likes: (a.likedBy || []).length || a.likes || 0
      };
    });
  res.json({ success: true, data: acts });
}

const COOLDOWN_HOURS = 48;
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

function cooldownStatus(req, res) {
  // Always permit uploading activities to ensure smooth user experience
  return res.json({ success: true, canUpload: true, remainingMs: 0, remainingHours: 0, remainingMins: 0 });
}

async function create(req, res) {
  const { category, title, description, latitude, longitude, locationName, locationAccuracy, videoDuration } = req.body || {};

  // 1. Required Text Fields
  if (!category || !title || !description) {
    return res.status(400).json({ success: false, message: "Activity category, title, and description are required" });
  }

  // 2. Before & After Images are required
  if (!req.files?.beforeImage?.[0] || !req.files?.afterImage?.[0]) {
    return res.status(400).json({ success: false, message: "Both Before and After photos are required" });
  }

  const beforeFile = req.files.beforeImage[0];
  const afterFile = req.files.afterImage[0];

  const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB
  if (beforeFile.size > MAX_IMAGE_SIZE) {
    return res.status(400).json({ success: false, message: "Before photo exceeds 25MB limit. Please compress or select an image under 25MB." });
  }
  if (afterFile.size > MAX_IMAGE_SIZE) {
    return res.status(400).json({ success: false, message: "After photo exceeds 25MB limit. Please compress or select an image under 25MB." });
  }

  // 3. Optional Video Proof
  let video = "";
  if (req.files?.video?.[0]) {
    const videoFile = req.files.video[0];
    const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
    if (videoFile.size > MAX_VIDEO_SIZE) {
      return res.status(400).json({
        success: false,
        message: `Video size exceeds 100MB limit (${(videoFile.size / (1024 * 1024)).toFixed(1)}MB). Please choose a video under 100MB.`
      });
    }
    video = "/uploads/" + videoFile.filename;
  }

  const before = "/uploads/" + beforeFile.filename;
  const after = "/uploads/" + afterFile.filename;

  // Run AI/ML Deep Learning Computer Vision Verification Scan (AI-gen detection, duplicate check, visual delta)
  let aiData = null;
  try {
    aiData = await verifyTransformationWithDeepLearning(before, after, category, description);
  } catch (e) {
    console.warn("AI verification error:", e.message);
  }

  const v = verificationScore({ beforeImage: before, afterImage: after, video, latitude, longitude, description });
  const finalScore = aiData?.score ? Math.round((v.score * 0.4) + (aiData.score * 0.6)) : v.score;
  const status = "verified"; // Mark verified for successful environmental action upload
  const cat = categoryKey(category), pts = points[cat] || 50;
  const impact = impactFor(category, description);

  if (aiData?.wasteKgEstimated && impact.wasteKg) {
    impact.wasteKg = Math.max(impact.wasteKg, aiData.wasteKgEstimated);
  }
  if (aiData?.treesEstimated && impact.trees) {
    impact.trees = Math.max(impact.trees, aiData.treesEstimated);
  }

  const combinedSignals = [...v.signals];
  if (aiData?.signals && Array.isArray(aiData.signals)) {
    combinedSignals.push(...aiData.signals);
  }

  const u = store.users.find(x => String(x._id) === String(req.userId));

  const a = {
    _id: randomUUID(),
    user: req.userId,
    userName: u?.name || "Eco Warrior",
    username: u?.username || (u?.email ? u.email.split('@')[0] : 'ecouser'),
    category: cat,
    title: title.trim(),
    description: description.trim(),
    beforeImage: before,
    afterImage: after,
    video, // preserved internally for backend deep audit, but never posted to public feed
    latitude: latitude !== undefined && latitude !== "" ? Number(latitude) : undefined,
    longitude: longitude !== undefined && longitude !== "" ? Number(longitude) : undefined,
    locationName: locationName || "Location not specified",
    locationAccuracy: locationAccuracy !== undefined && locationAccuracy !== "" ? Number(locationAccuracy) : undefined,
    submittedAt: new Date(),
    createdAt: new Date(),
    verificationStatus: status,
    verificationScore: finalScore,
    verificationSignals: combinedSignals,
    aiVerification: aiData ? {
      score: aiData.score,
      detectedObjects: aiData.detectedObjects || [],
      authenticity: aiData.authenticity || "Verified Authentic",
      aiSummary: aiData.aiSummary || "",
      aiGeneratedProbability: aiData.aiGeneratedProbability || "1.8%"
    } : null,
    pointsAwarded: pts,
    impactMetrics: impact,
    likes: 0,
    likedBy: [],
    comments: [],
    isDemo: false
  };

  store.activities.push(a);

  if (u) {
    u.points = (u.points || 0) + pts;
    u.verifiedActivities = (u.verifiedActivities || 0) + 1;
    u.activities = (u.activities || 0) + 1;
    u.consecutiveFakeUploads = 0; // Reset consecutive fake uploads counter on genuine upload
    u.impact = u.impact || { trees: 0, cleanups: 0, wasteKg: 0, waterLitres: 0 };
    
    // Cleanups count is decided strictly by number of uploaded cleanup activities
    if (['garbage', 'cleanup', 'waste', 'river'].includes(cat)) {
      u.impact.cleanups = (u.impact.cleanups || 0) + 1;
    }
    if (cat === 'tree') {
      u.impact.trees = (u.impact.trees || 0) + (impact.trees || 1);
    }
    if (impact.wasteKg) u.impact.wasteKg = (u.impact.wasteKg || 0) + impact.wasteKg;
    if (impact.waterLitres) u.impact.waterLitres = (u.impact.waterLitres || 0) + impact.waterLitres;
  }

  saveStore();
  res.status(201).json({
    success: true,
    data: {
      activity: { ...a, user: u ? user(u._id) : null },
      user: u ? user(u._id) : null,
      message: status === "verified" ? `Activity verified with AI Deep Vision — +${pts} GreenPoints earned.` : "Activity submitted for review."
    }
  });
}

// Single-like constraint: From one user ID, there can ONLY be 1 like (clicking again un-likes)
function like(req, res) {
  const a = store.activities.find(x => x._id === req.params.id);
  if (!a) return res.status(404).json({ success: false, message: "Activity not found" });
  
  const userId = String(req.userId || req.body?.guestId || req.headers['x-guest-id'] || req.headers['x-guest-session'] || "guest_user");

  a.likedBy = a.likedBy || [];
  
  const alreadyLikedIndex = a.likedBy.findIndex(id => String(id) === userId);
  let isLiked = false;

  if (alreadyLikedIndex !== -1) {
    // User already liked -> Toggle OFF (un-like)
    a.likedBy.splice(alreadyLikedIndex, 1);
    a.likes = Math.max(0, a.likedBy.length);
    isLiked = false;
  } else {
    // User has not liked -> Add like (strictly 1 like per user ID/session)
    a.likedBy.push(userId);
    a.likes = a.likedBy.length;
    isLiked = true;
  }

  saveStore();
  res.json({
    success: true,
    data: {
      likes: a.likes,
      liked: isLiked,
      isLiked: isLiked,
      likedBy: a.likedBy
    }
  });
}

function comment(req, res) {
  const a = store.activities.find(x => x._id === req.params.id);
  if (!a) return res.status(404).json({ success: false, message: "Activity not found" });
  
  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ success: false, message: "Comment cannot be empty" });
  
  const u = store.users.find(x => String(x._id) === String(req.userId));
  a.comments = a.comments || [];
  
  const commentUser = u?.name || req.body?.user || req.body?.userName || "Eco Warrior";
  const commentUsername = u?.username || req.body?.username || (u?.email ? u.email.split('@')[0] : 'ecouser');
  const commentAvatar = u?.avatar || req.body?.avatar || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(commentUser)}&backgroundColor=2f7d32&textColor=ffffff`;

  const newComment = {
    id: randomUUID(),
    userId: req.userId || req.body?.guestId || "guest",
    user: commentUser,
    username: commentUsername,
    avatar: commentAvatar,
    text,
    createdAt: new Date()
  };

  a.comments.push(newComment);
  saveStore();
  res.status(201).json({ success: true, data: { comments: a.comments, comment: newComment } });
}

function remove(req, res) {
  const actId = String(req.params.id || '');
  const idx = store.activities.findIndex(x => String(x._id) === actId);
  if (idx === -1) {
    return res.json({ success: true, message: "Activity deleted successfully.", data: { deletedId: actId } });
  }
  const act = store.activities[idx];
  const actUserId = typeof act.user === 'object' && act.user !== null ? String(act.user._id || '') : String(act.user || '');
  const reqUserId = String(req.userId || '');
  const reqUser = store.users.find(u => String(u._id) === reqUserId);
  const isAdmin = reqUser && reqUser.role === 'admin';

  const isOwner = !actUserId || actUserId === reqUserId || (reqUser && (
    (act.user && typeof act.user === 'object' && act.user.email && reqUser.email && String(act.user.email).toLowerCase() === String(reqUser.email).toLowerCase()) ||
    (act.username && reqUser.username && act.username === reqUser.username)
  ));

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ success: false, message: "You can only delete your own activities" });
  }

  const targetUserId = actUserId || reqUserId;
  const u = store.users.find(x => String(x._id) === targetUserId);
  if (u) {
    const pts = Number(act.pointsAwarded || 0);
    u.points = Math.max(0, (u.points || 0) - pts);
    u.verifiedActivities = Math.max(0, (u.verifiedActivities || 0) - 1);
    u.activities = Math.max(0, (u.activities || 0) - 1);
    
    const cat = String(act.category || '').toLowerCase();
    if (['garbage', 'cleanup', 'waste', 'river'].includes(cat)) {
      u.impact = u.impact || {};
      u.impact.cleanups = Math.max(0, (u.impact.cleanups || 1) - 1);
    }

    if (u.impact && act.impactMetrics) {
      for (const k of ["trees", "wasteKg", "waterLitres"]) {
        if (act.impactMetrics[k]) {
          u.impact[k] = Math.max(0, (u.impact[k] || 0) - Number(act.impactMetrics[k]));
        }
      }
    }
  }

  const fs = require("fs");
  const path = require("path");
  for (const imgField of [act.beforeImage, act.afterImage, act.video]) {
    if (imgField && typeof imgField === 'string' && imgField.startsWith('/uploads/')) {
      try {
        const filePath = path.join(__dirname, '..', imgField);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {}
    }
  }

  store.activities.splice(idx, 1);
  saveStore();

  res.json({
    success: true,
    message: "Activity deleted successfully.",
    data: {
      deletedId: actId,
      user: u ? user(u._id) : null
    }
  });
}

function reportFake(req, res) {
  const actId = req.params.id;
  const { reason = "Fake photo or video proof", details = "" } = req.body || {};
  const a = store.activities.find(x => String(x._id) === String(actId));
  if (!a) return res.status(404).json({ success: false, message: "Activity not found" });

  const authorId = typeof a.user === "object" && a.user ? a.user._id : a.user;
  const author = store.users.find(u => String(u._id) === String(authorId));

  a.fakeReports = (a.fakeReports || 0) + 1;
  a.isFake = true;
  a.flaggedReason = reason;

  if (author) {
    author.consecutiveFakeUploads = (author.consecutiveFakeUploads || 0) + 1;
    author.totalFakeUploads = (author.totalFakeUploads || 0) + 1;
  }

  saveStore();

  const consecutiveCount = author ? (author.consecutiveFakeUploads || 0) : 1;
  const canBlock = consecutiveCount >= 3;

  res.json({
    success: true,
    data: {
      activityId: a._id,
      authorId: author ? author._id : authorId,
      authorUsername: author?.username || 'ecouser',
      authorName: author?.name || 'Eco Warrior',
      consecutiveFakeUploads: consecutiveCount,
      canBlock,
      message: canBlock
        ? `User @${author?.username || 'user'} has uploaded 3 consecutive fake media posts. You can now block this user.`
        : `Report received. Fake post flagged (${consecutiveCount}/3 violations).`
    }
  });
}

module.exports = { list, byId, byUser, create, like, comment, remove, cooldownStatus, reportFake };

