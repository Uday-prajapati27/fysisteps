const { randomUUID } = require("crypto");
const { Organization, Reward } = require("../models");

function authorized(req) {
  const key = process.env.ADMIN_API_KEY;
  return !!key && req.get("x-admin-key") === key;
}

function guard(req, res) {
  if (!authorized(req)) {
    res.status(401).json({ success: false, message: "Admin authorization required." });
    return false;
  }
  return true;
}

async function createOrganization(req, res) {
  if (!guard(req, res)) return;
  try {
    const { name, description, icon = "🌿", website = "", location = "", type = "Organization" } = req.body || {};
    if (!name || !description) {
      return res.status(400).json({ success: false, message: "name and description are required" });
    }

    const org = await Organization.create({
      _id: randomUUID(),
      name: String(name).trim(),
      description: String(description).trim(),
      icon,
      website,
      location,
      type,
      members: 0,
      isDemo: false
    });
    return res.status(201).json({ success: true, data: org.toObject() });
  } catch (err) {
    console.error("createOrganization error:", err);
    res.status(500).json({ success: false, message: "Failed to create organization" });
  }
}

async function createReward(req, res) {
  if (!guard(req, res)) return;
  try {
    const { title, description, cost, icon = "🎁", partnerName = "", partnerWebsite = "", terms = "", expiresAt = null } = req.body || {};
    if (!title || !description || cost === undefined || !partnerName) {
      return res.status(400).json({ success: false, message: "title, description, cost and partnerName are required" });
    }
    const numericCost = Number(cost);
    if (!Number.isFinite(numericCost) || numericCost < 1) {
      return res.status(400).json({ success: false, message: "cost must be a positive number" });
    }

    const reward = await Reward.create({
      _id: randomUUID(),
      title: String(title).trim(),
      description: String(description).trim(),
      cost: numericCost,
      icon,
      partnerName,
      partnerWebsite,
      terms,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      codePrefix: "GREEN",
      isDemo: false
    });
    return res.status(201).json({ success: true, data: reward.toObject() });
  } catch (err) {
    console.error("createReward error:", err);
    res.status(500).json({ success: false, message: "Failed to create reward" });
  }
}

async function deleteOrganization(req, res) {
  if (!guard(req, res)) return;
  try {
    const orgId = req.params.id;
    const deleted = await Organization.findByIdAndDelete(orgId);
    if (!deleted) return res.status(404).json({ success: false, message: "Organization not found" });
    return res.json({ success: true, message: "Organization removed" });
  } catch (err) {
    console.error("deleteOrganization error:", err);
    res.status(500).json({ success: false, message: "Failed to delete organization" });
  }
}

async function deleteReward(req, res) {
  if (!guard(req, res)) return;
  try {
    const rewardId = req.params.id;
    const deleted = await Reward.findByIdAndDelete(rewardId);
    if (!deleted) return res.status(404).json({ success: false, message: "Reward not found" });
    return res.json({ success: true, message: "Reward removed" });
  } catch (err) {
    console.error("deleteReward error:", err);
    res.status(500).json({ success: false, message: "Failed to delete reward" });
  }
}

module.exports = {
  createOrganization,
  createReward,
  deleteOrganization,
  deleteReward
};
