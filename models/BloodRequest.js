// BloodRequest model tracks requests from recipients needing blood.
const mongoose = require("mongoose");

const bloodRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  bloodGroup: {
    type: String,
    required: true,
    enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  },
  city: { type: String, required: true },
  hospital: { type: String },
  patientName: { type: String },
  unitsNeeded: { type: Number, required: true, min: 1 },
  requiredDate: { type: Date, required: true },
  contactPhone: { type: String, required: true },
  status: { type: String, enum: ["open", "fulfilled", "cancelled"], default: "open" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Keep updatedAt in sync.
bloodRequestSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("BloodRequest", bloodRequestSchema);
