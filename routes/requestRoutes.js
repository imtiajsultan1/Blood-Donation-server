// Routes for managing blood requests (recipients needing blood).
const express = require("express");
const mongoose = require("mongoose");
const BloodRequest = require("../models/BloodRequest");
const Donor = require("../models/Donor");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const auth = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/roleMiddleware");

const router = express.Router();

// All blood request routes require authentication.
router.use(auth);

// Helper: allowed donor visibilities per role.
const allowedVisibilities = (role) => {
  if (role === "admin") return ["public", "registered", "admin"];
  if (role === "guest") return ["public"];
  return ["public", "registered"];
};

// Helper: find donors matching a request (respect visibility, willingness, eligibility).
const findMatchingDonors = async (requestDoc, viewerRole, viewerId) => {
  const filters = {
    willingToDonate: true,
    bloodGroup: requestDoc.bloodGroup,
    visibility: { $in: allowedVisibilities(viewerRole) },
    isDeleted: false,
  };

  if (requestDoc.city) {
    filters["address.city"] = { $regex: requestDoc.city, $options: "i" };
  }

  const donors = await Donor.find(filters);

  // Filter by eligibility (90-day rule) and shape data based on viewer.
  const eligibleDonors = donors.filter((d) => d.isEligibleToDonate().eligible);
  const safeDonors = eligibleDonors.map((d) => d.toSafeObject(viewerRole, viewerId));
  return { eligibleDonors, safeDonors };
};

// Create a blood request (open by default).
router.post("/", async (req, res) => {
  try {
    const { bloodGroup, city, hospital, patientName, unitsNeeded, requiredDate, contactPhone } = req.body;

    if (!bloodGroup || !city || !unitsNeeded || !requiredDate || !contactPhone) {
      return res.status(400).json({
        success: false,
        message: "bloodGroup, city, unitsNeeded, requiredDate, and contactPhone are required.",
      });
    }

    const bloodRequest = new BloodRequest({
      user: req.user.id,
      bloodGroup,
      city,
      hospital,
      patientName,
      unitsNeeded,
      requiredDate,
      contactPhone,
      status: "open",
    });

    await bloodRequest.save();

    // Optionally return matching donors to the requester.
    const { eligibleDonors, safeDonors } = await findMatchingDonors(
      bloodRequest,
      req.user.role,
      req.user.id
    );

    // Create notifications for matching donors who allow contact.
    for (const donor of eligibleDonors) {
      if (donor.user && donor.allowRequestContact) {
        await Notification.create({
          user: donor.user,
          donor: donor._id,
          type: "request_match",
          title: "Blood request match",
          message: `A blood request matches your profile (${bloodRequest.bloodGroup} in ${bloodRequest.city}).`,
          meta: { requestId: bloodRequest._id },
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: "Blood request created.",
      data: { request: bloodRequest, matches: safeDonors },
    });
  } catch (error) {
    console.error("Create blood request error:", error);
    return res.status(500).json({ success: false, message: "Server error while creating blood request." });
  }
});

// Get current user's blood requests.
router.get("/me", async (req, res) => {
  try {
    const requests = await BloodRequest.find({ user: req.user.id, isDeleted: false }).sort({
      createdAt: -1,
    });
    return res
      .status(200)
      .json({ success: true, message: "Your blood requests.", data: requests });
  } catch (error) {
    console.error("List my requests error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching your requests." });
  }
});

// Admin: get all blood requests.
router.get("/", requireAdmin, async (req, res) => {
  try {
    const requests = await BloodRequest.find({ isDeleted: false })
      .populate("user", "name email role")
      .sort({ createdAt: -1 });
    return res
      .status(200)
      .json({ success: true, message: "All blood requests fetched.", data: requests });
  } catch (error) {
    console.error("List all requests error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching requests." });
  }
});

// Update request status (owner or admin).
router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    const allowedStatuses = ["open", "fulfilled", "cancelled"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be open, fulfilled, or cancelled." });
    }

    const bloodRequest = await BloodRequest.findOne({ _id: id, isDeleted: false });
    if (!bloodRequest) {
      return res.status(404).json({ success: false, message: "Blood request not found." });
    }

    // Only admins or the owner can update.
    if (req.user.role !== "admin" && bloodRequest.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "You can only update your own request." });
    }

    bloodRequest.status = status;
    await bloodRequest.save();

    await AuditLog.create({
      user: req.user.id,
      action: "update_request_status",
      targetType: "Request",
      targetId: bloodRequest._id.toString(),
      details: { status },
    });

    return res
      .status(200)
      .json({ success: true, message: "Blood request updated.", data: bloodRequest });
  } catch (error) {
    console.error("Update request status error:", error);
    return res.status(500).json({ success: false, message: "Server error while updating request." });
  }
});

// Get donor matches for a specific request (owner or admin).
router.get("/:id/matches", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    const bloodRequest = await BloodRequest.findOne({ _id: id, isDeleted: false });
    if (!bloodRequest) {
      return res.status(404).json({ success: false, message: "Blood request not found." });
    }

    if (req.user.role !== "admin" && bloodRequest.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "You can only view matches for your own request." });
    }

    const matches = await findMatchingDonors(bloodRequest, req.user.role, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Matching donors fetched.",
      data: matches,
    });
  } catch (error) {
    console.error("Get matches error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching matches." });
  }
});

module.exports = router;
