const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

module.exports = mongoose.models.Activity || mongoose.model('Activity', activitySchema);
