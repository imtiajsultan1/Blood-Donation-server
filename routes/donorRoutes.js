// Routes for managing donors.
// Public search is available (limited fields), other routes require authentication.
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Donor = require("../models/Donor");
const auth = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/roleMiddleware");

const router = express.Router();

// Helper: determine viewer role/id from optional Authorization header.
const getViewerContext = (req) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { role: "guest", userId: null };
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const role = decoded.role === "admin" ? "admin" : "registered";
    return { role, userId: decoded.id || null };
  } catch (err) {
    return { role: "guest", userId: null };
  }
};

// Helper: which visibilities can a role see.
const allowedVisibilities = (role) => {
  if (role === "admin") return ["public", "registered", "admin"];
  if (role === "guest") return ["public"];
  return ["public", "registered"]; // registered/donor
};

// PUBLIC: limited donor search for recipients (no auth required).
router.get("/search", async (req, res) => {
  try {
    const viewer = getViewerContext(req);
    const { bloodGroup, city } = req.query;
    const filters = {
      willingToDonate: true,
      visibility: { $in: allowedVisibilities(viewer.role) },
    };

    if (bloodGroup) {
      filters.bloodGroup = bloodGroup;
    }
    if (city) {
      filters["address.city"] = { $regex: city, $options: "i" };
    }

    const donors = await Donor.find(filters);
    const results = donors.map((d) => d.toSafeObject(viewer.role, viewer.userId));

    return res.status(200).json({
      success: true,
      message: "Public donor search results.",
      data: results,
    });
  } catch (error) {
    console.error("Public search error:", error);
    return res.status(500).json({ success: false, message: "Server error during search." });
  }
});

// Apply auth middleware to every route after this line.
router.use(auth);

// Create a new donor.
router.post("/", async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      emergencyContactName,
      emergencyContactPhone,
      dateOfBirth,
      gender,
      bloodGroup,
      willingToDonate,
      address,
      lastDonationDate,
      notes
    } = req.body;

    // Basic required field validation.
    if (!fullName || !phone || !bloodGroup || !emergencyContactName || !emergencyContactPhone) {
      return res.status(400).json({
        success: false,
        message: "fullName, phone, bloodGroup, emergencyContactName, and emergencyContactPhone are required.",
      });
    }

    // Decide which user owns this donor profile.
    // Normal users can only create for themselves.
    // Admins may optionally provide a user id in the body to create on behalf of someone.
    let ownerUserId = req.user.id;
    if (req.user.role === "admin" && req.body.user) {
      if (!mongoose.isValidObjectId(req.body.user)) {
        return res.status(400).json({ success: false, message: "Invalid user id provided for donor ownership." });
      }
      ownerUserId = req.body.user;
    }

    // Enforce one donor profile per user.
    const existingProfile = await Donor.findOne({ user: ownerUserId });
    if (existingProfile) {
      return res
        .status(400)
        .json({ success: false, message: "You already have a donor profile. Update it instead." });
    }

    const donor = new Donor({
      user: ownerUserId,
      fullName,
      email,
      phone,
      emergencyContactName,
      emergencyContactPhone,
      dateOfBirth,
      gender,
      bloodGroup,
      willingToDonate,
      address,
      lastDonationDate,
      notes,
    });

    await donor.save();

    const response = donor.toSafeObject(req.user.role, req.user.id);

    return res
      .status(201)
      .json({ success: true, message: "Donor created successfully.", data: response });
  } catch (error) {
    console.error("Create donor error:", error);
    // Handle duplicate email nicely.
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Email already exists for another donor." });
    }
    return res.status(500).json({ success: false, message: "Server error while creating donor." });
  }
});

// Get all donors (admin only) with optional filtering.
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { bloodGroup, city, willing } = req.query;
    const filters = {};

    if (bloodGroup) {
      filters.bloodGroup = bloodGroup;
    }

    if (city) {
      // Case-insensitive match on address.city.
      filters["address.city"] = { $regex: city, $options: "i" };
    }

    if (willing === "true" || willing === "false") {
      filters.willingToDonate = willing === "true";
    }

    const donors = await Donor.find(filters).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, message: "Donors fetched.", data: donors });
  } catch (error) {
    console.error("List donors error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching donors." });
  }
});

// Get current user's donor profile.
router.get("/me", async (req, res) => {
  try {
    const donor = await Donor.findOne({ user: req.user.id });
    if (!donor) {
      return res.status(404).json({ success: false, message: "No donor profile found for this user." });
    }
    return res
      .status(200)
      .json({ success: true, message: "Donor profile fetched.", data: donor.toSafeObject(req.user.role, req.user.id) });
  } catch (error) {
    console.error("Get my donor error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching donor." });
  }
});

// Get single donor by ID.
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    const donor = await Donor.findById(id);
    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor not found." });
    }

    return res
      .status(200)
      .json({ success: true, message: "Donor fetched.", data: donor.toSafeObject("admin", req.user.id) });
  } catch (error) {
    console.error("Get donor error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching donor." });
  }
});

// Update donor details.
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    // Only admins can update any donor. Normal users can only update their own profile.
    if (req.user.role !== "admin") {
      const owned = await Donor.findOne({ _id: id, user: req.user.id });
      if (!owned) {
        return res.status(403).json({ success: false, message: "You can only update your own donor profile." });
      }
    }

    // Prevent changing ownership.
    const updates = { ...req.body, updatedAt: new Date() };
    delete updates.user;

    const updatedDonor = await Donor.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedDonor) {
      return res.status(404).json({ success: false, message: "Donor not found." });
    }

    return res
      .status(200)
      .json({ success: true, message: "Donor updated.", data: updatedDonor.toSafeObject(req.user.role, req.user.id) });
  } catch (error) {
    console.error("Update donor error:", error);
    return res.status(500).json({ success: false, message: "Server error while updating donor." });
  }
});

// Delete donor (admin only).
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    const deleted = await Donor.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Donor not found." });
    }

    return res.status(200).json({ success: true, message: "Donor deleted." });
  } catch (error) {
    console.error("Delete donor error:", error);
    return res.status(500).json({ success: false, message: "Server error while deleting donor." });
  }
});

// Check donor eligibility.
router.get("/:id/eligibility", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    const donor = await Donor.findById(id);
    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor not found." });
    }

    // Only admins or the owner can view eligibility details.
    if (req.user.role !== "admin" && donor.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "You can only view your own donor eligibility." });
    }

    const eligibility = donor.isEligibleToDonate();
    const response = {
      success: true,
      eligible: eligibility.eligible,
      message: eligibility.eligible ? "Donor is eligible to donate." : "Donor is not eligible yet.",
    };

    // Include extra details when not eligible.
    if (!eligibility.eligible) {
      response.reason = donor.willingToDonate
        ? "Donated too recently."
        : "Donor is not willing to donate currently.";
      response.daysUntilEligible = eligibility.daysUntilEligible;
    } else {
      response.daysUntilEligible = 0;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Eligibility check error:", error);
    return res.status(500).json({ success: false, message: "Server error while checking eligibility." });
  }
});

module.exports = router;
