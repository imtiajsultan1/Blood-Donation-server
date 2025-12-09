// Institution model tracks hospitals, clinics, NGOs, or blood camp organizers.
const mongoose = require("mongoose");

const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  type: { type: String, enum: ["hospital", "clinic", "ngo", "camp", "other"], default: "other" },
  contactPerson: { type: String },
  phone: { type: String },
  email: { type: String, lowercase: true, trim: true },
  address: {
    country: { type: String, default: "Bangladesh" },
    stateOrDivision: { type: String },
    city: { type: String },
    area: { type: String },
    postalCode: { type: String },
  },
  totalDonations: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Institution", institutionSchema);
