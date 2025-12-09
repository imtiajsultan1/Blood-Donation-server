// Contact routes let users send messages to donors without exposing phone/email.
const express = require("express");
const mongoose = require("mongoose");
const ContactMessage = require("../models/ContactMessage");
const Donor = require("../models/Donor");
const BloodRequest = require("../models/BloodRequest");
const Notification = require("../models/Notification");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.use(auth);

// Send a contact message to a donor (owner/admin of request or any logged-in user, respecting donor consent/visibility).
router.post("/", async (req, res) => {
  try {
    const { donorId, requestId, message } = req.body;

    if (!donorId || !message) {
      return res.status(400).json({ success: false, message: "donorId and message are required." });
    }

    if (!mongoose.isValidObjectId(donorId)) {
      return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    const donor = await Donor.findOne({ _id: donorId, isDeleted: false });
    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor not found." });
    }

    if (!donor.allowRequestContact) {
      return res.status(403).json({ success: false, message: "This donor is not accepting contact requests." });
    }

    let relatedRequest = null;
    if (requestId) {
      if (!mongoose.isValidObjectId(requestId)) {
        return res.status(400).json({ success: false, message: "Invalid request ID." });
      }
      relatedRequest = await BloodRequest.findOne({ _id: requestId, isDeleted: false });
      if (!relatedRequest) {
        return res.status(404).json({ success: false, message: "Related blood request not found." });
      }
      // Only owner of the request or admin can contact via that request context.
      if (req.user.role !== "admin" && relatedRequest.user.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: "You can only send from your own request." });
      }
    }

    // Create contact message.
    const contact = await ContactMessage.create({
      fromUser: req.user.id,
      toDonor: donorId,
      relatedRequest: relatedRequest ? relatedRequest._id : undefined,
      message,
    });

    // Create a notification entry for the donor's user (if exists).
    if (donor.user) {
      await Notification.create({
        user: donor.user,
        donor: donor._id,
        type: "contact_message",
        title: "New contact request",
        message: `You have a new contact message regarding a blood request.`,
        meta: { contactId: contact._id, requestId: relatedRequest?._id },
      });
    }

    return res.status(201).json({ success: true, message: "Message sent to donor.", data: contact });
  } catch (error) {
    console.error("Contact message error:", error);
    return res.status(500).json({ success: false, message: "Server error while sending message." });
  }
});

// List notifications for the logged-in user.
router.get("/notifications", async (req, res) => {
  try {
    const notifs = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50);
    return res.status(200).json({ success: true, message: "Notifications fetched.", data: notifs });
  } catch (error) {
    console.error("Notification fetch error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching notifications." });
  }
});

module.exports = router;
