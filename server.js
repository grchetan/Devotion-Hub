const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MONGO_URI = process.env.MONGO_URI;
const RESET_KEY = process.env.RESET_KEY || 'radha-reset-key';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-super-secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

const abusiveWords = new Set(['abuse', 'badword', 'idiot', 'stupid', 'hate', 'damn', 'nonsense']);
const SUBMIT_DELAY_MS = 700;
const BAN_DURATION_MS = 24 * 60 * 60 * 1000;

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  '/api/',
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again shortly.' },
  })
);

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait and try again.' },
});

const userSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true, trim: true },
  radha_count: { type: Number, default: 0 },
  warnings: { type: Number, default: 0 },
  total_submissions: { type: Number, default: 0 },
  abusive_attempts: { type: Number, default: 0 },
  ban_status: {
    isBanned: { type: Boolean, default: false },
    banUntil: { type: Date, default: null },
  },
  last_activity: { type: Date, default: Date.now },
  lastSubmissionAt: { type: Date, default: null },
});

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  password_hash: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
});

const activitySchema = new mongoose.Schema({
  username: { type: String, required: true },
  action: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  meta: { type: Object, default: {} },
});

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
const AdminModel = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
const ActivityModel = mongoose.models.Activity || mongoose.model('Activity', activitySchema);

class MemoryStore {
  constructor() {
    this.users = new Map();
    this.admins = new Map();
    this.activities = [];
  }

  async findUserBySession(sessionId) {
    return this.users.get(sessionId) || null;
  }

  async createUser({ sessionId, username }) {
    const user = {
      sessionId,
      username,
      radha_count: 0,
      warnings: 0,
      total_submissions: 0,
      abusive_attempts: 0,
      ban_status: { isBanned: false, banUntil: null },
      last_activity: new Date(),
      lastSubmissionAt: null,
    };
    this.users.set(sessionId, user);
    return user;
  }

  async saveUser(user) {
    this.users.set(user.sessionId, user);
    return user;
  }

  async listUsers() {
    return [...this.users.values()].sort((a, b) => b.radha_count - a.radha_count);
  }

  async topUsers() {
    return (await this.listUsers()).slice(0, 50);
  }

  async resetDaily() {
    for (const user of this.users.values()) {
      user.radha_count = 0;
      user.total_submissions = 0;
      user.last_activity = new Date();
    }
  }

  async findAdminByUsername(username) {
    return this.admins.get(username) || null;
  }

  async saveAdmin(admin) {
    this.admins.set(admin.username, admin);
    return admin;
  }

  async logActivity(entry) {
    this.activities.unshift(entry);
    this.activities = this.activities.slice(0, 400);
  }

  async getActivity(limit = 50) {
    return this.activities.slice(0, limit);
  }
}

const memoryStore = new MemoryStore();
let dbEnabled = false;

function sanitizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, 24);
}

function isBanned(user) {
  return Boolean(user?.ban_status?.isBanned && user?.ban_status?.banUntil && new Date(user.ban_status.banUntil).getTime() > Date.now());
}

