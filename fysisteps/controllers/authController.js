const bcrypt = require("bcryptjs"), jwt = require("jsonwebtoken"), { randomUUID } = require("crypto");
const { store, saveStore } = require("../config/store");
const msg91Service = require("../services/msg91Service");
const twilioService = require("../services/twilioService");

const safe = u => {
  if (!u) return null;
  const { password, ...x } = u;
  return x;
};

function token(u) {
  return jwt.sign({ id: u._id }, process.env.JWT_SECRET || "fysisteps-local-secret-change-me", { expiresIn: "7d" });
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Allow special characters in username (any non-whitespace characters, 2 to 40 length)
const USERNAME_REGEX = /^[^\s]{2,40}$/;

// In-memory OTP storage
const emailOtps = new Map(); // email -> { otp, expiresAt }
const phoneOtps = new Map(); // phone -> { otp, expiresAt }
const verifiedEmails = new Set(); // set of emails verified via OTP

function checkUsername(req, res) {
  const raw = String(req.query.username || "").toLowerCase().trim().replace(/^@/, "");
  if (!raw) {
    return res.json({ success: true, available: false, message: "Username is required" });
  }
  if (raw.length < 2) {
    return res.json({ success: true, available: false, message: "Username must be at least 2 characters" });
  }
  if (!USERNAME_REGEX.test(raw)) {
    return res.json({ success: true, available: false, message: "Username cannot contain spaces" });
  }
  const taken = store.users.some(u => String(u.username || "").toLowerCase() === raw);
  if (taken) {
    return res.json({
      success: true,
      available: false,
      message: `Username '@${raw}' already exists. Please choose another username.`
    });
  }
  return res.json({
    success: true,
    available: true,
    message: `Username '@${raw}' is available!`
  });
}

async function register(req, res) {
  const { name, username, email, password, phone, emailVerified } = req.body || {};
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ success: false, message: "Full name, email and password (6+ chars) are required" });
  }

  // Passwords can include letters, numbers, and special characters

  const cleanEmail = String(email).toLowerCase().trim();
  if (!EMAIL_REGEX.test(cleanEmail)) {
    return res.status(400).json({ success: false, message: "Please enter a valid, real email address (e.g. name@gmail.com)" });
  }

  // Username validation & uniqueness check (supports special characters)
  let cleanUsername = String(username || "").toLowerCase().trim().replace(/^@/, "");
  if (!cleanUsername) {
    cleanUsername = cleanEmail.split("@")[0].slice(0, 25);
  }
  if (!USERNAME_REGEX.test(cleanUsername)) {
    return res.status(400).json({
      success: false,
      message: "Username must be 2-40 characters and cannot contain spaces"
    });
  }

  // Check if username already exists
  const usernameTaken = store.users.some(u => String(u.username || "").toLowerCase() === cleanUsername);
  if (usernameTaken) {
    return res.status(409).json({
      success: false,
      message: `Username '@${cleanUsername}' already exists. Please choose another username.`
    });
  }

  // Check if email already exists
  if (store.users.some(u => u.email === cleanEmail)) {
    return res.status(409).json({ success: false, message: "An account with this email already exists" });
  }

  const cleanPhone = phone ? String(phone).replace(/[^0-9+]/g, "").trim() : "";
  const isEmailVerified = Boolean(emailVerified || verifiedEmails.has(cleanEmail));

  const u = {
    _id: randomUUID(),
    name: name.trim(),
    username: cleanUsername,
    email: cleanEmail,
    emailVerified: isEmailVerified,
    phone: cleanPhone,
    phoneVerified: false,
    password: await bcrypt.hash(password, 10),
    avatar: "",
    bio: "",
    points: 0,
    verifiedActivities: 0,
    followers: [],
    following: [],
    impact: { trees: 0, wasteKg: 0, waterLitres: 0 },
    organizations: [],
    createdAt: new Date(),
    isDemo: false
  };

  store.users.push(u);
  saveStore();
  res.status(201).json({ success: true, data: { user: safe(u), token: token(u) } });
}

