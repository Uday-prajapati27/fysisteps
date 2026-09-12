const { isMongoConnected } = require("../config/db");
const { User, Activity } = require("../models");
const { store, saveStore } = require("../config/store");

const safe = u => {
  if (!u) return null;
  if (typeof u.toSafeObject === "function") return u.toSafeObject();
  const obj = u.toObject ? u.toObject() : { ...u };
  delete obj.password;
  delete obj.__v;
  return obj;
};

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,25}$/;

async function updateMe(req, res) {
  try {
    const { name, username, email, bio, avatar, phone } = req.body || {};

    if (isMongoConnected()) {
      const u = await User.findById(req.userId);
      if (!u) return res.status(404).json({ success: false, message: "User not found" });

      if (name !== undefined) {
        const n = String(name).trim();
        if (!n) return res.status(400).json({ success: false, message: "Name cannot be empty" });
        u.name = n;
      }

      if (username !== undefined) {
        const cleanUsername = String(username).toLowerCase().trim().replace(/^@/, "");
        if (!USERNAME_REGEX.test(cleanUsername)) {
          return res.status(400).json({
            success: false,
            message: "Username must be 3-25 characters (letters, numbers, underscore only)"
          });
        }
        const clash = await User.findOne({ username: cleanUsername, _id: { $ne: u._id } });
        if (clash) {
          return res.status(409).json({
            success: false,
            message: `Username '@${cleanUsername}' is already taken. Please choose another username.`
          });
        }
        u.username = cleanUsername;
      }

      if (email !== undefined) {
        const e = String(email).trim().toLowerCase();
        if (!e || !EMAIL_REGEX.test(e)) {
          return res.status(400).json({ success: false, message: "Please enter a valid, real email address" });
        }
        const clash = await User.findOne({ email: e, _id: { $ne: u._id } });
        if (clash) return res.status(409).json({ success: false, message: "Email is already in use" });
        if (u.email !== e) {
          u.email = e;
          u.emailVerified = false;
        }
      }

      if (phone !== undefined) {
        const p = String(phone).replace(/[^0-9+]/g, "").trim();
        if (u.phone !== p) {
          u.phone = p;
          u.phoneVerified = false;
        }
      }

      if (bio !== undefined) u.bio = String(bio).trim();
      if (avatar !== undefined) {
        u.avatar = avatar ? String(avatar).trim() : "";
      }

      await u.save();
      return res.json({ success: true, data: safe(u) });
    } else {
      // Local fallback
      const u = store.users.find(x => String(x._id) === String(req.userId));
      if (!u) return res.status(404).json({ success: false, message: "User not found" });

      if (name !== undefined) {
        const n = String(name).trim();
        if (!n) return res.status(400).json({ success: false, message: "Name cannot be empty" });
        u.name = n;
      }

      if (username !== undefined) {
        const cleanUsername = String(username).toLowerCase().trim().replace(/^@/, "");
        if (!USERNAME_REGEX.test(cleanUsername)) {
          return res.status(400).json({
            success: false,
            message: "Username must be 3-25 characters (letters, numbers, underscore only)"
          });
        }
        const clash = store.users.find(x => String(x.username || "").toLowerCase() === cleanUsername && String(x._id) !== String(u._id));
        if (clash) {
          return res.status(409).json({
            success: false,
            message: `Username '@${cleanUsername}' is already taken. Please choose another username.`
          });
        }
        u.username = cleanUsername;
      }

      if (email !== undefined) {
        const e = String(email).trim().toLowerCase();
        if (!e || !EMAIL_REGEX.test(e)) {
          return res.status(400).json({ success: false, message: "Please enter a valid, real email address" });
        }
        const clash = store.users.find(x => x.email === e && String(x._id) !== String(u._id));
        if (clash) return res.status(409).json({ success: false, message: "Email is already in use" });
        if (u.email !== e) {
          u.email = e;
          u.emailVerified = false;
        }
      }

      if (phone !== undefined) {
        const p = String(phone).replace(/[^0-9+]/g, "").trim();
        if (u.phone !== p) {
          u.phone = p;
          u.phoneVerified = false;
        }
      }

      if (bio !== undefined) u.bio = String(bio).trim();
      if (avatar !== undefined) {
        u.avatar = avatar ? String(avatar).trim() : "";
      }

      saveStore();
      return res.json({ success: true, data: safe(u) });
    }
  } catch (err) {
    console.error("updateMe error:", err);
    res.status(500).json({ success: false, message: "Failed to update profile" });
  }
}

