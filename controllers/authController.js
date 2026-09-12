const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const { isMongoConnected } = require("../config/db");
const { User } = require("../models");
const { store, saveStore } = require("../config/store");
const { getJwtSecret } = require("../middleware/auth");
const msg91Service = require("../services/msg91Service");
const twilioService = require("../services/twilioService");

const safe = u => {
  if (!u) return null;
  if (typeof u.toSafeObject === "function") {
    return u.toSafeObject();
  }
  const obj = u.toObject ? u.toObject() : { ...u };
  delete obj.password;
  delete obj.__v;
  return obj;
};

function token(u) {
  const id = u._id ? String(u._id) : String(u.id);
  return jwt.sign({ id }, getJwtSecret(), { expiresIn: "7d" });
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const USERNAME_REGEX = /^[^\s]{2,40}$/;

// In-memory OTP storage
const emailOtps = new Map(); // email -> { otp, expiresAt }
const phoneOtps = new Map(); // phone -> { otp, expiresAt }
const verifiedEmails = new Set(); // set of emails verified via OTP

async function checkUsername(req, res) {
  try {
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

    let taken = false;
    if (isMongoConnected()) {
      const existing = await User.findOne({ username: raw });
      taken = !!existing;
    } else {
      taken = store.users.some(u => String(u.username || "").toLowerCase() === raw);
    }

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
  } catch (err) {
    console.error("checkUsername error:", err);
    res.status(500).json({ success: false, message: "Server error checking username" });
  }
}

async function register(req, res) {
  try {
    const { name, username, email, password, phone, emailVerified } = req.body || {};
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Full name, email and password (6+ chars) are required" });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: "Please enter a valid, real email address (e.g. name@gmail.com)" });
    }

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

    const cleanPhone = phone ? String(phone).replace(/[^0-9+]/g, "").trim() : "";
    const isEmailVerified = Boolean(emailVerified || verifiedEmails.has(cleanEmail));
    const hashedPassword = await bcrypt.hash(password, 10);

    if (isMongoConnected()) {
      // Check MongoDB
      const [existingUsername, existingEmail] = await Promise.all([
        User.findOne({ username: cleanUsername }),
        User.findOne({ email: cleanEmail })
      ]);

      if (existingUsername) {
        return res.status(409).json({
          success: false,
          message: `Username '@${cleanUsername}' already exists. Please choose another username.`
        });
      }
      if (existingEmail) {
        return res.status(409).json({ success: false, message: "An account with this email already exists" });
      }

      const newUser = await User.create({
        _id: randomUUID(),
        name: name.trim(),
        username: cleanUsername,
        email: cleanEmail,
        emailVerified: isEmailVerified,
        phone: cleanPhone,
        phoneVerified: false,
        password: hashedPassword,
        avatar: "",
        bio: "",
        points: 0,
        verifiedActivities: 0,
        activities: 0,
        impact: { trees: 0, cleanups: 0, wasteKg: 0, waterLitres: 0 },
        organizations: [],
        ecoCoins: 50,
        isDemo: false
      });

      return res.status(201).json({ success: true, data: { user: safe(newUser), token: token(newUser) } });
    } else {
      // Local fallback
      const usernameTaken = store.users.some(u => String(u.username || "").toLowerCase() === cleanUsername);
      if (usernameTaken) {
        return res.status(409).json({
          success: false,
          message: `Username '@${cleanUsername}' already exists. Please choose another username.`
        });
      }
      if (store.users.some(u => u.email === cleanEmail)) {
        return res.status(409).json({ success: false, message: "An account with this email already exists" });
      }

      const u = {
        _id: randomUUID(),
        name: name.trim(),
        username: cleanUsername,
        email: cleanEmail,
        emailVerified: isEmailVerified,
        phone: cleanPhone,
        phoneVerified: false,
        password: hashedPassword,
        avatar: "",
        bio: "",
        points: 0,
        verifiedActivities: 0,
        followers: [],
        following: [],
        impact: { trees: 0, cleanups: 0, wasteKg: 0, waterLitres: 0 },
        organizations: [],
        ecoCoins: 50,
        createdAt: new Date(),
        isDemo: false
      };

      store.users.push(u);
      saveStore();
      return res.status(201).json({ success: true, data: { user: safe(u), token: token(u) } });
    }
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: "Registration failed. Please try again." });
  }
}

