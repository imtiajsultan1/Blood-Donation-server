// Simple script to create a primary admin user.
// Usage: node scripts/createAdmin.js
// It will load .env for MONGO_URI and create an admin with the credentials below.
// Change the defaults before running if you want different credentials.

const dotenv = require("dotenv");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

dotenv.config();

const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "Admin";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@bloodcare.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin123!";

const run = async () => {
  try {
    await connectDB();

    // Check if an admin already exists with this email.
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      console.log(`User with email ${ADMIN_EMAIL} already exists. Updating role to admin...`);
      existing.role = "admin";
      if (ADMIN_PASSWORD) {
        existing.password = ADMIN_PASSWORD; // will be re-hashed by the model hook
      }
      await existing.save();
      console.log("Admin user updated.");
      process.exit(0);
    }

    const admin = new User({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
    });

    await admin.save();
    console.log("Admin user created:");
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    process.exit(0);
  } catch (error) {
    console.error("Failed to create admin:", error);
    process.exit(1);
  }
};

run();