async function searchUsersAndActivities(req, res) {
  try {
    const q = String(req.query.q || "").trim().toLowerCase().replace(/^@/, "");
    if (!q) {
      return res.json({ success: true, data: { users: [], activities: [] } });
    }

    const currentUserId = req.userId;

    if (isMongoConnected()) {
      let blockedIds = [];
      if (currentUserId) {
        const cu = await User.findById(currentUserId).lean();
        if (cu && Array.isArray(cu.blockedUsers)) {
          blockedIds = cu.blockedUsers.map(String);
        }
      }

      const userRegex = new RegExp(q, "i");
      const matchingUsers = await User.find({
        _id: { $nin: blockedIds },
        $or: [{ name: userRegex }, { username: userRegex }]
      }).limit(10).lean();

      const userResults = await Promise.all(
        matchingUsers.map(async u => {
          const acts = await Activity.find({ user: String(u._id), hidden: { $ne: true } }).lean();
          return {
            ...safe(u),
            activityCount: acts.length,
            verifiedCount: acts.filter(a => a.verificationStatus === "verified").length
          };
        })
      );

      const actRegex = new RegExp(q, "i");
      const matchingActs = await Activity.find({
        isDemo: { $ne: true },
        hidden: { $ne: true },
        user: { $nin: blockedIds },
        $or: [
          { title: actRegex },
          { description: actRegex },
          { category: actRegex },
          { userName: actRegex },
          { username: actRegex }
        ]
      }).limit(15).lean();

      // Resolve author details
      const userIds = [...new Set(matchingActs.map(a => String(a.user)))];
      const authors = await User.find({ _id: { $in: userIds } }).lean();
      const authorMap = new Map(authors.map(u => [String(u._id), safe(u)]));

      const actResults = matchingActs.map(a => ({
        ...a,
        user: authorMap.get(String(a.user)) || { name: a.userName || "Eco Citizen", username: a.username || "ecocitizen" }
      }));

      return res.json({
        success: true,
        data: {
          users: userResults,
          activities: actResults
        }
      });
    } else {
      // Local fallback
      let blockedIds = [];
      if (currentUserId) {
        const cu = store.users.find(u => String(u._id) === String(currentUserId));
        if (cu && Array.isArray(cu.blockedUsers)) {
          blockedIds = cu.blockedUsers.map(String);
        }
      }

      const matchingUsers = store.users.filter(u => {
        if (blockedIds.includes(String(u._id))) return false;
        const nameMatch = String(u.name || "").toLowerCase().includes(q);
        const userMatch = String(u.username || "").toLowerCase().includes(q);
        return nameMatch || userMatch;
      }).slice(0, 10).map(u => {
        const acts = store.activities.filter(a => {
          const uId = typeof a.user === "object" && a.user ? a.user._id : a.user;
          return String(uId) === String(u._id);
        });
        return {
          ...safe(u),
          activityCount: acts.length,
          verifiedCount: acts.filter(a => a.verificationStatus === "verified").length
        };
      });

      const matchingActs = store.activities.filter(a => {
        if (a.isDemo || a.hidden) return false;
        const authorId = typeof a.user === "object" && a.user ? String(a.user._id) : String(a.user);
        if (blockedIds.includes(authorId)) return false;

        const titleMatch = String(a.title || "").toLowerCase().includes(q);
        const descMatch = String(a.description || "").toLowerCase().includes(q);
        const catMatch = String(a.category || "").toLowerCase().includes(q);
        const authorMatch = typeof a.user === "object" && a.user?.name && String(a.user.name).toLowerCase().includes(q);
        return titleMatch || descMatch || catMatch || authorMatch;
      }).slice(0, 15).map(a => {
        const author = typeof a.user === "object" && a.user ? safe(a.user) : (store.users.find(u => String(u._id) === String(a.user)) ? safe(store.users.find(u => String(u._id) === String(a.user))) : { name: "Eco Citizen" });
        return {
          ...a,
          user: author
        };
      });

      return res.json({
        success: true,
        data: {
          users: matchingUsers,
          activities: matchingActs
        }
      });
    }
  } catch (err) {
    console.error("searchUsersAndActivities error:", err);
    res.status(500).json({ success: false, message: "Search failed" });
  }
}

