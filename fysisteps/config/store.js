const fs = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, 'data.json');
const store = { users: [], activities: [], rewards: [], events: [], organizations: [], redemptions: [], orders: [], useMongo: false };
function reviveDates(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const k of ['createdAt', 'submittedAt', 'redeemedAt', 'orderedAt']) if (obj[k] && typeof obj[k] === 'string') obj[k] = new Date(obj[k]);
  return obj;
}
function saveStore() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const content = JSON.stringify({
      users: store.users || [],
      activities: store.activities || [],
      events: store.events || [],
      rewards: store.rewards || [],
      organizations: store.organizations || [],
      redemptions: store.redemptions || [],
      orders: store.orders || []
    }, null, 2);
    fs.writeFileSync(DATA_FILE, content, 'utf8');
  } catch (err) {
    console.error('Failed to save store:', err.message);
  }
}
function loadStore() {
  if (!fs.existsSync(DATA_FILE)) return false;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8').trim();
    if (!raw) return false;
    const data = JSON.parse(raw);
    for (const key of ['users', 'activities', 'events', 'rewards', 'organizations', 'redemptions', 'orders']) {
      store[key] = Array.isArray(data[key]) ? data[key].map(reviveDates) : [];
    }
    return true;
  } catch (err) {
    console.warn('Could not load local database; starting fresh.', err.message);
    return false;
  }
}
loadStore();
async function seedMemory() {
  loadStore();
  if (!fs.existsSync(DATA_FILE)) saveStore();
}
module.exports = { store, seedMemory, saveStore };