function validateSessionAndUsername(sessionId, username) {
  return typeof sessionId === 'string' && sessionId.length >= 10 && typeof username === 'string' && username.length >= 2;
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Unauthorized.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

async function initializeDatabase() {
  if (!MONGO_URI) {
    console.warn('MONGO_URI not configured. Using in-memory storage.');
    return;
  }
  try {
    await mongoose.connect(MONGO_URI);
    dbEnabled = true;
    console.log('Connected to MongoDB.');
  } catch (error) {
    console.warn('MongoDB connection failed, using in-memory storage.', error.message);
  }
}

async function seedAdmin() {
  const hash = ADMIN_PASSWORD_HASH || (await bcrypt.hash(ADMIN_PASSWORD, 10));
  if (dbEnabled) {
    const existing = await AdminModel.findOne({ username: ADMIN_USERNAME });
    if (!existing) {
      await AdminModel.create({ username: ADMIN_USERNAME, password_hash: hash });
      console.log(`Seeded admin user: ${ADMIN_USERNAME}`);
    }
  } else {
    const existing = await memoryStore.findAdminByUsername(ADMIN_USERNAME);
    if (!existing) {
      await memoryStore.saveAdmin({ username: ADMIN_USERNAME, password_hash: hash, created_at: new Date() });
    }
  }
}

async function getUser(sessionId) {
  return dbEnabled ? UserModel.findOne({ sessionId }) : memoryStore.findUserBySession(sessionId);
}

async function persistUser(user) {
  if (dbEnabled) return user.save();
  return memoryStore.saveUser(user);
}

async function createUser(sessionId, username) {
  if (dbEnabled) return UserModel.create({ sessionId, username });
  return memoryStore.createUser({ sessionId, username });
}

async function getAllUsers() {
  if (dbEnabled) return UserModel.find().sort({ radha_count: -1 }).lean();
  return memoryStore.listUsers();
}

async function logActivity(username, action, meta = {}) {
  const entry = { username, action, timestamp: new Date(), meta };
  if (dbEnabled) {
    await ActivityModel.create(entry);
    return;
  }
  await memoryStore.logActivity(entry);
}

async function getActivities(limit = 50) {
  if (dbEnabled) return ActivityModel.find().sort({ timestamp: -1 }).limit(limit).lean();
  return memoryStore.getActivity(limit);
}

async function findAdminByUsername(username) {
  return dbEnabled ? AdminModel.findOne({ username }) : memoryStore.findAdminByUsername(username);
}

app.post('/api/session/start', async (req, res) => {
  try {
    const sessionId = (req.body.sessionId || '').trim();
    const username = sanitizeUsername(req.body.username);
    if (!validateSessionAndUsername(sessionId, username)) return res.status(400).json({ error: 'Invalid session or username.' });

    let user = await getUser(sessionId);
    if (!user) user = await createUser(sessionId, username);
    else if (user.username !== username) return res.status(400).json({ error: 'Session already tied to a different username.' });

    if (isBanned(user)) {
      return res.status(403).json({ error: 'Temporarily banned for abusive language.', banUntil: user.ban_status.banUntil });
    }

    return res.json({ username: user.username, radha_count: user.radha_count, warnings: user.warnings, ban_status: user.ban_status });
  } catch (_error) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/submit', async (req, res) => {
  try {
    const sessionId = (req.body.sessionId || '').trim();
    const username = sanitizeUsername(req.body.username);
    const word = (req.body.word || '').trim();
    if (!validateSessionAndUsername(sessionId, username)) return res.status(400).json({ error: 'Invalid session or username.' });

    const user = await getUser(sessionId);
    if (!user || user.username !== username) return res.status(401).json({ error: 'Session not found. Start again.' });
    if (isBanned(user)) return res.status(403).json({ error: 'You are banned for 24 hours due to repeated abusive words.', banUntil: user.ban_status.banUntil });

    const now = Date.now();
    if (user.lastSubmissionAt && now - new Date(user.lastSubmissionAt).getTime() < SUBMIT_DELAY_MS) {
      await logActivity(user.username, 'suspicious-speed', { delay: now - new Date(user.lastSubmissionAt).getTime() });
      return res.status(429).json({ error: 'Too fast. Please type naturally.' });
    }

    user.lastSubmissionAt = new Date();
    user.last_activity = new Date();
    user.total_submissions += 1;

    if (!word || word.includes(' ') || word.length > 16) {
      await persistUser(user);
      return res.status(400).json({ error: 'Only one word is allowed per submission.' });
    }

    if (abusiveWords.has(word.toLowerCase())) {
      user.warnings += 1;
      user.abusive_attempts += 1;
      if (user.warnings >= 3) {
        user.ban_status = { isBanned: true, banUntil: new Date(Date.now() + BAN_DURATION_MS) };
        await logActivity(user.username, 'banned', { reason: 'abusive-words' });
      }
      await persistUser(user);
      await logActivity(user.username, 'abusive-word', { warnings: user.warnings });
      return res.status(403).json({ error: 'Warning: Abusive words are not allowed.', warnings: user.warnings, banned: user.ban_status.isBanned, banUntil: user.ban_status.banUntil });
    }

    if (word === 'Radha') {
      user.radha_count += 1;
      await persistUser(user);
      await logActivity(user.username, 'typed-radha', { radha_count: user.radha_count });
      if (user.radha_count > 0 && user.radha_count % 100 === 0) {
        await logActivity(user.username, 'milestone', { radha_count: user.radha_count });
      }
      return res.json({ success: true, radha_count: user.radha_count, warnings: user.warnings, milestone: user.radha_count % 50 === 0 });
    }

    await persistUser(user);
    return res.status(400).json({ error: 'Only exact word "Radha" counts.' });
  } catch (_error) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const users = dbEnabled ? await UserModel.find().sort({ radha_count: -1, last_activity: 1 }).limit(50).lean() : await memoryStore.topUsers();
    const leaderboard = users.map((u, index) => ({ rank: index + 1, username: u.username, radha_count: u.radha_count }));
    return res.json({ leaderboard, updatedAt: new Date() });
  } catch (_error) {
    return res.status(500).json({ error: 'Unable to load leaderboard.' });
  }
});

