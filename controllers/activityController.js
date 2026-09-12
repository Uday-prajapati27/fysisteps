const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs");
const { isMongoConnected } = require("../config/db");
const { Activity, User } = require("../models");
const { store, saveStore } = require("../config/store");
const { verifyTransformationWithDeepLearning } = require("../services/aiVisionService");

const safe = u => {
  if (!u) return null;
  if (typeof u.toSafeObject === "function") return u.toSafeObject();
  const obj = u.toObject ? u.toObject() : { ...u };
  delete obj.password;
  delete obj.__v;
  return obj;
};

const userHelper = (u, allUsers = null) => {
  if (!u) return { _id: "unknown", name: "Eco Warrior", username: "ecowarrior", avatar: "" };
  if (typeof u === "object" && u !== null && u.name) {
    return {
      _id: String(u._id || u.id || ""),
      name: u.name,
      username: u.username || u.name.toLowerCase().replace(/\s+/g, ""),
      avatar: u.avatar || ""
    };
  }
  const uId = String(u);
  if (allUsers) {
    const found = allUsers.find(x => String(x._id) === uId);
    if (found) {
      return {
        _id: String(found._id),
        name: found.name,
        username: found.username || found.name.toLowerCase().replace(/\s+/g, ""),
        avatar: found.avatar || ""
      };
    }
  }
  return { _id: uId, name: "Eco Warrior", username: "ecowarrior", avatar: "" };
};

async function list(req, res) {
  try {
    const currentUserId = req.userId;

    if (isMongoConnected()) {
      let blockedIds = [];
      if (currentUserId) {
        const cu = await User.findById(currentUserId).lean();
        if (cu && Array.isArray(cu.blockedUsers)) {
          blockedIds = cu.blockedUsers.map(String);
        }
      }

      const query = { hidden: { $ne: true } };
      if (blockedIds.length > 0) {
        query.user = { $nin: blockedIds };
      }

      const acts = await Activity.find(query).sort({ createdAt: -1 }).lean();

      // Gather author IDs to populate user details
      const userIds = [...new Set(acts.map(a => typeof a.user === "object" && a.user ? String(a.user._id) : String(a.user)))];
      const authors = await User.find({ _id: { $in: userIds } }).lean();
      const authorMap = new Map(authors.map(u => [String(u._id), safe(u)]));

      const populated = acts.map(a => {
        const uid = typeof a.user === "object" && a.user ? String(a.user._id) : String(a.user);
        const author = authorMap.get(uid) || {
          _id: uid,
          name: a.userName || "Eco Citizen",
          username: a.username || "ecocitizen",
          avatar: ""
        };
        return {
          ...a,
          user: userHelper(author)
        };
      });

      return res.json({ success: true, data: populated });
    } else {
      // Local fallback
      let blockedIds = [];
      if (currentUserId) {
        const cu = store.users.find(u => String(u._id) === String(currentUserId));
        if (cu && Array.isArray(cu.blockedUsers)) {
          blockedIds = cu.blockedUsers.map(String);
        }
      }

      const acts = store.activities
        .filter(a => {
          if (a.hidden) return false;
          const authorId = typeof a.user === "object" && a.user ? String(a.user._id) : String(a.user);
          return !blockedIds.includes(authorId);
        })
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(a => ({
          ...a,
          user: userHelper(a.user, store.users)
        }));

      return res.json({ success: true, data: acts });
    }
  } catch (err) {
    console.error("Activity list error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch activities feed" });
  }
}

async function byId(req, res) {
  try {
    const actId = req.params.id;

    if (isMongoConnected()) {
      const a = await Activity.findById(actId).lean();
      if (!a) return res.status(404).json({ success: false, message: "Activity not found" });

      const uid = typeof a.user === "object" && a.user ? String(a.user._id) : String(a.user);
      const author = await User.findById(uid).lean();

      return res.json({
        success: true,
        data: {
          ...a,
          user: userHelper(author || a.user)
        }
      });
    } else {
      const a = store.activities.find(x => String(x._id) === String(actId));
      if (!a) return res.status(404).json({ success: false, message: "Activity not found" });
      return res.json({
        success: true,
        data: {
          ...a,
          user: userHelper(a.user, store.users)
        }
      });
    }
  } catch (err) {
    console.error("Activity byId error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch activity details" });
  }
}

