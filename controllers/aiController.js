const { scanItemWithDeepLearning, verifyTransformationWithDeepLearning, calculateMLForecast } = require("../services/aiVisionService");
const { isMongoConnected } = require("../config/db");
const { User, Activity } = require("../models");
const { store } = require("../config/store");

async function scanItem(req, res) {
  try {
    let imageInput = req.body?.image;
    if (req.file) {
      imageInput = "/uploads/" + req.file.filename;
    }
    if (!imageInput) {
      return res.status(400).json({ success: false, message: "Please provide an image (file or base64) to scan" });
    }

    const result = await scanItemWithDeepLearning(imageInput);
    res.json(result);
  } catch (err) {
    console.error("AI Scan Error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to analyze image with AI model" });
  }
}

async function verifyActivityAI(req, res) {
  try {
    let beforeImage = req.body?.beforeImage;
    let afterImage = req.body?.afterImage;
    if (req.files?.beforeImage?.[0]) {
      beforeImage = "/uploads/" + req.files.beforeImage[0].filename;
    }
    if (req.files?.afterImage?.[0]) {
      afterImage = "/uploads/" + req.files.afterImage[0].filename;
    }
    const { category, description } = req.body || {};
    if (!beforeImage || !afterImage) {
      return res.status(400).json({ success: false, message: "Before and After images are required" });
    }
    const result = await verifyTransformationWithDeepLearning(beforeImage, afterImage, category, description);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("AI Verification Error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to verify transformation with AI" });
  }
}

async function getMLForecast(req, res) {
  try {
    const userId = req.userId;

    if (isMongoConnected()) {
      const [u, userActsCount] = await Promise.all([
        User.findById(userId).lean(),
        Activity.countDocuments({ user: String(userId), hidden: { $ne: true } })
      ]);

      const forecast = calculateMLForecast({
        activitiesCount: userActsCount || u?.verifiedActivities || 0,
        currentPoints: u?.points || 0,
        treesCount: u?.impact?.trees || 0,
        wasteKg: u?.impact?.wasteKg || 0
      });

      return res.json({ success: true, data: forecast });
    } else {
      const u = store.users.find(x => String(x._id) === String(userId));
      const userActs = store.activities.filter(a => {
        const actUserId = typeof a.user === "object" && a.user !== null ? String(a.user._id || "") : String(a.user || "");
        return actUserId === String(userId);
      });

      const forecast = calculateMLForecast({
        activitiesCount: userActs.length || u?.verifiedActivities || 0,
        currentPoints: u?.points || 0,
        treesCount: u?.impact?.trees || 0,
        wasteKg: u?.impact?.wasteKg || 0
      });

      return res.json({ success: true, data: forecast });
    }
  } catch (err) {
    console.error("ML Forecast Error:", err);
    res.status(500).json({ success: false, message: "Failed to generate ML forecast" });
  }
}

module.exports = {
  scanItem,
  verifyActivityAI,
  getMLForecast
};
