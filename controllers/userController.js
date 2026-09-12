const { User, Activity } = require("../models");

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
  } catch (err) {
    console.error("updateMe error:", err);
    res.status(500).json({ success: false, message: "Failed to update profile" });
  }
}

async function searchUsersAndActivities(req, res) {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    if (!q || q.length < 2) {
      return res.json({ success: true, data: { users: [], activities: [] } });
    }

    const currentUserId = req.userId;
    let blockedIds = [];
    if (currentUserId) {
      const cu = await User.findById(currentUserId).lean();
      if (cu && Array.isArray(cu.blockedUsers)) {
        blockedIds = cu.blockedUsers.map(String);
      }
    }

    const userQuery = {
      $and: [
        {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { username: { $regex: q, $options: "i" } }
          ]
        }
      ]
    };
    if (blockedIds.length > 0) {
      userQuery.$and.push({ _id: { $nin: blockedIds } });
    }

    const users = await User.find(userQuery).limit(10).lean();

    const userResults = await Promise.all(
      users.map(async u => {
        const [totalCount, verifiedCount] = await Promise.all([
          Activity.countDocuments({ user: String(u._id) }),
          Activity.countDocuments({ user: String(u._id), verificationStatus: "verified" })
        ]);
        return {
          ...safe(u),
          activityCount: totalCount,
          verifiedCount
        };
      })
    );

    const actQuery = {
      isDemo: { $ne: true },
      hidden: { $ne: true },
      $or: [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
        { userName: { $regex: q, $options: "i" } }
      ]
    };
    if (blockedIds.length > 0) {
      actQuery.user = { $nin: blockedIds };
    }

    const activities = await Activity.find(actQuery).limit(15).lean();

    const actUserIds = [...new Set(activities.map(a => typeof a.user === "object" && a.user ? String(a.user._id) : String(a.user)))];
    const authors = await User.find({ _id: { $in: actUserIds } }).lean();
    const authorMap = new Map(authors.map(u => [String(u._id), safe(u)]));

    const actResults = activities.map(a => {
      const uId = typeof a.user === "object" && a.user ? String(a.user._id) : String(a.user);
      return {
        ...a,
        user: authorMap.get(uId) || { _id: uId, name: a.userName || "Eco Citizen", username: a.username || "ecocitizen" }
      };
    });

    return res.json({
      success: true,
      data: {
        users: userResults,
        activities: actResults
      }
    });
  } catch (err) {
    console.error("searchUsersAndActivities error:", err);
    res.status(500).json({ success: false, message: "Search failed" });
  }
}

async function getUserProfile(req, res) {
  try {
    const idOrUsername = String(req.params.idOrUsername || "").toLowerCase().replace(/^@/, "");

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
  } catch (err) {
    console.error("blockUser error:", err);
    res.status(500).json({ success: false, message: "Failed to block user" });
  }
}

async function unblockUser(req, res) {
  try {
    const targetUserId = String(req.params.id || "").trim();
    const currentUserId = req.userId;

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

    const cu = await User.findById(currentUserId).lean();
    const blockedIds = cu?.blockedUsers || [];
    const blockedUsers = await User.find({ _id: { $in: blockedIds } }).lean();

    const blockedList = blockedUsers.map(u => ({
      ...safe(u),
      consecutiveFakeUploads: u.consecutiveFakeUploads || 3
    }));

    return res.json({ success: true, data: blockedList });
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
