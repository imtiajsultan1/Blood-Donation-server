// Routes for recording and viewing donation history.
const express = require("express");
const mongoose = require("mongoose");
const Donation = require("../models/Donation");
const Donor = require("../models/Donor");
const Institution = require("../models/Institution");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// Protect all donation routes.
router.use(auth);

// Record a new donation.
router.post("/", async (req, res) => {
  try {
    const { donorId, institutionId, donationDate, units, location, notes } = req.body;

    if (!donorId) {
      return res.status(400).json({ success: false, message: "donorId is required." });
    }

    if (!mongoose.isValidObjectId(donorId)) {
      return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    const donor = await Donor.findById(donorId);
    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor not found." });
    }

    // Validate eligibility with the 90-day rule.
    const eligibility = donor.isEligibleToDonate();
    if (!eligibility.eligible) {
      return res.status(400).json({
        success: false,
        message: `Donor is not eligible to donate yet. Please wait ${eligibility.daysUntilEligible} more days.`,
        daysUntilEligible: eligibility.daysUntilEligible,
      });
    }

    let institution = null;
    if (institutionId) {
      if (!mongoose.isValidObjectId(institutionId)) {
        return res.status(400).json({ success: false, message: "Invalid institution ID." });
      }

      institution = await Institution.findById(institutionId);
      if (!institution) {
        return res.status(404).json({ success: false, message: "Institution not found." });
      }
    }

    // Use provided date or default to now.
    const donationDateValue = donationDate ? new Date(donationDate) : new Date();
    if (isNaN(donationDateValue)) {
      return res.status(400).json({ success: false, message: "Invalid donationDate format." });
    }

    const donation = await Donation.create({
      donor: donorId,
      institution: institutionId || undefined,
      donationDate: donationDateValue,
      units: units || 1,
      location,
      notes,
    });

    // Update donor stats.
    donor.lastDonationDate = donation.donationDate;
    donor.totalDonations += 1;
    await donor.save();

    // Update institution stats if applicable.
    if (institution) {
      institution.totalDonations += 1;
      await institution.save();
    }

    return res
      .status(201)
      .json({ success: true, message: "Donation recorded successfully.", data: donation });
  } catch (error) {
    console.error("Create donation error:", error);
    return res.status(500).json({ success: false, message: "Server error while recording donation." });
  }
});

// Get all donations with optional filters.
router.get("/", async (req, res) => {
  try {
    const { donorId, institutionId, fromDate, toDate } = req.query;
    const filters = {};

    if (donorId) {
      if (!mongoose.isValidObjectId(donorId)) {
        return res.status(400).json({ success: false, message: "Invalid donor ID." });
      }
      filters.donor = donorId;
    }

    if (institutionId) {
      if (!mongoose.isValidObjectId(institutionId)) {
        return res.status(400).json({ success: false, message: "Invalid institution ID." });
      }
      filters.institution = institutionId;
    }

    if (fromDate || toDate) {
      filters.donationDate = {};
      if (fromDate) {
        const parsedFrom = new Date(fromDate);
        if (isNaN(parsedFrom)) {
          return res.status(400).json({ success: false, message: "Invalid fromDate format." });
        }
        filters.donationDate.$gte = parsedFrom;
      }
      if (toDate) {
        const parsedTo = new Date(toDate);
        if (isNaN(parsedTo)) {
          return res.status(400).json({ success: false, message: "Invalid toDate format." });
        }
        filters.donationDate.$lte = parsedTo;
      }
    }

    const donations = await Donation.find(filters)
      .populate("donor", "fullName bloodGroup phone")
      .populate("institution", "name type")
      .sort({ donationDate: -1 });

    return res.status(200).json({ success: true, message: "Donations fetched.", data: donations });
  } catch (error) {
    console.error("List donations error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching donations." });
  }
});

// Get donation history for a specific donor.
router.get("/donor/:donorId", async (req, res) => {
  try {
    const { donorId } = req.params;

    if (!mongoose.isValidObjectId(donorId)) {
      return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    const donations = await Donation.find({ donor: donorId })
      .populate("donor", "fullName bloodGroup phone")
      .populate("institution", "name type")
      .sort({ donationDate: -1 });

    return res.status(200).json({
      success: true,
      message: "Donation history fetched.",
      data: donations,
    });
  } catch (error) {
    console.error("Donor donation history error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error while fetching donor donations." });
  }
});

module.exports = router;