async function login(req, res) {
  const { email, emailOrUsername, password } = req.body || {};
  const query = String(email || emailOrUsername || "").toLowerCase().trim().replace(/^@/, "");
  
  // Find by email, username, or phone
  const u = store.users.find(x => 
    String(x.email || "").toLowerCase() === query || 
    String(x.username || "").toLowerCase() === query ||
    (x.phone && String(x.phone).replace(/[^0-9]/g, "") === query.replace(/[^0-9]/g, ""))
  );

  if (!u || !(await bcrypt.compare(password || "", u.password))) {
    return res.status(401).json({ success: false, message: "Invalid credentials (check email/username and password)" });
  }

  res.json({ success: true, data: { user: safe(u), token: token(u) } });
}

async function loginWithOtp(req, res) {
  const { email, phone, otp } = req.body || {};
  const cleanEmail = String(email || "").toLowerCase().trim();
  const rawPhone = String(phone || "").trim();
  const inputOtp = String(otp || "").trim();

  if (!inputOtp || (!cleanEmail && !rawPhone)) {
    return res.status(400).json({ success: false, message: "Email or phone number, and 6-digit verification code are required" });
  }

  let u = null;

  if (rawPhone) {
    // Verify phone OTP via MSG91
    const verifyRes = await msg91Service.verifyPhoneOtp({ phone: rawPhone, otp: inputOtp });
    if (!verifyRes.success) {
      return res.status(400).json({ success: false, message: verifyRes.message || "Invalid or expired Phone OTP" });
    }

    const cleanDigits = rawPhone.replace(/[^0-9]/g, "");
    u = store.users.find(x => x.phone && String(x.phone).replace(/[^0-9]/g, "") === cleanDigits);
    if (!u) {
      return res.status(404).json({
        success: false,
        message: "No account found with this phone number. Please create an account first.",
        phoneVerified: true,
        phone: rawPhone
      });
    }
    u.phoneVerified = true;
    saveStore();
  } else {
    // Verify email OTP via Twilio
    const verifyRes = await twilioService.verifyEmailOtp({ email: cleanEmail, otp: inputOtp });
    if (!verifyRes.success) {
      return res.status(400).json({ success: false, message: verifyRes.message || "Invalid or expired Email OTP" });
    }

    verifiedEmails.add(cleanEmail);
    u = store.users.find(x => String(x.email || "").toLowerCase() === cleanEmail);
    if (!u) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email. Please create an account first.",
        emailVerified: true,
        email: cleanEmail
      });
    }
    u.emailVerified = true;
    saveStore();
  }

  res.json({
    success: true,
    message: "Verified and signed in successfully! 🎉",
    data: { user: safe(u), token: token(u) }
  });
}

function me(req, res) {
  const u = store.users.find(x => x._id === req.userId);
  if (!u) return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, data: safe(u) });
}

// ── Email OTP Verification (Twilio) ──
async function sendEmailOtp(req, res) {
  const u = store.users.find(x => String(x._id) === String(req.userId));
  const email = (req.body?.email || u?.email || "").toLowerCase().trim();
  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, message: "A valid email is required to send Twilio verification OTP" });
  }

  const result = await twilioService.sendEmailOtp({ email });

  // Backup in-memory tracking
  if (result.otp) {
    emailOtps.set(email, { otp: result.otp, expiresAt: Date.now() + 10 * 60 * 1000 });
  }

  res.json({
    success: true,
    message: result.message || `Verification code sent to ${email} via Twilio`,
    provider: result.provider || "Twilio",
    devOtp: result.devOtp,
    expiresIn: 600
  });
}

