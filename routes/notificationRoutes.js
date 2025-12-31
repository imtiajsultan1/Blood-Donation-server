// Notification routes for listing and marking read.
const express = require("express");
const auth = require("../middleware/authMiddleware");
const Notification = require("../models/Notification");

const router = express.Router();

router.use(auth);

// List notifications for current user.
router.get("/", async (req, res) => {
  try {
    const filters = { user: req.user.id, type: "request_share_info" };
    const notifs = await Notification.find(filters)
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

// Delete a notification.
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Notification.findOneAndDelete({ _id: id, user: req.user.id });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    return res.status(200).json({ success: true, message: "Notification deleted.", data: deleted });
  } catch (error) {
    console.error("Notification delete error:", error);
    return res.status(500).json({ success: false, message: "Server error while deleting notification." });
  }
});

module.exports = router;