async function login(req, res) {
  try {
    const { email, emailOrUsername, password } = req.body || {};
    const query = String(email || emailOrUsername || "").toLowerCase().trim().replace(/^@/, "");

    if (!query || !password) {
      return res.status(400).json({ success: false, message: "Username/email and password are required" });
    }

    let u = null;

    if (isMongoConnected()) {
      const cleanDigits = query.replace(/[^0-9]/g, "");
      const searchCriteria = [
        { email: query },
        { username: query }
      ];
      if (cleanDigits.length >= 10) {
        searchCriteria.push({ phone: { $regex: cleanDigits } });
      }
      u = await User.findOne({ $or: searchCriteria });
    } else {
      u = store.users.find(x =>
        String(x.email || "").toLowerCase() === query ||
        String(x.username || "").toLowerCase() === query ||
        (x.phone && String(x.phone).replace(/[^0-9]/g, "") === query.replace(/[^0-9]/g, ""))
      );
    }

    if (!u || !(await bcrypt.compare(password || "", u.password))) {
      return res.status(401).json({ success: false, message: "Invalid credentials (check email/username and password)" });
    }

    res.json({ success: true, data: { user: safe(u), token: token(u) } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Authentication failed. Please try again." });
  }
}

async function loginWithOtp(req, res) {
  try {
    const { email, phone, otp } = req.body || {};
    const cleanEmail = String(email || "").toLowerCase().trim();
    const rawPhone = String(phone || "").trim();
    const inputOtp = String(otp || "").trim();

    if (!inputOtp || (!cleanEmail && !rawPhone)) {
      return res.status(400).json({ success: false, message: "Email or phone number, and 6-digit verification code are required" });
    }

    let u = null;

    if (rawPhone) {
      const verifyRes = await msg91Service.verifyPhoneOtp({ phone: rawPhone, otp: inputOtp });
      if (!verifyRes.success) {
        return res.status(400).json({ success: false, message: verifyRes.message || "Invalid or expired Phone OTP" });
      }

      const cleanDigits = rawPhone.replace(/[^0-9]/g, "");

      if (isMongoConnected()) {
        u = await User.findOne({ phone: { $regex: cleanDigits } });
        if (!u) {
          return res.status(404).json({
            success: false,
            message: "No account found with this phone number. Please create an account first.",
            phoneVerified: true,
            phone: rawPhone
          });
        }
        u.phoneVerified = true;
        await u.save();
      } else {
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
      }
    } else {
      const verifyRes = await twilioService.verifyEmailOtp({ email: cleanEmail, otp: inputOtp });
      if (!verifyRes.success) {
        return res.status(400).json({ success: false, message: verifyRes.message || "Invalid or expired Email OTP" });
      }

      verifiedEmails.add(cleanEmail);

      if (isMongoConnected()) {
        u = await User.findOne({ email: cleanEmail });
        if (!u) {
          return res.status(404).json({
            success: false,
            message: "No account found with this email. Please create an account first.",
            emailVerified: true,
            email: cleanEmail
          });
        }
        u.emailVerified = true;
        await u.save();
      } else {
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
    }

    res.json({
      success: true,
      message: "Verified and signed in successfully! 🎉",
      data: { user: safe(u), token: token(u) }
    });
  } catch (err) {
    console.error("loginWithOtp error:", err);
    res.status(500).json({ success: false, message: "OTP login failed. Please try again." });
  }
}

async function me(req, res) {
  try {
    let u = null;
    if (isMongoConnected()) {
      u = await User.findById(req.userId);
    } else {
      u = store.users.find(x => String(x._id) === String(req.userId));
    }

    if (!u) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: safe(u) });
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ success: false, message: "Server error fetching user profile" });
  }
}

async function sendEmailOtp(req, res) {
  try {
    let u = null;
    if (isMongoConnected()) {
      u = await User.findById(req.userId);
    } else {
      u = store.users.find(x => String(x._id) === String(req.userId));
    }

    const email = (req.body?.email || u?.email || "").toLowerCase().trim();
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: "A valid email is required to send Twilio verification OTP" });
    }

    const result = await twilioService.sendEmailOtp({ email });
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
  } catch (err) {
    console.error("sendEmailOtp error:", err);
    res.status(500).json({ success: false, message: "Failed to send email verification code" });
  }
}