async function verifyEmailOtp(req, res) {
  const u = store.users.find(x => String(x._id) === String(req.userId));
  const { email, otp } = req.body || {};
  const targetEmail = (email || u?.email || "").toLowerCase().trim();

  if (!targetEmail || !otp) {
    return res.status(400).json({ success: false, message: "Email and 6-digit OTP are required" });
  }

  const verifyRes = await twilioService.verifyEmailOtp({ email: targetEmail, otp });
  if (!verifyRes.success) {
    return res.status(400).json({ success: false, message: verifyRes.message || "Invalid or expired Twilio verification code" });
  }

  // Valid OTP! Mark verified
  emailOtps.delete(targetEmail);
  verifiedEmails.add(targetEmail);

  if (u) {
    u.email = targetEmail;
    u.emailVerified = true;
    saveStore();
    return res.json({ success: true, message: "Email verified successfully via Twilio! 🎉", data: safe(u), provider: "Twilio" });
  }

  res.json({ success: true, message: "Email verified successfully via Twilio! 🎉", email: targetEmail, emailVerified: true, provider: "Twilio" });
}

// ── Phone OTP Verification (MSG91) ──
async function sendPhoneOtp(req, res) {
  const u = store.users.find(x => String(x._id) === String(req.userId));
  const rawPhone = String(req.body?.phone || u?.phone || "").trim();
  const digitsOnly = rawPhone.replace(/[^0-9]/g, "");

  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return res.status(400).json({ success: false, message: "Please provide a valid phone number (at least 10 digits)" });
  }

  const result = await msg91Service.sendPhoneOtp({ phone: rawPhone });

  // Backup in-memory tracking
  if (result.otp) {
    phoneOtps.set(digitsOnly, { otp: result.otp, rawPhone, expiresAt: Date.now() + 10 * 60 * 1000, userId: String(u?._id || "") });
  }

  if (u) {
    u.phone = rawPhone;
    saveStore();
  }

  res.json({
    success: true,
    message: result.message || `Verification code sent via MSG91 to ${rawPhone}`,
    provider: result.provider || "MSG91",
    devOtp: result.devOtp,
    phone: rawPhone,
    expiresIn: 600
  });
}

async function verifyPhoneOtp(req, res) {
  const u = store.users.find(x => String(x._id) === String(req.userId));
  const { phone, otp } = req.body || {};
  const rawPhone = String(phone || u?.phone || "").trim();
  const digitsOnly = rawPhone.replace(/[^0-9]/g, "");

  if (!digitsOnly || !otp) {
    return res.status(400).json({ success: false, message: "Phone number and 6-digit OTP are required" });
  }

  const verifyRes = await msg91Service.verifyPhoneOtp({ phone: rawPhone, otp });
  if (!verifyRes.success) {
    return res.status(400).json({ success: false, message: verifyRes.message || "Invalid or expired MSG91 verification code" });
  }

  // Valid OTP! Mark verified
  phoneOtps.delete(digitsOnly);
  if (u) {
    u.phone = rawPhone;
    u.phoneVerified = true;
    saveStore();
    return res.json({ success: true, message: "Phone verified successfully via MSG91! 🎉", data: safe(u), provider: "MSG91" });
  }

  res.json({ success: true, message: "Phone verified successfully via MSG91! 🎉", phone: rawPhone, phoneVerified: true, provider: "MSG91" });
}

function guest(req, res) {
  let u = store.users.find(x => x.username === 'ecowarrior');
  if (!u && store.users.length > 0) u = store.users[0];
  if (!u) {
    u = {
      _id: randomUUID(),
      name: "Eco Champion",
      username: "ecochampion",
      email: "eco@fysisteps.org",
      ecoCoins: 120,
      points: 180,
      treesPlanted: 3,
      cleanupsCompleted: 5,
      createdAt: new Date()
    };
    store.users.push(u);
    saveStore();
  }
  return res.json({ success: true, token: token(u), user: safe(u) });
}

module.exports = {
  register,
  login,
  loginWithOtp,
  checkUsername,
  me,
  sendEmailOtp,
  verifyEmailOtp,
  sendPhoneOtp,
  verifyPhoneOtp,
  guest
};

