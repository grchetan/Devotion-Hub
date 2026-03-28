const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User');
const { ACHIEVEMENTS } = require('./models/User');
const Admin = require('./models/Admin');
const Activity = require('./models/Activity');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/radha_leaderboard';
const JWT_SECRET = process.env.JWT_SECRET || 'please-change-this-jwt-secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const SUBMISSION_DELAY_MS = 700;
const BAN_MS = 24 * 60 * 60 * 1000;
const AUTH_USERS_FILE = path.join(__dirname, 'server', 'users.json');

const abusiveWords = new Set([
  'abuse',
  'badword',
  'idiot',
  'stupid',
  'hate',
  'damn',
  'nonsense',
]);

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again shortly.' },
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication requests.' },
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts.' },
});

function cleanUsername(v) {
  return typeof v === 'string'
    ? v.trim().replace(/\s+/g, ' ').slice(0, 24)
    : '';
}
function cleanWord(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function validSessionId(v) {
  return typeof v === 'string' && v.length >= 12 && v.length <= 128;
}
function cleanEmail(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}
function isBanned(user) {
  return Boolean(
    user.banStatus?.isBanned &&
    user.banStatus?.bannedUntil &&
    user.banStatus.bannedUntil.getTime() > Date.now(),
  );
}
function parseBearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

function authAdmin(req, res, next) {
  const token = parseBearer(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden' });
    req.admin = payload;
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authUser(req, res, next) {
  const token = parseBearer(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'user')
      return res.status(403).json({ error: 'Forbidden' });
    req.user = payload;
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function logActivity(username, action, details = '') {
  await Activity.create({ username, action, details });
}

async function ensureAuthUserStore() {
  await fs.mkdir(path.dirname(AUTH_USERS_FILE), { recursive: true });
  try {
    await fs.access(AUTH_USERS_FILE);
  } catch (_) {
    await fs.writeFile(AUTH_USERS_FILE, '[]', 'utf8');
  }
}

async function readAuthUsers() {
  await ensureAuthUserStore();
  const content = await fs.readFile(AUTH_USERS_FILE, 'utf8');
  const parsed = JSON.parse(content || '[]');
  return Array.isArray(parsed) ? parsed : [];
}

async function writeAuthUsers(users) {
  await fs.writeFile(AUTH_USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

async function ensureAdminSeeded() {
  const found = await Admin.findOne({ username: ADMIN_USERNAME });
  if (found) return;
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await Admin.create({ username: ADMIN_USERNAME, passwordHash });
  console.log(`Seeded admin user: ${ADMIN_USERNAME}`);
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────

app.post('/api/signup', authLimiter, async (req, res) => {
  try {
    const username = cleanUsername(req.body.username);
    const email = cleanEmail(req.body.email);
    const password =
      typeof req.body.password === 'string' ? req.body.password : '';
    const confirmPassword =
      typeof req.body.confirmPassword === 'string'
        ? req.body.confirmPassword
        : '';

    if (!username || !email || !password || !confirmPassword)
      return res.status(400).json({ error: 'All fields are required.' });
    if (username.length < 2)
      return res.status(400).json({ error: 'Username is required.' });
    if (password.length < 6)
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters.' });
    if (password !== confirmPassword)
      return res.status(400).json({ error: 'Passwords do not match.' });
    if (!/^\S+@\S+\.\S+$/.test(email))
      return res.status(400).json({ error: 'Please enter a valid email.' });

    const users = await readAuthUsers();
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
      return res.status(409).json({ error: 'Username already exists.' });
    if (users.some((u) => u.email === email))
      return res.status(409).json({ error: 'Email already exists.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const authUser = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      username,
      email,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    users.push(authUser);
    await writeAuthUsers(users);

    return res.json({
      success: true,
      message: 'Signup successful. Please login.',
    });
  } catch (_) {
    return res.status(500).json({ error: 'Signup failed.' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const identifier =
      typeof req.body.identifier === 'string' ? req.body.identifier.trim() : '';
    const password =
      typeof req.body.password === 'string' ? req.body.password : '';
    if (!identifier || !password)
      return res
        .status(400)
        .json({ error: 'Email/username and password are required.' });

    const users = await readAuthUsers();
    const lower = identifier.toLowerCase();
    const account = users.find(
      (u) => u.email === lower || u.username.toLowerCase() === lower,
    );
    if (!account)
      return res.status(401).json({ error: 'Invalid credentials.' });

    const ok = await bcrypt.compare(password, account.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      {
        role: 'user',
        id: account.id,
        username: account.username,
        email: account.email,
      },
      JWT_SECRET,
      { expiresIn: '7d' },
    );
    return res.json({
      success: true,
      token,
      user: {
        id: account.id,
        username: account.username,
        email: account.email,
      },
    });
  } catch (_) {
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/auth/me', authUser, (req, res) => {
  return res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
    },
  });
});

// ─── Session Routes ───────────────────────────────────────────────────────────

app.post('/api/session/start', async (req, res) => {
  try {
    const sessionId = (req.body.sessionId || '').trim();
    const username = cleanUsername(req.body.username);

    if (!validSessionId(sessionId) || username.length < 2)
      return res.status(400).json({ error: 'Invalid session or username.' });

    let user = await User.findOne({ sessionId });
    if (!user) {
      user = await User.create({ sessionId, username });
    } else if (user.username !== username) {
      return res
        .status(400)
        .json({ error: 'This session already belongs to another user.' });
    }

    if (isBanned(user))
      return res.status(403).json({
        error: 'You are temporarily banned for abusive activity.',
        bannedUntil: user.banStatus.bannedUntil,
      });

    // Reset daily count if new day
    const todayStr = new Date().toISOString().slice(0, 10);
    if (user.dailyResetDate !== todayStr) {
      user.dailyCount = 0;
      user.dailyResetDate = todayStr;
      await user.save();
    }

    return res.json({
      username: user.username,
      radhaCount: user.radhaCount,
      warnings: user.warnings,
      banned: false,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      achievements: user.achievements,
      dailyGoal: user.dailyGoal,
      dailyCount: user.dailyCount,
    });
  } catch (_) {
    return res.status(500).json({ error: 'Unable to start session.' });
  }
});

app.post('/api/submit', async (req, res) => {
  try {
    const sessionId = (req.body.sessionId || '').trim();
    const username = cleanUsername(req.body.username);
    const word = cleanWord(req.body.word);

    if (!validSessionId(sessionId) || username.length < 2)
      return res.status(400).json({ error: 'Invalid session or username.' });

    const user = await User.findOne({ sessionId });
    if (!user || user.username !== username)
      return res.status(401).json({ error: 'Session not found. Start again.' });
    if (isBanned(user))
      return res.status(403).json({
        error: 'You are banned for 24 hours due to abusive words.',
        bannedUntil: user.banStatus.bannedUntil,
      });

    const now = Date.now();
    if (
      user.lastSubmissionAt &&
      now - user.lastSubmissionAt.getTime() < SUBMISSION_DELAY_MS
    ) {
      await logActivity(
        user.username,
        'suspicious speed',
        'Submission too fast',
      );
      return res
        .status(429)
        .json({ error: 'You are typing too fast. Please slow down.' });
    }

    user.totalSubmissions += 1;
    user.lastSubmissionAt = new Date();
    user.lastActivity = new Date();

    if (!word || word.includes(' ') || word.length > 16) {
      await user.save();
      return res
        .status(400)
        .json({ error: 'Only one word is allowed per submission.' });
    }

    if (abusiveWords.has(word.toLowerCase())) {
      user.warnings += 1;
      user.abusiveAttempts += 1;
      await logActivity(
        user.username,
        'abusive word',
        `Warnings: ${user.warnings}`,
      );
      if (user.warnings >= 3) {
        user.banStatus.isBanned = true;
        user.banStatus.bannedUntil = new Date(Date.now() + BAN_MS);
        await logActivity(user.username, 'banned', 'Reached 3 warnings');
      }
      await user.save();
      return res.status(403).json({
        error: 'Warning: Abusive words are not allowed.',
        warnings: user.warnings,
        banned: user.banStatus.isBanned,
        bannedUntil: user.banStatus.bannedUntil,
      });
    }

    if (word !== 'Radha') {
      await user.save();
      return res.status(400).json({ error: 'Only exact word "Radha" counts.' });
    }

    user.radhaCount += 1;

    // Update streak
    user.updateStreak();

    // Update daily count
    user.updateDailyCount();

    // Check achievements
    const newlyUnlocked = user.checkAchievements();

    await user.save();
    await logActivity(user.username, 'typed Radha', `Total ${user.radhaCount}`);

    const dailyGoalReached = user.dailyCount === user.dailyGoal;

    return res.json({
      ok: true,
      radhaCount: user.radhaCount,
      warnings: user.warnings,
      milestone: user.radhaCount % 50 === 0,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      dailyCount: user.dailyCount,
      dailyGoal: user.dailyGoal,
      dailyGoalReached,
      newAchievements: newlyUnlocked
        .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
        .filter(Boolean),
    });
  } catch (_) {
    return res.status(500).json({ error: 'Submission failed.' });
  }
});

// ─── Daily Goal Update ────────────────────────────────────────────────────────

app.post('/api/daily-goal', async (req, res) => {
  try {
    const sessionId = (req.body.sessionId || '').trim();
    const goal = Number(req.body.goal);
    if (!validSessionId(sessionId))
      return res.status(400).json({ error: 'Invalid session.' });
    if (!Number.isInteger(goal) || goal < 1 || goal > 9999)
      return res
        .status(400)
        .json({ error: 'Goal must be between 1 and 9999.' });

    const user = await User.findOne({ sessionId });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.dailyGoal = goal;
    await user.save();
    return res.json({ ok: true, dailyGoal: user.dailyGoal });
  } catch (_) {
    return res.status(500).json({ error: 'Failed to update goal.' });
  }
});

// ─── Leaderboard ──────────────────────────────────────────────────────────────

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const users = await User.find(
      {},
      { username: 1, radhaCount: 1, currentStreak: 1, achievements: 1 },
    )
      .sort({ radhaCount: -1, username: 1 })
      .limit(100)
      .lean();

    const leaderboard = users.map((item, index) => ({
      rank: index + 1,
      username: item.username,
      radhaCount: item.radhaCount,
      currentStreak: item.currentStreak || 0,
      badgeCount: (item.achievements || []).length,
    }));

    return res.json({ leaderboard });
  } catch (_) {
    return res.status(500).json({ error: 'Could not load leaderboard.' });
  }
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────

app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  try {
    const username = cleanUsername(req.body.username);
    const password =
      typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || !password)
      return res.status(401).json({ error: 'Invalid username or password.' });

    const admin = await Admin.findOne({ username });
    if (!admin)
      return res.status(401).json({ error: 'Invalid username or password.' });

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid)
      return res.status(401).json({ error: 'Invalid username or password.' });

    const token = jwt.sign(
      { username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '12h' },
    );
    return res.json({ token, username: admin.username });
  } catch (_) {
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/admin/dashboard', authAdmin, async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [
      totalUsers,
      activeUsers,
      totals,
      bannedUsers,
      recentActivities,
      leaderboard,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActivity: { $gte: today } }),
      User.aggregate([
        {
          $group: {
            _id: null,
            radha: { $sum: '$radhaCount' },
            submissions: { $sum: '$totalSubmissions' },
          },
        },
      ]),
      User.countDocuments({
        'banStatus.isBanned': true,
        'banStatus.bannedUntil': { $gt: new Date() },
      }),
      Activity.find().sort({ createdAt: -1 }).limit(30).lean(),
      User.find({}, { username: 1, radhaCount: 1 })
        .sort({ radhaCount: -1, username: 1 })
        .limit(20)
        .lean(),
    ]);

    return res.json({
      stats: {
        totalUsers,
        activeUsers,
        totalRadhaCount: totals[0]?.radha || 0,
        bannedUsers,
        totalSubmissions: totals[0]?.submissions || 0,
      },
      activities: recentActivities,
      leaderboard: leaderboard.map((u, i) => ({
        rank: i + 1,
        username: u.username,
        radhaCount: u.radhaCount,
      })),
    });
  } catch (_) {
    return res.status(500).json({ error: 'Failed to load dashboard.' });
  }
});

