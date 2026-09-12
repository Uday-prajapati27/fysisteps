const { randomUUID } = require("crypto");
const { isMongoConnected } = require("../config/db");
const { Organization, Reward } = require("../models");
const { store, saveStore } = require("../config/store");

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

    if (isMongoConnected()) {
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
    } else {
      const org = {
        _id: randomUUID(),
        name: String(name).trim(),
        description: String(description).trim(),
        icon,
        website,
        location,
        type,
        members: 0,
        impact: {},
        verified: true,
        createdAt: new Date()
      };
      store.organizations.push(org);
      saveStore();
      return res.status(201).json({ success: true, data: org });
    }
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

    if (isMongoConnected()) {
      const reward = await Reward.create({
        _id: randomUUID(),
        title: String(title).trim(),
        description: String(description).trim(),
        cost: numericCost,
        icon,
        partnerName,
        codePrefix: "GREEN",
        isDemo: false
      });
      return res.status(201).json({ success: true, data: reward.toObject() });
    } else {
      const reward = {
        _id: randomUUID(),
        title: String(title).trim(),
        description: String(description).trim(),
        cost: numericCost,
        icon,
        partnerName,
        partnerWebsite,
        terms,
        expiresAt,
        verified: true,
        createdAt: new Date()
      };
      store.rewards.push(reward);
      saveStore();
      return res.status(201).json({ success: true, data: reward });
    }
  } catch (err) {
    console.error("createReward error:", err);
    res.status(500).json({ success: false, message: "Failed to create reward" });
  }
}

async function deleteOrganization(req, res) {
  if (!guard(req, res)) return;
  try {
    const orgId = req.params.id;
    if (isMongoConnected()) {
      const deleted = await Organization.findByIdAndDelete(orgId);
      if (!deleted) return res.status(404).json({ success: false, message: "Organization not found" });
      return res.json({ success: true, message: "Organization removed" });
    } else {
      const before = store.organizations.length;
      store.organizations = store.organizations.filter(x => x._id !== orgId);
      if (store.organizations.length === before) {
        return res.status(404).json({ success: false, message: "Organization not found" });
      }
      saveStore();
      return res.json({ success: true, message: "Organization removed" });
    }
  } catch (err) {
    console.error("deleteOrganization error:", err);
    res.status(500).json({ success: false, message: "Failed to delete organization" });
  }
}

async function deleteReward(req, res) {
  if (!guard(req, res)) return;
  try {
    const rewardId = req.params.id;
    if (isMongoConnected()) {
      const deleted = await Reward.findByIdAndDelete(rewardId);
      if (!deleted) return res.status(404).json({ success: false, message: "Reward not found" });
      return res.json({ success: true, message: "Reward removed" });
    } else {
      const before = store.rewards.length;
      store.rewards = store.rewards.filter(x => x._id !== rewardId);
      if (store.rewards.length === before) {
        return res.status(404).json({ success: false, message: "Reward not found" });
      }
      saveStore();
      return res.json({ success: true, message: "Reward removed" });
    }
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