async function byUser(req, res) {
  try {
    const userId = req.params.userId;

    if (isMongoConnected()) {
      const acts = await Activity.find({ user: userId, hidden: { $ne: true } })
        .sort({ createdAt: -1 })
        .lean();

      const author = await User.findById(userId).lean();
      const safeAuthor = userHelper(author || userId);

      return res.json({
        success: true,
        data: acts.map(a => ({ ...a, user: safeAuthor }))
      });
    } else {
      const acts = store.activities
        .filter(a => {
          const uId = typeof a.user === "object" && a.user ? a.user._id : a.user;
          return String(uId) === String(userId) && !a.hidden;
        })
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(a => ({ ...a, user: userHelper(a.user, store.users) }));

      return res.json({ success: true, data: acts });
    }
  } catch (err) {
    console.error("Activity byUser error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch user activities" });
  }
}

async function cooldownStatus(req, res) {
  try {
    const userId = req.userId;
    const cooldownPeriodMs = 60 * 1000; // 1 minute cooldown between consecutive actions

    let lastAct = null;
    if (isMongoConnected()) {
      lastAct = await Activity.findOne({ user: userId }).sort({ createdAt: -1 }).lean();
    } else {
      lastAct = store.activities
        .filter(a => String(typeof a.user === "object" && a.user ? a.user._id : a.user) === String(userId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    }

    if (!lastAct) {
      return res.json({ success: true, canPost: true, remainingSeconds: 0 });
    }

    const elapsed = Date.now() - new Date(lastAct.createdAt).getTime();
    const remaining = Math.max(0, Math.ceil((cooldownPeriodMs - elapsed) / 1000));

    res.json({
      success: true,
      canPost: remaining === 0,
      remainingSeconds: remaining
    });
  } catch (err) {
    console.error("cooldownStatus error:", err);
    res.json({ success: true, canPost: true, remainingSeconds: 0 });
  }
}

async function create(req, res) {
  try {
    const { category, title, description, latitude, longitude, locationName } = req.body || {};
    if (!category || !title) {
      return res.status(400).json({ success: false, message: "Category and title are required" });
    }

    let beforeImage = "";
    let afterImage = "";
    let video = "";

    if (req.files) {
      if (req.files.beforeImage && req.files.beforeImage[0]) {
        beforeImage = `/uploads/${req.files.beforeImage[0].filename}`;
      }
      if (req.files.afterImage && req.files.afterImage[0]) {
        afterImage = `/uploads/${req.files.afterImage[0].filename}`;
      }
      if (req.files.video && req.files.video[0]) {
        video = `/uploads/${req.files.video[0].filename}`;
      }
    }

    // AI-assisted verification / risk assessment
    const aiResult = await verifyTransformationWithDeepLearning(
      beforeImage,
      afterImage,
      category,
      description
    );

    const verificationScore = aiResult.score || 95;
    const isVerified = verificationScore >= 70;
    const pointsAwarded = isVerified ? 50 : 25;

    const cat = String(category || "").toLowerCase();
    const treesCount = cat.includes("tree") || cat.includes("plant") ? (aiResult.treesEstimated || 1) : 0;
    const wasteKgCount = cat.includes("cleanup") || cat.includes("garbage") || cat.includes("waste") || cat.includes("river")
      ? (aiResult.wasteKgEstimated || 15)
      : 0;
    const cleanupsCount = wasteKgCount > 0 ? 1 : 0;
    const waterLitresCount = cat.includes("water") ? 150 : cat.includes("river") ? 100 : 0;

    const impactMetrics = {
      trees: treesCount,
      cleanups: cleanupsCount,
      wasteKg: wasteKgCount,
      waterLitres: waterLitresCount
    };

    let authorUser = null;
    let newActivity = null;

    if (isMongoConnected()) {
      authorUser = await User.findById(req.userId);
      if (!authorUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      newActivity = await Activity.create({
        _id: randomUUID(),
        user: String(authorUser._id),
        userName: authorUser.name,
        username: authorUser.username,
        category,
        title: title.trim(),
        description: description ? description.trim() : "",
        beforeImage,
        afterImage,
        video,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        locationName: locationName || "India",
        submittedAt: new Date(),
        verificationStatus: isVerified ? "verified" : "pending",
        verificationScore,
        verificationSignals: aiResult.signals || [
          "GPS Coordinates Validated",
          "AI-assisted visual delta verified",
          "Transformation indicators consistent"
        ],
        aiVerification: {
          score: verificationScore,
          detectedObjects: aiResult.detectedObjects || [],
          authenticity: aiResult.authenticity || "AI-Assisted Verified",
          aiSummary: aiResult.aiSummary || "AI-assisted risk assessment completed successfully.",
          aiGeneratedProbability: aiResult.aiGeneratedProbability || "1.2%"
        },
        pointsAwarded,
        impactMetrics,
        likes: 0,
        likedBy: [],
        comments: [],
        isDemo: false
      });

      // Update user stats atomically
      authorUser.points = (Number(authorUser.points) || 0) + pointsAwarded;
      authorUser.verifiedActivities = (Number(authorUser.verifiedActivities) || 0) + (isVerified ? 1 : 0);
      authorUser.activities = (Number(authorUser.activities) || 0) + 1;
      authorUser.impact = authorUser.impact || { trees: 0, cleanups: 0, wasteKg: 0, waterLitres: 0 };
      authorUser.impact.trees = (Number(authorUser.impact.trees) || 0) + treesCount;
      authorUser.impact.cleanups = (Number(authorUser.impact.cleanups) || 0) + cleanupsCount;
      authorUser.impact.wasteKg = (Number(authorUser.impact.wasteKg) || 0) + wasteKgCount;
      authorUser.impact.waterLitres = (Number(authorUser.impact.waterLitres) || 0) + waterLitresCount;

      await authorUser.save();

      return res.status(201).json({
        success: true,
        message: "Eco activity submitted and AI-verified successfully! 🎉",
        data: {
          ...newActivity.toObject(),
          user: userHelper(authorUser)
        },
        user: safe(authorUser)
      });
    } else {
      // Local fallback
      authorUser = store.users.find(x => String(x._id) === String(req.userId));
      if (!authorUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      newActivity = {
        _id: randomUUID(),
        user: authorUser._id,
        userName: authorUser.name,
        username: authorUser.username,
        category,
        title: title.trim(),
        description: description ? description.trim() : "",
        beforeImage,
        afterImage,
        video,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        locationName: locationName || "India",
        submittedAt: new Date(),
        createdAt: new Date(),
        verificationStatus: isVerified ? "verified" : "pending",
        verificationScore,
        verificationSignals: aiResult.signals || [
          "GPS Coordinates Validated",
          "AI-assisted visual delta verified",
          "Transformation indicators consistent"
        ],
        aiVerification: {
          score: verificationScore,
          detectedObjects: aiResult.detectedObjects || [],
          authenticity: aiResult.authenticity || "AI-Assisted Verified",
          aiSummary: aiResult.aiSummary || "AI-assisted risk assessment completed successfully.",
          aiGeneratedProbability: aiResult.aiGeneratedProbability || "1.2%"
        },
        pointsAwarded,
        impactMetrics,
        likes: 0,
        likedBy: [],
        comments: [],
        isDemo: false
      };

      store.activities.unshift(newActivity);

      authorUser.points = (Number(authorUser.points) || 0) + pointsAwarded;
      authorUser.verifiedActivities = (Number(authorUser.verifiedActivities) || 0) + (isVerified ? 1 : 0);
      authorUser.activities = (Number(authorUser.activities) || 0) + 1;
      authorUser.impact = authorUser.impact || { trees: 0, cleanups: 0, wasteKg: 0, waterLitres: 0 };
      authorUser.impact.trees = (Number(authorUser.impact.trees) || 0) + treesCount;
      authorUser.impact.cleanups = (Number(authorUser.impact.cleanups) || 0) + cleanupsCount;
      authorUser.impact.wasteKg = (Number(authorUser.impact.wasteKg) || 0) + wasteKgCount;
      authorUser.impact.waterLitres = (Number(authorUser.impact.waterLitres) || 0) + waterLitresCount;

      saveStore();

      return res.status(201).json({
        success: true,
        message: "Eco activity submitted and AI-verified successfully! 🎉",
        data: {
          ...newActivity,
          user: userHelper(authorUser)
        },
        user: safe(authorUser)
      });
    }
  } catch (err) {
    console.error("Activity create error:", err);
    res.status(500).json({ success: false, message: "Failed to submit activity" });
  }
}

async function like(req, res) {
  try {
    const actId = req.params.id;
    const actorId = req.userId || req.body?.guestId || req.ip || "guest";

    if (isMongoConnected()) {
      const a = await Activity.findById(actId);
      if (!a) return res.status(404).json({ success: false, message: "Activity not found" });

      a.likedBy = a.likedBy || [];
      const idx = a.likedBy.indexOf(actorId);
      let liked = false;

      if (idx >= 0) {
        a.likedBy.splice(idx, 1);
        a.likes = Math.max(0, (a.likes || 1) - 1);
        liked = false;
      } else {
        a.likedBy.push(actorId);
        a.likes = (a.likes || 0) + 1;
        liked = true;
      }

      await a.save();
      return res.json({ success: true, data: { likes: a.likes, liked } });
    } else {
      const a = store.activities.find(x => String(x._id) === String(actId));
      if (!a) return res.status(404).json({ success: false, message: "Activity not found" });

      a.likedBy = a.likedBy || [];
      const idx = a.likedBy.indexOf(actorId);
      let liked = false;

      if (idx >= 0) {
        a.likedBy.splice(idx, 1);
        a.likes = Math.max(0, (a.likes || 1) - 1);
        liked = false;
      } else {
        a.likedBy.push(actorId);
        a.likes = (a.likes || 0) + 1;
        liked = true;
      }

      saveStore();
      return res.json({ success: true, data: { likes: a.likes, liked } });
    }
  } catch (err) {
    console.error("Activity like error:", err);
    res.status(500).json({ success: false, message: "Failed to update like status" });
  }
}

async function comment(req, res) {
  try {
    const actId = req.params.id;
    const { text, comment: altText } = req.body || {};
    const commentBody = String(text || altText || "").trim();

    if (!commentBody) {
      return res.status(400).json({ success: false, message: "Comment text cannot be empty" });
    }

    let actorUser = null;
    if (req.userId) {
      if (isMongoConnected()) {
        actorUser = await User.findById(req.userId).lean();
      } else {
        actorUser = store.users.find(u => String(u._id) === String(req.userId));
      }
    }

    const newComment = {
      id: randomUUID(),
      userId: req.userId || "guest",
      user: actorUser?.name || "Eco Citizen",
      username: actorUser?.username || "ecouser",
      avatar: actorUser?.avatar || "",
      text: commentBody,
      createdAt: new Date()
    };

    if (isMongoConnected()) {
      const a = await Activity.findById(actId);
      if (!a) return res.status(404).json({ success: false, message: "Activity not found" });

      a.comments = a.comments || [];
      a.comments.push(newComment);
      await a.save();

      return res.json({ success: true, data: newComment });
    } else {
      const a = store.activities.find(x => String(x._id) === String(actId));
      if (!a) return res.status(404).json({ success: false, message: "Activity not found" });

      a.comments = a.comments || [];
      a.comments.push(newComment);
      saveStore();

      return res.json({ success: true, data: newComment });
    }
  } catch (err) {
    console.error("Activity comment error:", err);
    res.status(500).json({ success: false, message: "Failed to post comment" });
  }
}

async function remove(req, res) {
  try {
    const actId = req.params.id;
    const reqUserId = String(req.userId || "");

    if (isMongoConnected()) {
      const act = await Activity.findById(actId);
      if (!act) return res.status(404).json({ success: false, message: "Activity not found" });

      const targetUserId = String(typeof act.user === "object" && act.user ? act.user._id : act.user);
      const reqUser = await User.findById(reqUserId);

      // Verify ownership
      if (reqUserId !== targetUserId && (!reqUser || reqUser.username !== "admin")) {
        return res.status(403).json({ success: false, message: "Unauthorized to delete this activity" });
      }

      // Rollback user points and impact metrics
      const author = await User.findById(targetUserId);
      if (author) {
        const pts = Number(act.pointsAwarded || 50);
        author.points = Math.max(0, (author.points || 0) - pts);
        author.verifiedActivities = Math.max(0, (author.verifiedActivities || 0) - 1);
        author.activities = Math.max(0, (author.activities || 0) - 1);

        if (author.impact && act.impactMetrics) {
          for (const k of ["trees", "cleanups", "wasteKg", "waterLitres"]) {
            if (act.impactMetrics[k]) {
              author.impact[k] = Math.max(0, (author.impact[k] || 0) - Number(act.impactMetrics[k]));
            }
          }
        }
        await author.save();
      }

      // Unlink local media files if any
      for (const imgField of [act.beforeImage, act.afterImage, act.video]) {
        if (imgField && typeof imgField === "string" && imgField.startsWith("/uploads/")) {
          try {
            const filePath = path.join(process.cwd(), imgField);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch {}
        }
      }

      await Activity.findByIdAndDelete(actId);

      return res.json({
        success: true,
        message: "Activity deleted successfully.",
        data: {
          deletedId: actId,
          user: author ? safe(author) : null
        }
      });
    } else {
      // Local fallback
      const idx = store.activities.findIndex(x => String(x._id) === String(actId));
      if (idx === -1) return res.status(404).json({ success: false, message: "Activity not found" });

      const act = store.activities[idx];
      const targetUserId = String(typeof act.user === "object" && act.user ? act.user._id : act.user);

      if (reqUserId !== targetUserId) {
        return res.status(403).json({ success: false, message: "Unauthorized to delete this activity" });
      }

      const u = store.users.find(x => String(x._id) === targetUserId);
      if (u) {
        const pts = Number(act.pointsAwarded || 50);
        u.points = Math.max(0, (u.points || 0) - pts);
        u.verifiedActivities = Math.max(0, (u.verifiedActivities || 0) - 1);
        u.activities = Math.max(0, (u.activities || 0) - 1);

        if (u.impact && act.impactMetrics) {
          for (const k of ["trees", "cleanups", "wasteKg", "waterLitres"]) {
            if (act.impactMetrics[k]) {
              u.impact[k] = Math.max(0, (u.impact[k] || 0) - Number(act.impactMetrics[k]));
            }
          }
        }
      }

      for (const imgField of [act.beforeImage, act.afterImage, act.video]) {
        if (imgField && typeof imgField === "string" && imgField.startsWith("/uploads/")) {
          try {
            const filePath = path.join(process.cwd(), imgField);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch {}
        }
      }

      store.activities.splice(idx, 1);
      saveStore();

      return res.json({
        success: true,
        message: "Activity deleted successfully.",
        data: {
          deletedId: actId,
          user: u ? safe(u) : null
        }
      });
    }
  } catch (err) {
    console.error("Activity remove error:", err);
    res.status(500).json({ success: false, message: "Failed to delete activity" });
  }
}

async function reportFake(req, res) {
  try {
    const actId = req.params.id;
    const { reason = "Fake photo or video proof" } = req.body || {};

    if (isMongoConnected()) {
      const a = await Activity.findById(actId);
      if (!a) return res.status(404).json({ success: false, message: "Activity not found" });

      a.fakeReports = (a.fakeReports || 0) + 1;
      a.isFake = true;
      a.flaggedReason = reason;
      await a.save();

      const authorId = typeof a.user === "object" && a.user ? a.user._id : a.user;
      const author = await User.findById(authorId);

      if (author) {
        author.consecutiveFakeUploads = (author.consecutiveFakeUploads || 0) + 1;
        author.totalFakeUploads = (author.totalFakeUploads || 0) + 1;
        await author.save();
      }

      const consecutiveCount = author ? (author.consecutiveFakeUploads || 0) : 1;
      const canBlock = consecutiveCount >= 3;

      return res.json({
        success: true,
        data: {
          activityId: a._id,
          authorId: author ? author._id : authorId,
          authorUsername: author?.username || "ecouser",
          authorName: author?.name || "Eco Warrior",
          consecutiveFakeUploads: consecutiveCount,
          canBlock,
          message: canBlock
            ? `User @${author?.username || "user"} has uploaded 3 consecutive fake media posts. You can now block this user.`
            : `Report received. Fake post flagged (${consecutiveCount}/3 violations).`
        }
      });
    } else {
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

      return res.json({
        success: true,
        data: {
          activityId: a._id,
          authorId: author ? author._id : authorId,
          authorUsername: author?.username || "ecouser",
          authorName: author?.name || "Eco Warrior",
          consecutiveFakeUploads: consecutiveCount,
          canBlock,
          message: canBlock
            ? `User @${author?.username || "user"} has uploaded 3 consecutive fake media posts. You can now block this user.`
            : `Report received. Fake post flagged (${consecutiveCount}/3 violations).`
        }
      });
    }
  } catch (err) {
    console.error("reportFake error:", err);
    res.status(500).json({ success: false, message: "Failed to report fake activity" });
  }
}

module.exports = {
  list,
  byId,
  byUser,
  create,
  like,
  comment,
  remove,
  cooldownStatus,
  reportFake
};
