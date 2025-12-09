// Notification routes for listing and marking read.
const express = require("express");
const auth = require("../middleware/authMiddleware");
const Notification = require("../models/Notification");

const router = express.Router();

router.use(auth);

// List notifications for current user.
router.get("/", async (req, res) => {
  try {
    const notifs = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);
    return res.status(200).json({ success: true, message: "Notifications fetched.", data: notifs });
  } catch (error) {
    console.error("Notification fetch error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching notifications." });
  }
});

// Mark a notification as read.
router.post("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await Notification.findOneAndUpdate({ _id: id, user: req.user.id }, { read: true }, { new: true });
    if (!notif) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    return res.status(200).json({ success: true, message: "Notification marked as read.", data: notif });
  } catch (error) {
    console.error("Notification mark error:", error);
    return res.status(500).json({ success: false, message: "Server error while updating notification." });
  }
});

module.exports = router;
