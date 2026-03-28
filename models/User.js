const mongoose = require('mongoose');

const ACHIEVEMENTS = [
  {
    id: 'first_chant',
    label: 'First Chant 🙏',
    desc: 'Typed Radha for the first time',
    condition: (u) => u.radhaCount >= 1,
  },
  {
    id: 'devotee_50',
    label: 'Devotee 🌸',
    desc: '50 chants',
    condition: (u) => u.radhaCount >= 50,
  },
  {
    id: 'bhakt_100',
    label: 'Bhakt ✨',
    desc: '100 chants',
    condition: (u) => u.radhaCount >= 100,
  },
  {
    id: 'mahabhakt_500',
    label: 'Mahabhakt 🔱',
    desc: '500 chants',
    condition: (u) => u.radhaCount >= 500,
  },
  {
    id: 'legend_1000',
    label: 'Legend 👑',
    desc: '1000 chants',
    condition: (u) => u.radhaCount >= 1000,
  },
  {
    id: 'streak_3',
    label: 'Streak Starter 🔥',
    desc: '3-day streak',
    condition: (u) => u.currentStreak >= 3,
  },
  {
    id: 'streak_7',
    label: 'Week Warrior ⚡',
    desc: '7-day streak',
    condition: (u) => u.currentStreak >= 7,
  },
  {
    id: 'streak_30',
    label: 'Monthly Devotee 🌙',
    desc: '30-day streak',
    condition: (u) => u.currentStreak >= 30,
  },
];

const userSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, trim: true },
    radhaCount: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 },
    abusiveAttempts: { type: Number, default: 0 },
    totalSubmissions: { type: Number, default: 0 },
    lastSubmissionAt: { type: Date, default: null },
    lastActivity: { type: Date, default: null },

    // Streak System
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastStreakDate: { type: String, default: null }, // 'YYYY-MM-DD'

    // Daily Goal
    dailyGoal: { type: Number, default: 50 },
    dailyCount: { type: Number, default: 0 },
    dailyResetDate: { type: String, default: null }, // 'YYYY-MM-DD'

    // Achievements
    achievements: { type: [String], default: [] },
    newAchievements: { type: [String], default: [] }, // for popup notification

    banStatus: {
      isBanned: { type: Boolean, default: false },
      bannedUntil: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

userSchema.methods.updateStreak = function () {
  const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  if (this.lastStreakDate === todayStr) return; // already counted today

  if (!this.lastStreakDate) {
    this.currentStreak = 1;
  } else {
    const last = new Date(this.lastStreakDate);
    const today = new Date(todayStr);
    const diffDays = Math.round((today - last) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      this.currentStreak += 1;
    } else {
      this.currentStreak = 1;
    }
  }

  this.lastStreakDate = todayStr;
  if (this.currentStreak > this.longestStreak) {
    this.longestStreak = this.currentStreak;
  }
};

userSchema.methods.updateDailyCount = function () {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (this.dailyResetDate !== todayStr) {
    this.dailyCount = 0;
    this.dailyResetDate = todayStr;
  }
  this.dailyCount += 1;
};

userSchema.methods.checkAchievements = function () {
  const newlyUnlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (!this.achievements.includes(ach.id) && ach.condition(this)) {
      this.achievements.push(ach.id);
      newlyUnlocked.push(ach.id);
    }
  }
  this.newAchievements = newlyUnlocked;
  return newlyUnlocked;
};

module.exports = mongoose.model('User', userSchema);
module.exports.ACHIEVEMENTS = ACHIEVEMENTS;
