// Chat routes for request-based conversations (inbox + messages).
const express = require("express");
const mongoose = require("mongoose");
const RequestChat = require("../models/RequestChat");
const RequestMessage = require("../models/RequestMessage");
const ContactMessage = require("../models/ContactMessage");
const Donor = require("../models/Donor");
const Notification = require("../models/Notification");
const User = require("../models/User");
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
    const requestChats = await RequestChat.find({ participants: req.user.id })
      .populate("participants", "name email role")
      .populate("request", "bloodGroup city unitsNeeded requiredDate status")
      .sort({ updatedAt: -1 });

    const sender = await User.findById(req.user.id).select("name email role");
    const contactMessages = await ContactMessage.find({ fromUser: req.user.id })
      .sort({ createdAt: -1 })
      .populate({
        path: "toDonor",
        select: "fullName bloodGroup address user",
        populate: { path: "user", select: "name email role" },
      });

    const contactChatMap = new Map();
    for (const msg of contactMessages) {
      const donorId = msg.toDonor?._id?.toString();
      if (!donorId || contactChatMap.has(donorId)) {
        continue;
      }
      const donorUser = msg.toDonor?.user;
      const chatId = `contact_${req.user.id}_${donorId}`;
      contactChatMap.set(donorId, {
        _id: chatId,
        type: "contact",
        participants: [
          { _id: req.user.id, name: sender?.name, email: sender?.email, role: sender?.role },
          donorUser ? { _id: donorUser._id, name: donorUser.name, email: donorUser.email, role: donorUser.role } : null,
        ].filter(Boolean),
        donor: {
          _id: msg.toDonor._id,
          fullName: msg.toDonor.fullName,
          bloodGroup: msg.toDonor.bloodGroup,
          city: msg.toDonor.address?.city,
        },
        lastMessage: {
          text: msg.message,
          fromUser: msg.fromUser,
          createdAt: msg.createdAt,
        },
        pausedBy: [],
        createdAt: msg.createdAt,
        updatedAt: msg.createdAt,
      });
    }

    const chats = [
      ...requestChats.map((c) => ({ ...c.toObject(), type: "request" })),
      ...Array.from(contactChatMap.values()),
    ].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return res.status(200).json({ success: true, message: "Chats fetched.", data: chats });
  } catch (error) {
    console.error("List chats error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching chats." });
  }
});

// List messages for a chat.
router.get("/:id/messages", async (req, res) => {
  try {
    if (req.params.id.startsWith("contact_")) {
      const parts = req.params.id.split("_");
      const fromUserId = parts[1];
      const donorId = parts[2];

      if (!mongoose.isValidObjectId(fromUserId) || !mongoose.isValidObjectId(donorId)) {
        return res.status(400).json({ success: false, message: "Invalid contact chat ID." });
      }
      if (fromUserId !== req.user.id) {
        return res.status(403).json({ success: false, message: "Not authorized for this chat." });
      }

      const donor = await Donor.findById(donorId).populate("user", "name email role");
      if (!donor) {
        return res.status(404).json({ success: false, message: "Donor not found." });
      }

      const sender = await User.findById(req.user.id).select("name email role");
      const messages = await ContactMessage.find({ fromUser: fromUserId, toDonor: donorId })
        .sort({ createdAt: 1 })
        .populate("fromUser", "name email");

      const chat = {
        _id: req.params.id,
        type: "contact",
        participants: [
          { _id: req.user.id, name: sender?.name, email: sender?.email, role: sender?.role },
          donor.user ? { _id: donor.user._id, name: donor.user.name, email: donor.user.email, role: donor.user.role } : null,
        ].filter(Boolean),
        donor: {
          _id: donor._id,
          fullName: donor.fullName,
          bloodGroup: donor.bloodGroup,
          city: donor.address?.city,
        },
        lastMessage: messages.length
          ? {
              text: messages[messages.length - 1].message,
              fromUser: messages[messages.length - 1].fromUser,
              createdAt: messages[messages.length - 1].createdAt,
            }
          : null,
        pausedBy: [],
        updatedAt: messages.length ? messages[messages.length - 1].createdAt : new Date(0),
      };

      return res.status(200).json({
        success: true,
        message: "Messages fetched.",
        data: { chat, messages },
      });
    }

    const { chat, error } = await ensureMember(req.params.id, req.user.id);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }

    const other = chat.participants.find((p) => p._id.toString() !== req.user.id);
    const messageFilters = { request: chat.request?._id };
    if (other?._id) {
      messageFilters.$or = [
        { fromUser: req.user.id, toUser: other._id },
        { fromUser: other._id, toUser: req.user.id },
      ];
    } else {
      messageFilters.$or = [{ fromUser: req.user.id }, { toUser: req.user.id }];
    }
    const messages = await RequestMessage.find(messageFilters)
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

    if (req.params.id.startsWith("contact_")) {
      const parts = req.params.id.split("_");
      const fromUserId = parts[1];
      const donorId = parts[2];
      const cleanMessage = message.toString().trim();

      if (!mongoose.isValidObjectId(fromUserId) || !mongoose.isValidObjectId(donorId)) {
        return res.status(400).json({ success: false, message: "Invalid contact chat ID." });
      }
      if (fromUserId !== req.user.id) {
        return res.status(403).json({ success: false, message: "Not authorized to send in this chat." });
      }

      const donor = await Donor.findById(donorId);
      if (!donor) {
        return res.status(404).json({ success: false, message: "Donor not found." });
      }
      if (donor.allowRequestContact === false) {
        return res.status(403).json({ success: false, message: "This donor is not accepting contact requests." });
      }

      const msg = await ContactMessage.create({
        fromUser: req.user.id,
        toDonor: donorId,
        message: cleanMessage,
      });

      await Notification.create({
        user: donor.user,
        donor: donor._id,
        type: "contact_message",
        title: "New contact message",
        message: "You received a new contact message.",
        meta: { contactId: msg._id },
      });

      return res.status(201).json({ success: true, message: "Message sent.", data: msg });
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
    if (!other?._id) {
      return res.status(400).json({ success: false, message: "Chat participants are invalid." });
    }
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

    if (other?._id) {
      await Notification.create({
        user: other._id,
        type: "chat_message",
        title: "New inbox message",
        message: "You received a new message in your inbox.",
        meta: {
          requestId: chat.request?._id,
          requestMessageId: msg._id,
          chatId: chat._id,
        },
      });
    }

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
