// Notification model to record messages/alerts for users/donors.
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  donor: { type: mongoose.Schema.Types.ObjectId, ref: "Donor" },
  type: { type: String, required: true }, // e.g., request_created, contact_message
  title: { type: String },
  message: { type: String, required: true },
  meta: { type: Object },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Notification", notificationSchema);