async function verifyEmailOtp(req, res) {
  try {
    let u = null;
    if (isMongoConnected()) {
      u = await User.findById(req.userId);
    } else {
      u = store.users.find(x => String(x._id) === String(req.userId));
    }

    const { email, otp } = req.body || {};
    const targetEmail = (email || u?.email || "").toLowerCase().trim();

    if (!targetEmail || !otp) {
      return res.status(400).json({ success: false, message: "Email and 6-digit OTP are required" });
    }

    const verifyRes = await twilioService.verifyEmailOtp({ email: targetEmail, otp });
    if (!verifyRes.success) {
      return res.status(400).json({ success: false, message: verifyRes.message || "Invalid or expired Twilio verification code" });
    }

    emailOtps.delete(targetEmail);
    verifiedEmails.add(targetEmail);

    if (u) {
      u.email = targetEmail;
      u.emailVerified = true;
      if (isMongoConnected()) {
        await u.save();
      } else {
        saveStore();
      }
      return res.json({ success: true, message: "Email verified successfully via Twilio! 🎉", data: safe(u), provider: "Twilio" });
    }

    res.json({ success: true, message: "Email verified successfully via Twilio! 🎉", email: targetEmail, emailVerified: true, provider: "Twilio" });
  } catch (err) {
    console.error("verifyEmailOtp error:", err);
    res.status(500).json({ success: false, message: "Failed to verify email OTP" });
  }
}

async function sendPhoneOtp(req, res) {
  try {
    let u = null;
    if (isMongoConnected()) {
      u = await User.findById(req.userId);
    } else {
      u = store.users.find(x => String(x._id) === String(req.userId));
    }

    const rawPhone = String(req.body?.phone || u?.phone || "").trim();
    const digitsOnly = rawPhone.replace(/[^0-9]/g, "");

    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      return res.status(400).json({ success: false, message: "Please provide a valid phone number (at least 10 digits)" });
    }

    const result = await msg91Service.sendPhoneOtp({ phone: rawPhone });
    if (result.otp) {
      phoneOtps.set(digitsOnly, { otp: result.otp, rawPhone, expiresAt: Date.now() + 10 * 60 * 1000, userId: String(u?._id || "") });
    }

    if (u) {
      u.phone = rawPhone;
      if (isMongoConnected()) {
        await u.save();
      } else {
        saveStore();
      }
    }

    res.json({
      success: true,
      message: result.message || `Verification code sent via MSG91 to ${rawPhone}`,
      provider: result.provider || "MSG91",
      devOtp: result.devOtp,
      phone: rawPhone,
      expiresIn: 600
    });
  } catch (err) {
    console.error("sendPhoneOtp error:", err);
    res.status(500).json({ success: false, message: "Failed to send phone verification code" });
  }
}

async function verifyPhoneOtp(req, res) {
  try {
    let u = null;
    if (isMongoConnected()) {
      u = await User.findById(req.userId);
    } else {
      u = store.users.find(x => String(x._id) === String(req.userId));
    }

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

    phoneOtps.delete(digitsOnly);
    if (u) {
      u.phone = rawPhone;
      u.phoneVerified = true;
      if (isMongoConnected()) {
        await u.save();
      } else {
        saveStore();
      }
      return res.json({ success: true, message: "Phone verified successfully via MSG91! 🎉", data: safe(u), provider: "MSG91" });
    }

    res.json({ success: true, message: "Phone verified successfully via MSG91! 🎉", phone: rawPhone, phoneVerified: true, provider: "MSG91" });
  } catch (err) {
    console.error("verifyPhoneOtp error:", err);
    res.status(500).json({ success: false, message: "Failed to verify phone OTP" });
  }
}

async function guest(req, res) {
  try {
    let u = null;

    if (isMongoConnected()) {
      // Find existing demo user
      u = await User.findOne({ username: 'ecowarrior' }) || await User.findOne({ isDemo: true }) || await User.findOne();
      if (!u) {
        // Create an initial guest user in MongoDB if completely empty
        const defaultPassword = await bcrypt.hash('Guest@Eco2025', 10);
        u = await User.create({
          _id: randomUUID(),
          name: "Eco Champion",
          username: "ecochampion",
          email: "eco@fysisteps.org",
          password: defaultPassword,
          ecoCoins: 120,
          points: 180,
          impact: { trees: 3, cleanups: 5, wasteKg: 20, waterLitres: 350 },
          verifiedActivities: 5,
          isDemo: true
        });
      }
    } else {
      u = store.users.find(x => x.username === 'ecowarrior') || store.users[0];
      if (!u) {
        u = {
          _id: randomUUID(),
          name: "Eco Champion",
          username: "ecochampion",
          email: "eco@fysisteps.org",
          password: await bcrypt.hash('Guest@Eco2025', 10),
          ecoCoins: 120,
          points: 180,
          verifiedActivities: 5,
          impact: { trees: 3, cleanups: 5, wasteKg: 20, waterLitres: 350 },
          createdAt: new Date(),
          isDemo: true
        };
        store.users.push(u);
        saveStore();
      }
    }

    return res.json({ success: true, token: token(u), user: safe(u) });
  } catch (err) {
    console.error("Guest login error:", err);
    res.status(500).json({ success: false, message: "Guest login failed" });
  }
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
