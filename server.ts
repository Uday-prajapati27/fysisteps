import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

// Database connection & status
const { connectDB, isMongoConnected } = require("./config/db");

// Backend controllers & middleware
const auth = require("./middleware/auth");
const { optionalAuth } = require("./middleware/auth");
const authController = require("./controllers/authController");
const activityRoutes = require("./routes/activityRoutes");
const platformController = require("./controllers/platformController");
const userController = require("./controllers/userController");
const adminController = require("./controllers/adminController");
const aiController = require("./controllers/aiController");

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Establish database connection before starting services
  console.log("[FysiSteps] Initializing database layer...");
  const mongoConnected = await connectDB();

  if (mongoConnected && isMongoConnected()) {
    console.log("✓ [FysiSteps] MongoDB Atlas connected. Operating in persistent database mode.");
  } else {
    if (process.env.NODE_ENV === "production" && process.env.MONGODB_URI) {
      console.error("FATAL: MongoDB connection failed in production with MONGODB_URI set.");
    } else {
      console.warn("ℹ [FysiSteps] MongoDB is not active. Operating with local development fallback storage.");
      console.warn("  Set MONGODB_URI in your environment to enable persistent MongoDB Atlas storage.");
    }
  }

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Body parsers
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Static uploads directory for activity proof photos & videos
  app.use("/uploads", express.static(uploadsDir));

  // ── API ROUTES ──────────────────────────────────────────
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      service: "FysiSteps API",
      database: isMongoConnected() ? "mongodb" : "local_fallback",
      environment: process.env.NODE_ENV || "development"
    });
  });

  // Auth Routes
  app.post("/api/auth/register", authController.register);
  app.post("/api/auth/login", authController.login);
  app.post("/api/auth/guest", authController.guest);
  app.get("/api/auth/me", auth, authController.me);
  app.get("/api/auth/check-username", authController.checkUsername);
  app.post("/api/auth/send-email-otp", auth, authController.sendEmailOtp);
  app.post("/api/auth/verify-email-otp", auth, authController.verifyEmailOtp);
  app.post("/api/auth/send-phone-otp", auth, authController.sendPhoneOtp);
  app.post("/api/auth/verify-phone-otp", auth, authController.verifyPhoneOtp);

  // Activity Routes
  app.use("/api/activities", optionalAuth, activityRoutes);

  // Platform & Stats Routes
  app.get("/api/platform/stats", platformController.stats);
  app.get("/api/leaderboard", platformController.leaderboard);
  app.get("/api/rewards", platformController.rewards);
  app.post("/api/rewards/redeem/:id", auth, platformController.redeem);
  app.get("/api/rewards/my", auth, platformController.myRedemptions);
  app.get("/api/organizations", platformController.organizations);
  app.post("/api/organizations/:id/join", auth, platformController.joinOrganization);
  app.get("/api/dashboard", auth, platformController.dashboard);
  app.get("/api/products", platformController.products);
  if (platformController.checkout) {
    app.post("/api/checkout", auth, platformController.checkout);
  }
  if (platformController.myOrders) {
    app.get("/api/orders/my", auth, platformController.myOrders);
  }
  if (platformController.events) {
    app.get("/api/events", platformController.events);
  }

  // Admin Routes
  app.post("/api/admin/organizations", adminController.createOrganization);
  app.delete("/api/admin/organizations/:id", adminController.deleteOrganization);
  app.post("/api/admin/rewards", adminController.createReward);
  app.delete("/api/admin/rewards/:id", adminController.deleteReward);

  // Users Routes
  app.put("/api/users/me", auth, userController.updateMe);
  app.get("/api/users/search", optionalAuth, userController.searchUsersAndActivities);
  app.get("/api/users/me/blocked", optionalAuth, userController.getBlockedUsers);
  app.post("/api/users/:id/block", optionalAuth, userController.blockUser);
  app.post("/api/users/:id/unblock", optionalAuth, userController.unblockUser);
  app.get("/api/users/:idOrUsername", optionalAuth, userController.getUserProfile);

  // AI & Scanning Routes
  app.post("/api/ai/scan", aiController.scanItem);
  app.post("/api/ai/verify", aiController.verifyActivityAI);
  app.get("/api/ai/forecast", auth, aiController.getMLForecast);

  // Vite middleware for development vs static production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FysiSteps Server running on http://localhost:${PORT}`);
  });
}

startServer();
