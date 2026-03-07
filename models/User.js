const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, trim: true, maxlength: 24 },
    radhaCount: { type: Number, default: 0, min: 0 },
    warnings: { type: Number, default: 0, min: 0, max: 3 },
    totalSubmissions: { type: Number, default: 0, min: 0 },
    abusiveAttempts: { type: Number, default: 0, min: 0 },
    banStatus: {
      isBanned: { type: Boolean, default: false },
      bannedUntil: { type: Date, default: null },
    },
    lastSubmissionAt: { type: Date, default: null },
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
