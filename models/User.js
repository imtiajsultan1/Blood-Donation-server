// User model handles application users (both admins and regular users).
// Passwords are hashed automatically before saving.
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const buildAvatarUrl = (seedSource) => {
  const seed = encodeURIComponent(seedSource || "user");
  return `https://i.pravatar.cc/150?u=${seed}`;
};

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  profilePicture: {
    type: String,
    default: function () {
      return buildAvatarUrl(this.email || this.name);
    },
  },
  isActive: { type: Boolean, default: true },
  deactivatedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

// Hash password whenever it is new or modified.
userSchema.pre("save", async function (next) {
  try {
    if (!this.isModified("password")) {
      return next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Helper method to compare a plain password with the hashed one.
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
