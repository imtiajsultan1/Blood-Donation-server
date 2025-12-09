// Routes for creating and listing institutions.
const express = require("express");
const mongoose = require("mongoose");
const Institution = require("../models/Institution");
const auth = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/roleMiddleware");

const router = express.Router();

// Protect all institution routes.
router.use(auth);

// Create a new institution (admin only).
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, type, contactPerson, phone, email, address } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Institution name is required." });
    }

    const institution = new Institution({
      name,
      type,
      contactPerson,
      phone,
      email,
      address,
    });

    await institution.save();

    return res
      .status(201)
      .json({ success: true, message: "Institution created successfully.", data: institution });
  } catch (error) {
    console.error("Create institution error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Institution name must be unique." });
    }
    return res.status(500).json({ success: false, message: "Server error while creating institution." });
  }
});

// List all institutions.
router.get("/", async (req, res) => {
  try {
    const institutions = await Institution.find().sort({ name: 1 });
    return res.status(200).json({ success: true, message: "Institutions fetched.", data: institutions });
  } catch (error) {
    console.error("List institutions error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching institutions." });
  }
});

// Ranking of institutions by total donations.
router.get("/ranking", async (req, res) => {
  try {
    const ranking = await Institution.find().sort({ totalDonations: -1, name: 1 });
    return res
      .status(200)
      .json({ success: true, message: "Institution ranking fetched.", data: ranking });
  } catch (error) {
    console.error("Institution ranking error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching ranking." });
  }
});

module.exports = router;
