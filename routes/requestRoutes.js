// Routes for managing blood requests (recipients needing blood).
const express = require("express");
const mongoose = require("mongoose");
const BloodRequest = require("../models/BloodRequest");
const Donor = require("../models/Donor");
const AuditLog = require("../models/AuditLog");
const RequestMessage = require("../models/RequestMessage");
const Notification = require("../models/Notification");
const RequestChat = require("../models/RequestChat");
const auth = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/roleMiddleware");
const { messageLimiter } = require("../middleware/rateLimiter");

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

    const count = await BloodRequest.countDocuments({ user: req.user.id, isDeleted: false });

    const bloodRequest = new BloodRequest({
      user: req.user.id,
      requestNumber: count + 1,
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
    // Ensure requestNumber present; if missing, assign a temporary sequence for response.
    let seq = requests.length;
    const withNumbers = requests.map((r, idx) => {
      const clone = r.toObject();
      clone.requestNumber = r.requestNumber && r.requestNumber > 0 ? r.requestNumber : requests.length - idx;
      return clone;
    });
    return res
      .status(200)
      .json({ success: true, message: "Your blood requests.", data: withNumbers });
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

// Feed of open requests (auth required).
router.get("/feed", async (req, res) => {
  try {
    const { city } = req.query;
    const filters = { isDeleted: false, status: "open" };

    let effectiveCity = (city || "").trim();
    if (!effectiveCity) {
      const viewerDonor = await Donor.findOne({ user: req.user.id, isDeleted: false });
      if (viewerDonor?.address?.city) {
        effectiveCity = viewerDonor.address.city;
      }
    }

    if (effectiveCity) {
      filters.city = { $regex: effectiveCity, $options: "i" };
    }

    const requests = await BloodRequest.find(filters)
      .populate("user", "name email role")
      .sort({ requiredDate: 1, createdAt: -1 });
    return res
      .status(200)
      .json({
        success: true,
        message: "Open blood requests feed.",
        data: requests,
        meta: { city: effectiveCity || null },
      });
  } catch (error) {
    console.error("List feed requests error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching feed." });
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
    if (bloodRequest.user.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: "You cannot message your own request." });
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

// Share donor contact details with the request owner and create a notification.
router.post("/:id/share-info", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    const bloodRequest = await BloodRequest.findOne({ _id: id, isDeleted: false });
    if (!bloodRequest) {
      return res.status(404).json({ success: false, message: "Blood request not found." });
    }

    if (bloodRequest.status !== "open") {
      return res.status(400).json({ success: false, message: "This request is not open anymore." });
    }

    const donor = await Donor.findOne({ user: req.user.id, isDeleted: false });
    if (!donor) {
      return res.status(400).json({
        success: false,
        message: "You need a donor profile to share your information.",
      });
    }

    const donorDetails = {
      id: donor._id,
      fullName: donor.fullName,
      phone: donor.phone,
      email: donor.email,
      bloodGroup: donor.bloodGroup,
      city: donor.address?.city,
      emergencyContactName: donor.emergencyContactName,
      emergencyContactPhone: donor.emergencyContactPhone,
      contactPreference: donor.contactPreference,
      willingToDonate: donor.willingToDonate,
      visibility: donor.visibility,
      phoneVisibility: donor.phoneVisibility,
    };

    const requestDetails = {
      id: bloodRequest._id,
      requestNumber: bloodRequest.requestNumber,
      bloodGroup: bloodRequest.bloodGroup,
      city: bloodRequest.city,
      hospital: bloodRequest.hospital,
      patientName: bloodRequest.patientName,
      unitsNeeded: bloodRequest.unitsNeeded,
      requiredDate: bloodRequest.requiredDate,
      contactPhone: bloodRequest.contactPhone,
      status: bloodRequest.status,
    };

    const notification = await Notification.create({
      user: bloodRequest.user,
      donor: donor._id,
      type: "request_share_info",
      title: `Donor ${donor.fullName} shared details`,
      message: `${donor.fullName} shared contact information for your ${bloodRequest.bloodGroup} request in ${bloodRequest.city}.`,
      meta: { request: requestDetails, donor: donorDetails },
    });

    await AuditLog.create({
      user: req.user.id,
      action: "share_request_info",
      targetType: "Request",
      targetId: bloodRequest._id.toString(),
      details: { donorId: donor._id.toString() },
    });

    return res.status(201).json({
      success: true,
      message: "Your contact details were shared with the requester.",
      data: { notification },
    });
  } catch (error) {
    console.error("Share donor info error:", error);
    return res.status(500).json({ success: false, message: "Server error while sharing information." });
  }
});

// Send a message to the request owner (auth required).
router.post("/:id/contact", messageLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const cleanMessage = message?.toString().trim();

    if (!cleanMessage) {
      return res.status(400).json({ success: false, message: "Message is required." });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    const bloodRequest = await BloodRequest.findOne({ _id: id, isDeleted: false });
    if (!bloodRequest) {
      return res.status(404).json({ success: false, message: "Blood request not found." });
    }

    const participants = [req.user.id.toString(), bloodRequest.user.toString()].sort();
    let chat = await RequestChat.findOne({
      request: bloodRequest._id,
      participants: { $all: participants },
    });

    if (!chat) {
      chat = await RequestChat.create({
        request: bloodRequest._id,
        participants,
        pausedBy: [],
      });
    }

    if (chat.pausedBy && chat.pausedBy.length > 0) {
      return res.status(403).json({
        success: false,
        message: "Chat is paused. Ask the other participant to resume before messaging.",
      });
    }

    // Create request message to owner.
    const msg = await RequestMessage.create({
      fromUser: req.user.id,
      toUser: bloodRequest.user,
      request: bloodRequest._id,
      message: cleanMessage,
    });

    chat.lastMessage = {
      text: msg.message,
      fromUser: req.user.id,
      createdAt: msg.createdAt,
    };
    chat.updatedAt = new Date();
    await chat.save();

    await Notification.create({
      user: bloodRequest.user,
      type: "request_message",
      title: "New request message",
      message: "You received a new message about your blood request.",
      meta: {
        requestId: bloodRequest._id,
        requestMessageId: msg._id,
        chatId: chat._id,
      },
    });

    return res
      .status(201)
      .json({ success: true, message: "Message sent to request owner.", data: { msg, chatId: chat._id } });
  } catch (error) {
    console.error("Send request contact error:", error);
    return res.status(500).json({ success: false, message: "Server error while sending message." });
  }
});

// View a specific request message (owner only or admin).
router.get("/messages/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid message ID." });
    }

    const msg = await RequestMessage.findById(id)
      .populate("fromUser", "name email role")
      .populate("toUser", "name email role")
      .populate("request", "bloodGroup city unitsNeeded requiredDate status");

    if (!msg) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    // Only admin or the owner (toUser) can view.
    if (req.user.role !== "admin" && msg.toUser?._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not authorized to view this message." });
    }

    return res.status(200).json({ success: true, message: "Message fetched.", data: msg });
  } catch (error) {
    console.error("Get request message error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching message." });
  }
});

module.exports = router;
