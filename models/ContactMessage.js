// ContactMessage stores messages sent to donors via the system (instead of exposing phone/email).
const mongoose = require("mongoose");

const contactMessageSchema = new mongoose.Schema({
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  toDonor: { type: mongoose.Schema.Types.ObjectId, ref: "Donor", required: true },
  relatedRequest: { type: mongoose.Schema.Types.ObjectId, ref: "BloodRequest" },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ContactMessage", contactMessageSchema);
