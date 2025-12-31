// Authentication routes: register, login, and fetch current user info.
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// Helper to sign a JWT with basic user info.
const signToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

// Register a new user (defaults to role "user").
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, profilePicture } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Name, email, and password are required." });
    }

    // Check if the email is already registered.
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already registered." });
    }

    const normalizedProfile =
      typeof profilePicture === "string" && profilePicture.trim().length > 0
        ? profilePicture.trim()
        : undefined;

    // Create user with default "user" role.
    const newUser = new User({ name, email, password, role: "user", profilePicture: normalizedProfile });
    await newUser.save();

    const token = signToken(newUser);

    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      data: {
        token,
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          profilePicture: newUser.profilePicture,
        },
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ success: false, message: "Server error during registration." });
  }
});

// Login an existing user.
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid credentials." });
    }

    if (user.isActive === false) {
      return res.status(403).json({ success: false, message: "Account is disabled. Contact support." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid credentials." });
    }

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          profilePicture: user.profilePicture,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Server error during login." });
  }
});

// Get current logged-in user's info.
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    return res.status(200).json({ success: true, message: "User fetched.", data: user });
  } catch (error) {
    console.error("Me endpoint error:", error);
    return res.status(500).json({ success: false, message: "Server error fetching user." });
  }
});

module.exports = router;