app.get('/api/admin/users', authAdmin, async (_req, res) => {
  try {
    const users = await User.find()
      .sort({ radhaCount: -1, username: 1 })
      .lean();
    return res.json({ users });
  } catch (_) {
    return res.status(500).json({ error: 'Failed to load users.' });
  }
});

app.post('/api/admin/ban', authAdmin, async (req, res) => {
  const sessionId = (req.body.sessionId || '').trim();
  if (!validSessionId(sessionId))
    return res.status(400).json({ error: 'Invalid sessionId.' });
  const user = await User.findOne({ sessionId });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.banStatus.isBanned = true;
  user.banStatus.bannedUntil = new Date(Date.now() + BAN_MS);
  await user.save();
  await logActivity(user.username, 'banned', 'Admin banned user');
  return res.json({ ok: true });
});

app.post('/api/admin/unban', authAdmin, async (req, res) => {
  const sessionId = (req.body.sessionId || '').trim();
  if (!validSessionId(sessionId))
    return res.status(400).json({ error: 'Invalid sessionId.' });
  const user = await User.findOne({ sessionId });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.banStatus.isBanned = false;
  user.banStatus.bannedUntil = null;
  await user.save();
  await logActivity(user.username, 'unbanned', 'Admin unbanned user');
  return res.json({ ok: true });
});

app.post('/api/admin/reset-leaderboard', authAdmin, async (_req, res) => {
  await User.updateMany(
    {},
    {
      $set: {
        radhaCount: 0,
        totalSubmissions: 0,
        dailyCount: 0,
        lastActivity: new Date(),
      },
    },
  );
  await logActivity('system', 'leaderboard reset', 'Admin reset leaderboard');
  return res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await ensureAuthUserStore();
  await mongoose.connect(MONGO_URI);
  await ensureAdminSeeded();
  app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`),
  );
}

start().catch((error) => {
  console.error('Startup failed:', error.message);
  process.exit(1);
});
