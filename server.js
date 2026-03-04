const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const RESET_KEY = process.env.RESET_KEY || 'radha-reset-key';

const abusiveWords = new Set([
  'abuse',
  'badword',
  'idiot',
  'stupid',
  'hate',
  'damn',
  'nonsense',
]);

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

const userSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true, trim: true },
  radha_count: { type: Number, default: 0 },
  warnings: { type: Number, default: 0 },
  ban_status: {
    isBanned: { type: Boolean, default: false },
    banUntil: { type: Date, default: null },
  },
  last_activity: { type: Date, default: Date.now },
  lastSubmissionAt: { type: Date, default: null },
});

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

class MemoryStore {
  constructor() {
    this.users = new Map();
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

  async topUsers() {
    return [...this.users.values()]
      .sort((a, b) => b.radha_count - a.radha_count || a.last_activity - b.last_activity)
      .slice(0, 50);
  }

  async resetDaily() {
    for (const user of this.users.values()) {
      user.radha_count = 0;
      user.last_activity = new Date();
    }
  }
}

const memoryStore = new MemoryStore();
let dbEnabled = false;

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

async function getUser(sessionId) {
  return dbEnabled ? UserModel.findOne({ sessionId }) : memoryStore.findUserBySession(sessionId);
}

async function persistUser(user) {
  if (dbEnabled) {
    return user.save();
  }
  return memoryStore.saveUser(user);
}

async function createUser(sessionId, username) {
  if (dbEnabled) {
    return UserModel.create({ sessionId, username });
  }
  return memoryStore.createUser({ sessionId, username });
}

function sanitizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, 24);
}

function isBanned(user) {
  if (!user?.ban_status?.isBanned || !user?.ban_status?.banUntil) return false;
  return new Date(user.ban_status.banUntil).getTime() > Date.now();
}

function validateSessionAndUsername(sessionId, username) {
  return typeof sessionId === 'string' && sessionId.length >= 10 && typeof username === 'string' && username.length >= 2;
}

app.post('/api/session/start', async (req, res) => {
  try {
    const sessionId = (req.body.sessionId || '').trim();
    const username = sanitizeUsername(req.body.username);

    if (!validateSessionAndUsername(sessionId, username)) {
      return res.status(400).json({ error: 'Invalid session or username.' });
    }

    let user = await getUser(sessionId);

    if (!user) {
      user = await createUser(sessionId, username);
    } else if (user.username !== username) {
      return res.status(400).json({ error: 'Session already tied to a different username.' });
    }

    if (isBanned(user)) {
      return res.status(403).json({
        error: 'Temporarily banned for abusive language.',
        banUntil: user.ban_status.banUntil,
      });
    }

    return res.json({
      username: user.username,
      radha_count: user.radha_count,
      warnings: user.warnings,
      ban_status: user.ban_status,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/submit', async (req, res) => {
  try {
    const sessionId = (req.body.sessionId || '').trim();
    const username = sanitizeUsername(req.body.username);
    const word = (req.body.word || '').trim();

    if (!validateSessionAndUsername(sessionId, username)) {
      return res.status(400).json({ error: 'Invalid session or username.' });
    }

    const user = await getUser(sessionId);
    if (!user || user.username !== username) {
      return res.status(401).json({ error: 'Session not found. Start again.' });
    }

    if (isBanned(user)) {
      return res.status(403).json({
        error: 'You are banned for 24 hours due to repeated abusive words.',
        banUntil: user.ban_status.banUntil,
      });
    }

    const now = Date.now();
    if (user.lastSubmissionAt && now - new Date(user.lastSubmissionAt).getTime() < SUBMIT_DELAY_MS) {
      return res.status(429).json({ error: 'Too fast. Please type naturally.' });
    }

    if (!word || word.includes(' ') || word.length > 16) {
      user.lastSubmissionAt = new Date();
      user.last_activity = new Date();
      await persistUser(user);
      return res.status(400).json({ error: 'Only one word is allowed per submission.' });
    }

    if (abusiveWords.has(word.toLowerCase())) {
      user.warnings += 1;
      user.last_activity = new Date();
      user.lastSubmissionAt = new Date();
      if (user.warnings >= 3) {
        user.ban_status = {
          isBanned: true,
          banUntil: new Date(Date.now() + BAN_DURATION_MS),
        };
      }
      await persistUser(user);
      return res.status(403).json({
        error: 'Warning: Abusive words are not allowed.',
        warnings: user.warnings,
        banned: user.ban_status.isBanned,
        banUntil: user.ban_status.banUntil,
      });
    }

    user.lastSubmissionAt = new Date();
    user.last_activity = new Date();

    if (word === 'Radha') {
      user.radha_count += 1;
      await persistUser(user);
      return res.json({
        success: true,
        radha_count: user.radha_count,
        warnings: user.warnings,
        milestone: user.radha_count % 50 === 0,
      });
    }

    await persistUser(user);
    return res.status(400).json({ error: 'Only exact word "Radha" counts.' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const users = dbEnabled
      ? await UserModel.find().sort({ radha_count: -1, last_activity: 1 }).limit(50).lean()
      : await memoryStore.topUsers();

    const leaderboard = users.map((u, index) => ({
      rank: index + 1,
      username: u.username,
      radha_count: u.radha_count,
    }));

    return res.json({ leaderboard, updatedAt: new Date() });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load leaderboard.' });
  }
});

app.post('/api/admin/reset-daily', async (req, res) => {
  try {
    if (req.headers['x-reset-key'] !== RESET_KEY) {
      return res.status(401).json({ error: 'Unauthorized reset request.' });
    }

    if (dbEnabled) {
      await UserModel.updateMany({}, { $set: { radha_count: 0, last_activity: new Date() } });
    } else {
      await memoryStore.resetDaily();
    }

    return res.json({ success: true, message: 'Daily leaderboard has been reset.' });
  } catch (error) {
    return res.status(500).json({ error: 'Reset failed.' });
  }
});

initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Radha Naam Leaderboard running at http://localhost:${PORT}`);
  });
});
