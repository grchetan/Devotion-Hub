const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User');
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

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

function cleanUsername(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 24);
}

function cleanWord(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function validSessionId(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}

function isBanned(user) {
  return Boolean(
    user.banStatus?.isBanned &&
    user.banStatus?.bannedUntil &&
    user.banStatus.bannedUntil.getTime() > Date.now(),
  );
}

function authAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function logActivity(username, action, details = '') {
  await Activity.create({ username, action, details });
}

async function ensureAdminSeeded() {
  const found = await Admin.findOne({ username: ADMIN_USERNAME });
  if (found) return;

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await Admin.create({ username: ADMIN_USERNAME, passwordHash });
  console.log(`Seeded admin user: ${ADMIN_USERNAME}`);
}

app.post('/api/session/start', async (req, res) => {
  try {
    const sessionId = (req.body.sessionId || '').trim();
    const username = cleanUsername(req.body.username);

    if (!validSessionId(sessionId) || username.length < 2) {
      return res.status(400).json({ error: 'Invalid session or username.' });
    }

    let user = await User.findOne({ sessionId });

    if (!user) {
      user = await User.create({ sessionId, username });
    } else if (user.username !== username) {
      return res
        .status(400)
        .json({ error: 'This session already belongs to another user.' });
    }

    if (isBanned(user)) {
      return res.status(403).json({
        error: 'You are temporarily banned for abusive activity.',
        bannedUntil: user.banStatus.bannedUntil,
      });
    }

    return res.json({
      username: user.username,
      radhaCount: user.radhaCount,
      warnings: user.warnings,
      banned: false,
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Unable to start session.' });
  }
});

app.post('/api/submit', async (req, res) => {
  try {
    const sessionId = (req.body.sessionId || '').trim();
    const username = cleanUsername(req.body.username);
    const word = cleanWord(req.body.word);

    if (!validSessionId(sessionId) || username.length < 2) {
      return res.status(400).json({ error: 'Invalid session or username.' });
    }

    const user = await User.findOne({ sessionId });

    if (!user || user.username !== username) {
      return res.status(401).json({ error: 'Session not found. Start again.' });
    }

    if (isBanned(user)) {
      return res.status(403).json({
        error: 'You are banned for 24 hours due to abusive words.',
        bannedUntil: user.banStatus.bannedUntil,
      });
    }

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

    if (word !== 'Radha' || word !== 'radha') {
      await user.save();
      return res.status(400).json({ error: 'Only exact word "Radha" counts.' });
    }

    user.radhaCount += 1;
    await user.save();

    await logActivity(user.username, 'typed Radha', `Total ${user.radhaCount}`);

    return res.json({
      ok: true,
      radhaCount: user.radhaCount,
      warnings: user.warnings,
      milestone: user.radhaCount % 50 === 0,
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Submission failed.' });
  }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const users = await User.find({}, { username: 1, radhaCount: 1 })
      .sort({ radhaCount: -1, username: 1 })
      .limit(100)
      .lean();

    const leaderboard = users.map((item, index) => ({
      rank: index + 1,
      username: item.username,
      radhaCount: item.radhaCount,
    }));

    return res.json({ leaderboard });
  } catch (_error) {
    return res.status(500).json({ error: 'Could not load leaderboard.' });
  }
});

app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  try {
    const username = cleanUsername(req.body.username);
    const password =
      typeof req.body.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const admin = await Admin.findOne({ username });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '12h' },
    );
    return res.json({ token, username: admin.username });
  } catch (_error) {
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
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load dashboard.' });
  }
});

app.get('/api/admin/users', authAdmin, async (_req, res) => {
  try {
    const users = await User.find()
      .sort({ radhaCount: -1, username: 1 })
      .lean();
    return res.json({ users });
  } catch (_error) {
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
    { $set: { radhaCount: 0, totalSubmissions: 0, lastActivity: new Date() } },
  );
  await logActivity('system', 'leaderboard reset', 'Admin reset leaderboard');
  return res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).send('Page not found');
});
async function start() {
  await mongoose.connect(MONGO_URI);
  await ensureAdminSeeded();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Startup failed:', error.message);
  process.exit(1);
});
