const { store, saveStore } = require('../config/store');
const safe = u => {
  if (!u) return null;
  const { password, ...x } = u;
  return x;
};

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,25}$/;

function updateMe(req, res) {
  const u = store.users.find(x => String(x._id) === String(req.userId));
  if (!u) return res.status(404).json({ success: false, message: 'User not found' });
  const { name, username, email, bio, avatar, phone } = req.body || {};

  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) return res.status(400).json({ success: false, message: 'Name cannot be empty' });
    u.name = n;
  }

  if (username !== undefined) {
    const cleanUsername = String(username).toLowerCase().trim().replace(/^@/, '');
    if (!USERNAME_REGEX.test(cleanUsername)) {
      return res.status(400).json({ success: false, message: 'Username must be 3-25 characters (letters, numbers, underscore only)' });
    }
    const clash = store.users.find(x => String(x.username || '').toLowerCase() === cleanUsername && String(x._id) !== String(u._id));
    if (clash) {
      return res.status(409).json({ success: false, message: `Username '@${cleanUsername}' is already taken. Please choose another username.` });
    }
    u.username = cleanUsername;
  }

  if (email !== undefined) {
    const e = String(email).trim().toLowerCase();
    if (!e || !EMAIL_REGEX.test(e)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid, real email address' });
    }
    const clash = store.users.find(x => x.email === e && String(x._id) !== String(u._id));
    if (clash) return res.status(409).json({ success: false, message: 'Email is already in use' });
    if (u.email !== e) {
      u.email = e;
      u.emailVerified = false;
    }
  }

  if (phone !== undefined) {
    const p = String(phone).replace(/[^0-9+]/g, '').trim();
    if (u.phone !== p) {
      u.phone = p;
      u.phoneVerified = false;
    }
  }

  if (bio !== undefined) u.bio = String(bio).trim();
  if (avatar !== undefined) {
    u.avatar = avatar ? String(avatar).trim() : '';
  }

  saveStore();
  res.json({ success: true, data: safe(u) });
}

function searchUsersAndActivities(req, res) {
  const q = String(req.query.q || '').trim().toLowerCase().replace(/^@/, '');
  if (!q) {
    return res.json({ success: true, data: { users: [], activities: [] } });
  }

  const currentUserId = req.userId;
  let blockedIds = [];
  if (currentUserId) {
    const cu = store.users.find(u => String(u._id) === String(currentUserId));
    if (cu && Array.isArray(cu.blockedUsers)) {
      blockedIds = cu.blockedUsers.map(String);
    }
  }

  const matchingUsers = store.users.filter(u => {
    if (blockedIds.includes(String(u._id))) return false;
    const nameMatch = String(u.name || '').toLowerCase().includes(q);
    const userMatch = String(u.username || '').toLowerCase().includes(q);
    return nameMatch || userMatch;
  }).slice(0, 10).map(u => {
    const acts = store.activities.filter(a => {
      const uId = typeof a.user === 'object' && a.user ? a.user._id : a.user;
      return String(uId) === String(u._id);
    });
    return {
      ...safe(u),
      activityCount: acts.length,
      verifiedCount: acts.filter(a => a.verificationStatus === 'verified').length
    };
  });

  const matchingActs = store.activities.filter(a => {
    if (a.isDemo || a.hidden) return false;
    const authorId = typeof a.user === 'object' && a.user ? String(a.user._id) : String(a.user);
    if (blockedIds.includes(authorId)) return false;

    const titleMatch = String(a.title || '').toLowerCase().includes(q);
    const descMatch = String(a.description || '').toLowerCase().includes(q);
    const catMatch = String(a.category || '').toLowerCase().includes(q);
    const authorMatch = typeof a.user === 'object' && a.user?.name && String(a.user.name).toLowerCase().includes(q);
    return titleMatch || descMatch || catMatch || authorMatch;
  }).slice(0, 15).map(a => {
    const author = typeof a.user === 'object' && a.user ? safe(a.user) : (store.users.find(u => String(u._id) === String(a.user)) ? safe(store.users.find(u => String(u._id) === String(a.user))) : { name: 'Eco Citizen' });
    return {
      ...a,
      user: author
    };
  });

  res.json({
    success: true,
    data: {
      users: matchingUsers,
      activities: matchingActs
    }
  });
}