async function getUserProfile(req, res) {
  try {
    const idOrUsername = String(req.params.idOrUsername || "").toLowerCase().replace(/^@/, "");

    if (isMongoConnected()) {
      const u = await User.findOne({
        $or: [{ _id: idOrUsername }, { username: idOrUsername }]
      }).lean();

      if (!u) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const currentUserId = req.userId;
      if (currentUserId) {
        const cu = await User.findById(currentUserId).lean();
        if (cu && Array.isArray(cu.blockedUsers) && cu.blockedUsers.includes(String(u._id))) {
          return res.status(403).json({ success: false, message: "This user is blocked.", isBlocked: true });
        }
      }

      const acts = await Activity.find({
        user: String(u._id),
        isDemo: { $ne: true },
        hidden: { $ne: true }
      }).sort({ createdAt: -1 }).lean();

      return res.json({
        success: true,
        data: {
          user: safe(u),
          activities: acts.map(a => ({ ...a, user: safe(u) })),
          totalActivities: acts.length,
          verifiedCount: acts.filter(a => a.verificationStatus === "verified").length
        }
      });
    } else {
      const u = store.users.find(x => String(x._id) === idOrUsername || String(x.username || "").toLowerCase() === idOrUsername);
      if (!u) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const currentUserId = req.userId;
      if (currentUserId) {
        const cu = store.users.find(x => String(x._id) === String(currentUserId));
        if (cu && Array.isArray(cu.blockedUsers) && cu.blockedUsers.includes(String(u._id))) {
          return res.status(403).json({ success: false, message: "This user is blocked.", isBlocked: true });
        }
      }

      const acts = store.activities.filter(a => {
        const uId = typeof a.user === "object" && a.user ? a.user._id : a.user;
        return String(uId) === String(u._id) && !a.isDemo && !a.hidden;
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return res.json({
        success: true,
        data: {
          user: safe(u),
          activities: acts.map(a => ({ ...a, user: safe(u) })),
          totalActivities: acts.length,
          verifiedCount: acts.filter(a => a.verificationStatus === "verified").length
        }
      });
    }
  } catch (err) {
    console.error("getUserProfile error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch user profile" });
  }
}

async function blockUser(req, res) {
  try {
    const targetUserId = String(req.params.id || "").trim();
    const currentUserId = req.userId;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: "Target user ID is required" });
    }

    if (isMongoConnected()) {
      const targetUser = await User.findOne({
        $or: [{ _id: targetUserId }, { username: targetUserId.toLowerCase() }]
      });
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "Target user not found" });
      }

      const targetId = String(targetUser._id);
      if (currentUserId && String(currentUserId) === targetId) {
        return res.status(400).json({ success: false, message: "You cannot block yourself" });
      }

      if (currentUserId) {
        const cu = await User.findById(currentUserId);
        if (cu) {
          cu.blockedUsers = cu.blockedUsers || [];
          if (!cu.blockedUsers.includes(targetId)) {
            cu.blockedUsers.push(targetId);
            await cu.save();
          }
        }
      }

      return res.json({
        success: true,
        message: `User @${targetUser.username || "user"} has been blocked due to repeated fake content violations. Their posts and profile will no longer appear in your feed.`,
        data: {
          blockedUserId: targetId,
          username: targetUser.username,
          name: targetUser.name
        }
      });
    } else {
      const targetUser = store.users.find(u => String(u._id) === targetUserId || String(u.username || "").toLowerCase() === targetUserId.toLowerCase());
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "Target user not found" });
      }

      const targetId = String(targetUser._id);
      if (currentUserId && String(currentUserId) === targetId) {
        return res.status(400).json({ success: false, message: "You cannot block yourself" });
      }

      if (currentUserId) {
        const cu = store.users.find(u => String(u._id) === String(currentUserId));
        if (cu) {
          cu.blockedUsers = cu.blockedUsers || [];
          if (!cu.blockedUsers.includes(targetId)) {
            cu.blockedUsers.push(targetId);
            saveStore();
          }
        }
      }

      return res.json({
        success: true,
        message: `User @${targetUser.username || "user"} has been blocked due to repeated fake content violations. Their posts and profile will no longer appear in your feed.`,
        data: {
          blockedUserId: targetId,
          username: targetUser.username,
          name: targetUser.name
        }
      });
    }
  } catch (err) {
    console.error("blockUser error:", err);
    res.status(500).json({ success: false, message: "Failed to block user" });
  }
}

