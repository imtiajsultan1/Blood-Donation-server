// Contact routes let users send messages to donors without exposing phone/email.
const express = require("express");
const mongoose = require("mongoose");
const ContactMessage = require("../models/ContactMessage");
const Donor = require("../models/Donor");
const BloodRequest = require("../models/BloodRequest");
const Notification = require("../models/Notification");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.use(auth);

// Send a contact message to a donor (owner/admin of request or any logged-in user, respecting donor consent/visibility).
router.post("/", async (req, res) => {
  try {
    const { donorId, requestId, message } = req.body;
    const cleanMessage = message?.toString().trim();

    if (!donorId || !cleanMessage) {
      return res.status(400).json({ success: false, message: "donorId and message are required." });
    }

    if (!mongoose.isValidObjectId(donorId)) {
      return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    const donor = await Donor.findOne({ _id: donorId, isDeleted: false });
    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor not found." });
    }
    if (donor.user?.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: "You cannot message yourself." });
    }

    if (donor.allowRequestContact === false) {
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
      message: cleanMessage,
    });

    const sender = await User.findById(req.user.id).select("name email");
    const senderLabel = sender?.name || sender?.email || "Someone";
    await Notification.create({
      user: donor.user,
      donor: donor._id,
      type: "contact_message",
      title: "New contact message",
      message: `${senderLabel} sent you a message.`,
      meta: {
        contactId: contact._id,
        requestId: relatedRequest ? relatedRequest._id : undefined,
      },
    });

    return res.status(201).json({ success: true, message: "Message sent to donor.", data: contact });
  } catch (error) {
    console.error("Contact message error:", error);
    return res.status(500).json({ success: false, message: "Server error while sending message." });
  }
});

// Get a specific contact message (owner of donor or admin).
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid contact message ID." });
    }

    const contact = await ContactMessage.findById(id)
      .populate("fromUser", "name email")
      .populate("toDonor", "user fullName");
    if (!contact) {
      return res.status(404).json({ success: false, message: "Contact message not found." });
    }

    // Only admin or the owner of the donor profile can view.
    const donorOwnerId = contact.toDonor?.user?.toString();
    if (req.user.role !== "admin" && donorOwnerId !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not authorized to view this message." });
    }

    return res.status(200).json({ success: true, message: "Contact message fetched.", data: contact });
  } catch (error) {
    console.error("Get contact message error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching contact message." });
  }
});

module.exports = router;