function getUserProfile(req, res) {
  const idOrUsername = String(req.params.idOrUsername || '').toLowerCase().replace(/^@/, '');
  const u = store.users.find(x => String(x._id) === idOrUsername || String(x.username || '').toLowerCase() === idOrUsername);
  if (!u) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const currentUserId = req.userId;
  if (currentUserId) {
    const cu = store.users.find(x => String(x._id) === String(currentUserId));
    if (cu && Array.isArray(cu.blockedUsers) && cu.blockedUsers.includes(String(u._id))) {
      return res.status(403).json({ success: false, message: 'This user is blocked.', isBlocked: true });
    }
  }

  const acts = store.activities.filter(a => {
    const uId = typeof a.user === 'object' && a.user ? a.user._id : a.user;
    return String(uId) === String(u._id) && !a.isDemo && !a.hidden;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    success: true,
    data: {
      user: safe(u),
      activities: acts.map(a => ({ ...a, user: safe(u) })),
      totalActivities: acts.length,
      verifiedCount: acts.filter(a => a.verificationStatus === 'verified').length
    }
  });
}

function blockUser(req, res) {
  const targetUserId = String(req.params.id || '').trim();
  const currentUserId = req.userId;

  if (!targetUserId) {
    return res.status(400).json({ success: false, message: 'Target user ID is required' });
  }

  const targetUser = store.users.find(u => String(u._id) === targetUserId || String(u.username || '').toLowerCase() === targetUserId.toLowerCase());
  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'Target user not found' });
  }

  const targetId = String(targetUser._id);
  if (currentUserId && String(currentUserId) === targetId) {
    return res.status(400).json({ success: false, message: 'You cannot block yourself' });
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

  res.json({
    success: true,
    message: `User @${targetUser.username || 'user'} has been blocked due to repeated fake content violations. Their posts and profile will no longer appear in your feed.`,
    data: {
      blockedUserId: targetId,
      username: targetUser.username,
      name: targetUser.name
    }
  });
}

function unblockUser(req, res) {
  const targetUserId = String(req.params.id || '').trim();
  const currentUserId = req.userId;

  const targetUser = store.users.find(u => String(u._id) === targetUserId || String(u.username || '').toLowerCase() === targetUserId.toLowerCase());
  const targetId = targetUser ? String(targetUser._id) : targetUserId;

  if (currentUserId) {
    const cu = store.users.find(u => String(u._id) === String(currentUserId));
    if (cu && Array.isArray(cu.blockedUsers)) {
      cu.blockedUsers = cu.blockedUsers.filter(id => String(id) !== targetId);
      saveStore();
    }
  }

  res.json({
    success: true,
    message: `User @${targetUser?.username || 'user'} has been unblocked.`,
    data: {
      unblockedUserId: targetId
    }
  });
}

function getBlockedUsers(req, res) {
  const currentUserId = req.userId;
  if (!currentUserId) {
    return res.json({ success: true, data: [] });
  }

  const cu = store.users.find(u => String(u._id) === String(currentUserId));
  const blockedIds = cu?.blockedUsers || [];
  const blockedList = store.users
    .filter(u => blockedIds.includes(String(u._id)))
    .map(u => ({
      ...safe(u),
      consecutiveFakeUploads: u.consecutiveFakeUploads || 3
    }));

  res.json({ success: true, data: blockedList });
}

module.exports = {
  updateMe,
  searchUsersAndActivities,
  getUserProfile,
  blockUser,
  unblockUser,
  getBlockedUsers
};
