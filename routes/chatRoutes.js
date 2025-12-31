// Chat routes for request-based conversations (inbox + messages).
const express = require("express");
const mongoose = require("mongoose");
const RequestChat = require("../models/RequestChat");
const RequestMessage = require("../models/RequestMessage");
const auth = require("../middleware/authMiddleware");
const { messageLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.use(auth);

const ensureMember = async (chatId, userId) => {
  if (!mongoose.isValidObjectId(chatId)) {
    return { error: { status: 400, message: "Invalid chat ID." } };
  }
  const chat = await RequestChat.findById(chatId)
    .populate("participants", "name email role")
    .populate("request", "bloodGroup city unitsNeeded requiredDate status");
  if (!chat) {
    return { error: { status: 404, message: "Chat not found." } };
  }
  const isMember = chat.participants.some((p) => p._id.toString() === userId);
  if (!isMember) {
    return { error: { status: 403, message: "Not authorized for this chat." } };
  }
  return { chat };
};

// List inbox chats for the current user.
router.get("/", async (req, res) => {
  try {
    const chats = await RequestChat.find({ participants: req.user.id })
      .populate("participants", "name email role")
      .populate("request", "bloodGroup city unitsNeeded requiredDate status")
      .sort({ updatedAt: -1 });
    return res.status(200).json({ success: true, message: "Chats fetched.", data: chats });
  } catch (error) {
    console.error("List chats error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching chats." });
  }
});

// List messages for a chat.
router.get("/:id/messages", async (req, res) => {
  try {
    const { chat, error } = await ensureMember(req.params.id, req.user.id);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }

    const other = chat.participants.find((p) => p._id.toString() !== req.user.id);
    const messages = await RequestMessage.find({
      request: chat.request?._id,
      $or: [
        { fromUser: req.user.id, toUser: other?._id },
        { fromUser: other?._id, toUser: req.user.id },
      ],
    })
      .populate("fromUser", "name email")
      .populate("toUser", "name email")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      message: "Messages fetched.",
      data: { chat, messages },
    });
  } catch (error) {
    console.error("List messages error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching messages." });
  }
});

// Send a message in a chat.
router.post("/:id/messages", messageLimiter, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.toString().trim().length === 0) {
      return res.status(400).json({ success: false, message: "Message is required." });
    }

    const { chat, error } = await ensureMember(req.params.id, req.user.id);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }

    if (chat.pausedBy && chat.pausedBy.length > 0) {
      return res.status(403).json({
        success: false,
        message: "Chat is paused. Ask the other participant to resume before messaging.",
      });
    }

    const other = chat.participants.find((p) => p._id.toString() !== req.user.id);
    const msg = await RequestMessage.create({
      fromUser: req.user.id,
      toUser: other?._id,
      request: chat.request?._id,
      message: message.toString().trim(),
    });

    chat.lastMessage = {
      text: msg.message,
      fromUser: req.user.id,
      createdAt: msg.createdAt,
    };
    chat.updatedAt = new Date();
    await chat.save();

    return res.status(201).json({ success: true, message: "Message sent.", data: msg });
  } catch (error) {
    console.error("Send chat message error:", error);
    return res.status(500).json({ success: false, message: "Server error while sending message." });
  }
});

// Pause a chat (either participant can pause).
router.post("/:id/pause", async (req, res) => {
  try {
    const { chat, error } = await ensureMember(req.params.id, req.user.id);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }

    const alreadyPaused = chat.pausedBy?.some((id) => id.toString() === req.user.id);
    if (!alreadyPaused) {
      chat.pausedBy = [...(chat.pausedBy || []), req.user.id];
      chat.updatedAt = new Date();
      await chat.save();
    }

    return res.status(200).json({ success: true, message: "Chat paused.", data: chat });
  } catch (error) {
    console.error("Pause chat error:", error);
    return res.status(500).json({ success: false, message: "Server error while pausing chat." });
  }
});

// Resume a chat (remove pause by current user).
router.post("/:id/unpause", async (req, res) => {
  try {
    const { chat, error } = await ensureMember(req.params.id, req.user.id);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }

    chat.pausedBy = (chat.pausedBy || []).filter((id) => id.toString() !== req.user.id);
    chat.updatedAt = new Date();
    await chat.save();

    return res.status(200).json({ success: true, message: "Chat resumed.", data: chat });
  } catch (error) {
    console.error("Resume chat error:", error);
    return res.status(500).json({ success: false, message: "Server error while resuming chat." });
  }
});

module.exports = router;
