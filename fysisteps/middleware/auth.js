const jwt = require("jsonwebtoken");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: JWT_SECRET environment variable is required in production.");
    }
    return "fysisteps-local-secret-change-me";
  }
  return secret;
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication required. Please sign in." });
  }

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Session expired or invalid token. Please sign in again." });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const token = header.split(" ")[1];
    try {
      const decoded = jwt.verify(token, getJwtSecret());
      req.userId = decoded.id;
    } catch {
      req.userId = null;
    }
  } else {
    req.userId = null;
  }
  next();
}

auth.auth = auth;
auth.optionalAuth = optionalAuth;
auth.getJwtSecret = getJwtSecret;

module.exports = auth;