async function unblockUser(req, res) {
  try {
    const targetUserId = String(req.params.id || "").trim();
    const currentUserId = req.userId;

    if (isMongoConnected()) {
      const targetUser = await User.findOne({
        $or: [{ _id: targetUserId }, { username: targetUserId.toLowerCase() }]
      });
      const targetId = targetUser ? String(targetUser._id) : targetUserId;

      if (currentUserId) {
        const cu = await User.findById(currentUserId);
        if (cu && Array.isArray(cu.blockedUsers)) {
          cu.blockedUsers = cu.blockedUsers.filter(id => String(id) !== targetId);
          await cu.save();
        }
      }

      return res.json({
        success: true,
        message: `User @${targetUser?.username || "user"} has been unblocked.`,
        data: {
          unblockedUserId: targetId
        }
      });
    } else {
      const targetUser = store.users.find(u => String(u._id) === targetUserId || String(u.username || "").toLowerCase() === targetUserId.toLowerCase());
      const targetId = targetUser ? String(targetUser._id) : targetUserId;

      if (currentUserId) {
        const cu = store.users.find(u => String(u._id) === String(currentUserId));
        if (cu && Array.isArray(cu.blockedUsers)) {
          cu.blockedUsers = cu.blockedUsers.filter(id => String(id) !== targetId);
          saveStore();
        }
      }

      return res.json({
        success: true,
        message: `User @${targetUser?.username || "user"} has been unblocked.`,
        data: {
          unblockedUserId: targetId
        }
      });
    }
  } catch (err) {
    console.error("unblockUser error:", err);
    res.status(500).json({ success: false, message: "Failed to unblock user" });
  }
}

async function getBlockedUsers(req, res) {
  try {
    const currentUserId = req.userId;
    if (!currentUserId) {
      return res.json({ success: true, data: [] });
    }

    if (isMongoConnected()) {
      const cu = await User.findById(currentUserId).lean();
      const blockedIds = cu?.blockedUsers || [];
      const blockedUsers = await User.find({ _id: { $in: blockedIds } }).lean();

      const blockedList = blockedUsers.map(u => ({
        ...safe(u),
        consecutiveFakeUploads: u.consecutiveFakeUploads || 3
      }));

      return res.json({ success: true, data: blockedList });
    } else {
      const cu = store.users.find(u => String(u._id) === String(currentUserId));
      const blockedIds = cu?.blockedUsers || [];
      const blockedList = store.users
        .filter(u => blockedIds.includes(String(u._id)))
        .map(u => ({
          ...safe(u),
          consecutiveFakeUploads: u.consecutiveFakeUploads || 3
        }));

      return res.json({ success: true, data: blockedList });
    }
  } catch (err) {
    console.error("getBlockedUsers error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch blocked users" });
  }
}

module.exports = {
  updateMe,
  searchUsersAndActivities,
  getUserProfile,
  blockUser,
  unblockUser,
  getBlockedUsers
};
