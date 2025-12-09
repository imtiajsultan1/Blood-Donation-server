// Donation model records each donation event.
// It links to a donor and optionally to an institution.
const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema({
  donor: { type: mongoose.Schema.Types.ObjectId, ref: "Donor", required: true },
  institution: { type: mongoose.Schema.Types.ObjectId, ref: "Institution" },
  donationDate: { type: Date, required: true },
  units: { type: Number, default: 1 },
  location: { type: String },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Donation", donationSchema);
