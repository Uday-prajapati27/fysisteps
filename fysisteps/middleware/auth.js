const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "fysisteps-local-secret-change-me";

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication required. Please sign in." });
  }

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
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
      const decoded = jwt.verify(token, JWT_SECRET);
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

module.exports = auth;
