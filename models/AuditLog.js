// Simple audit log for admin/user actions (non-destructive).
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  action: { type: String, required: true },
  targetType: { type: String, required: true }, // e.g., "Donor", "Request", "Donation"
  targetId: { type: String },
  details: { type: Object },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AuditLog", auditLogSchema);
