// Donor model captures all details about a blood donor.
// Includes helper to check donation eligibility based on last donation date.
const mongoose = require("mongoose");

const donorSchema = new mongoose.Schema({
  // Link each donor profile to the user who owns it.
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  fullName: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
  phone: { type: String, required: true },
  emergencyContactName: { type: String, required: true },
  emergencyContactPhone: { type: String, required: true },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ["male", "female", "other"] },
  bloodGroup: {
    type: String,
    required: true,
    enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  },
  willingToDonate: { type: Boolean, default: true },
  // Controls how visible the donor profile is in searches.
  // public: everyone can see the profile in search
  // registered: only logged-in users (non-admin) and admins can see
  // admin: only admins can see
  visibility: { type: String, enum: ["public", "registered", "admin"], default: "registered" },
  // Controls who can see the phone number.
  // public -> everyone; registered -> only logged-in users and admins; admin -> only admins
  phoneVisibility: { type: String, enum: ["public", "registered", "admin"], default: "registered" },
  // Whether the donor wants to be contacted via the system for requests.
  allowRequestContact: { type: Boolean, default: true },
  contactPreference: { type: String, enum: ["phone", "email", "message"], default: "message" },
  address: {
    country: { type: String, default: "Bangladesh" },
    stateOrDivision: { type: String },
    city: { type: String },
    area: { type: String },
    postalCode: { type: String },
    // Optional coordinates to enable proximity search.
    lat: { type: Number },
    lng: { type: Number },
  },
  lastDonationDate: { type: Date },
  totalDonations: { type: Number, default: 0 },
  notes: { type: String },
  deferralUntil: { type: Date }, // additional deferral beyond 90-day rule
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Keep updatedAt fresh on every save/update.
donorSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Helper to check if a donor can donate now.
// Returns an object with eligible flag and daysUntilEligible.
donorSchema.methods.isEligibleToDonate = function () {
  // If donor opted out, they are not eligible regardless of last donation date.
  if (!this.willingToDonate) {
    return { eligible: false, daysUntilEligible: null };
  }

  // If donor has an active deferral, block until that date.
  if (this.deferralUntil && this.deferralUntil > new Date()) {
    const diffMs = this.deferralUntil - new Date();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return { eligible: false, daysUntilEligible: diffDays };
  }

  // No previous donation means they are eligible right away.
  if (!this.lastDonationDate) {
    return { eligible: true, daysUntilEligible: 0 };
  }

  const now = new Date();
  const diffMs = now - this.lastDonationDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const MIN_GAP = 90;

  if (diffDays >= MIN_GAP) {
    return { eligible: true, daysUntilEligible: 0 };
  }

  const remaining = MIN_GAP - diffDays;
  return { eligible: false, daysUntilEligible: remaining };
};

// Helper to shape donor data based on who is viewing (privacy-aware response).
donorSchema.methods.toSafeObject = function (viewerRole = "guest", viewerId = null) {
  const resolvedUserId = this.user?._id ? this.user._id.toString() : this.user?.toString();
  const isOwner = viewerId && resolvedUserId && resolvedUserId === viewerId;
  const normalizedRole = viewerRole === "admin" ? "admin" : viewerRole === "guest" ? "guest" : "registered";

  // Decide if phone can be shown. For faster contact, any registered user can see phone; guests still respect visibility.
  let phoneAllowed = false;
  if (normalizedRole === "admin" || isOwner) {
    phoneAllowed = true;
  } else if (normalizedRole === "registered") {
    phoneAllowed = true;
  } else if (this.phoneVisibility === "public") {
    phoneAllowed = true;
  }

  const base = {
    id: this._id,
    _id: this._id,
    profilePicture: this.user?.profilePicture,
    fullName: this.fullName,
    bloodGroup: this.bloodGroup,
    willingToDonate: this.willingToDonate,
    address: this.address,
    visibility: this.visibility,
    phoneVisibility: this.phoneVisibility,
    allowRequestContact: this.allowRequestContact,
    contactPreference: this.contactPreference,
    totalDonations: this.totalDonations,
    lastDonationDate: this.lastDonationDate,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };

  // Eligibility details (90-day rule).
  const eligibility = this.isEligibleToDonate();
  base.eligibility = {
    eligible: eligibility.eligible,
    daysUntilEligible: eligibility.daysUntilEligible,
  };

  if (phoneAllowed) {
    base.phone = this.phone;
  }

  // Owners and admins can also see email and emergency contacts.
  if (isOwner || normalizedRole === "admin" || normalizedRole === "registered") {
    base.email = this.email;
  }

  if (isOwner || normalizedRole === "admin") {
    base.emergencyContactName = this.emergencyContactName;
    base.emergencyContactPhone = this.emergencyContactPhone;
    base.notes = this.notes;
    base.gender = this.gender;
    base.dateOfBirth = this.dateOfBirth;
  }

  return base;
};

module.exports = mongoose.model("Donor", donorSchema);