app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  try {
    const username = sanitizeUsername(req.body.username);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'Invalid username or password.' });

    const admin = await findAdminByUsername(username);
    if (!admin) return res.status(401).json({ error: 'Invalid username or password.' });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });

    const token = jwt.sign({ username: admin.username, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token, username: admin.username });
  } catch (_error) {
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/admin/dashboard', requireAdminAuth, async (_req, res) => {
  try {
    const users = await getAllUsers();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalUsers = users.length;
    const activeToday = users.filter((u) => new Date(u.last_activity) >= today).length;
    const totalRadha = users.reduce((sum, u) => sum + (u.radha_count || 0), 0);
    const bannedUsers = users.filter((u) => isBanned(u)).length;
    const totalSubmissions = users.reduce((sum, u) => sum + (u.total_submissions || 0), 0);

    return res.json({ totalUsers, activeToday, totalRadha, bannedUsers, totalSubmissions });
  } catch (_error) {
    return res.status(500).json({ error: 'Unable to load dashboard.' });
  }
});

app.get('/api/admin/activity', requireAdminAuth, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const activity = await getActivities(limit);
  return res.json({ activity });
});

app.get('/api/admin/users', requireAdminAuth, async (_req, res) => {
  const users = await getAllUsers();
  return res.json({ users });
});

app.get('/api/admin/leaderboard', requireAdminAuth, async (_req, res) => {
  const users = await getAllUsers();
  const leaderboard = users
    .sort((a, b) => b.radha_count - a.radha_count)
    .map((u, i) => ({ rank: i + 1, username: u.username, radha_count: u.radha_count }));
  return res.json({ leaderboard });
});

app.get('/api/admin/abuse-monitor', requireAdminAuth, async (_req, res) => {
  const users = await getAllUsers();
  const flaggedUsers = users
    .filter((u) => (u.warnings || 0) > 0 || (u.abusive_attempts || 0) > 0)
    .map((u) => ({ username: u.username, warnings: u.warnings || 0, abusive_attempts: u.abusive_attempts || 0, isBanned: isBanned(u) }));
  const suspiciousActivity = (await getActivities(80)).filter((x) => x.action === 'suspicious-speed' || x.action === 'abusive-word');
  return res.json({ flaggedUsers, suspiciousActivity });
});

app.post('/api/admin/ban', requireAdminAuth, async (req, res) => {
  const sessionId = (req.body.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'sessionId required.' });
  const user = await getUser(sessionId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.ban_status = { isBanned: true, banUntil: new Date(Date.now() + BAN_DURATION_MS) };
  await persistUser(user);
  await logActivity(user.username, 'banned', { reason: 'admin-action' });
  return res.json({ success: true });
});

app.post('/api/admin/unban', requireAdminAuth, async (req, res) => {
  const sessionId = (req.body.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'sessionId required.' });
  const user = await getUser(sessionId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.ban_status = { isBanned: false, banUntil: null };
  await persistUser(user);
  await logActivity(user.username, 'unbanned', { reason: 'admin-action' });
  return res.json({ success: true });
});

app.post('/api/admin/reset-user', requireAdminAuth, async (req, res) => {
  const sessionId = (req.body.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'sessionId required.' });
  const user = await getUser(sessionId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.radha_count = 0;
  user.total_submissions = 0;
  await persistUser(user);
  await logActivity(user.username, 'reset-user-count', { reason: 'admin-action' });
  return res.json({ success: true });
});

app.delete('/api/admin/delete-user', requireAdminAuth, async (req, res) => {
  const sessionId = (req.body.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'sessionId required.' });

  if (dbEnabled) {
    const user = await UserModel.findOne({ sessionId });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    await UserModel.deleteOne({ sessionId });
    await logActivity(user.username, 'deleted-user', { reason: 'admin-action' });
  } else {
    const user = await memoryStore.findUserBySession(sessionId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    memoryStore.users.delete(sessionId);
    await logActivity(user.username, 'deleted-user', { reason: 'admin-action' });
  }

  return res.json({ success: true });
});

app.post('/api/admin/reset-leaderboard', requireAdminAuth, async (_req, res) => {
  if (dbEnabled) {
    await UserModel.updateMany({}, { $set: { radha_count: 0, total_submissions: 0, last_activity: new Date() } });
  } else {
    await memoryStore.resetDaily();
  }
  await logActivity('system', 'reset-leaderboard', { source: 'admin' });
  return res.json({ success: true, message: 'Leaderboard reset complete.' });
});

app.post('/api/admin/reset-daily', async (req, res) => {
  try {
    if (req.headers['x-reset-key'] !== RESET_KEY) return res.status(401).json({ error: 'Unauthorized reset request.' });
    if (dbEnabled) {
      await UserModel.updateMany({}, { $set: { radha_count: 0, total_submissions: 0, last_activity: new Date() } });
    } else {
      await memoryStore.resetDaily();
    }
    await logActivity('system', 'reset-daily-key', { source: 'legacy-endpoint' });
    return res.json({ success: true, message: 'Daily leaderboard has been reset.' });
  } catch (_error) {
    return res.status(500).json({ error: 'Reset failed.' });
  }
});

initializeDatabase().then(async () => {
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`Radha Naam Leaderboard running at http://localhost:${PORT}`);
  });
});
