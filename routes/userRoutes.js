// Admin-only user management routes.
const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const auth = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(auth, requireAdmin);

// List all users (excluding passwords).
router.get("/", async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    return res.status(200).json({ success: true, message: "Users fetched.", data: users });
  } catch (error) {
    console.error("List users error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching users." });
  }
});

// Update a user's role.
router.put("/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({ success: false, message: "Role must be admin or user." });
    }

    if (id === req.user.id && role !== "admin") {
      return res.status(400).json({ success: false, message: "You cannot remove your own admin role." });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (role === "user" && targetUser.role === "admin") {
      const otherAdmins = await User.countDocuments({
        role: "admin",
        isActive: { $ne: false },
        _id: { $ne: id },
      });
      if (otherAdmins === 0) {
        return res.status(400).json({ success: false, message: "Cannot remove the last active admin." });
      }
    }

    targetUser.role = role;
    await targetUser.save();

    await AuditLog.create({
      user: req.user.id,
      action: "update_user_role",
      targetType: "User",
      targetId: id,
      details: { role },
    });

    const responseUser = targetUser.toObject();
    delete responseUser.password;
    return res.status(200).json({ success: true, message: "User role updated.", data: responseUser });
  } catch (error) {
    console.error("Update user role error:", error);
    return res.status(500).json({ success: false, message: "Server error while updating role." });
  }
});

// Activate or deactivate a user.
router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive must be a boolean." });
    }

    if (id === req.user.id && !isActive) {
      return res.status(400).json({ success: false, message: "You cannot deactivate your own account." });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (!isActive && targetUser.role === "admin") {
      const otherAdmins = await User.countDocuments({
        role: "admin",
        isActive: { $ne: false },
        _id: { $ne: id },
      });
      if (otherAdmins === 0) {
        return res.status(400).json({ success: false, message: "Cannot deactivate the last active admin." });
      }
    }

    targetUser.isActive = isActive;
    targetUser.deactivatedAt = isActive ? null : new Date();
    await targetUser.save();

    await AuditLog.create({
      user: req.user.id,
      action: isActive ? "activate_user" : "deactivate_user",
      targetType: "User",
      targetId: id,
    });

    const responseUser = targetUser.toObject();
    delete responseUser.password;
    return res.status(200).json({ success: true, message: "User status updated.", data: responseUser });
  } catch (error) {
    console.error("Update user status error:", error);
    return res.status(500).json({ success: false, message: "Server error while updating status." });
  }
});

// Soft delete a user by deactivating the account.
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: "You cannot delete your own account." });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (targetUser.role === "admin") {
      const otherAdmins = await User.countDocuments({
        role: "admin",
        isActive: { $ne: false },
        _id: { $ne: id },
      });
      if (otherAdmins === 0) {
        return res.status(400).json({ success: false, message: "Cannot deactivate the last active admin." });
      }
    }

    targetUser.isActive = false;
    targetUser.deactivatedAt = new Date();
    await targetUser.save();

    await AuditLog.create({
      user: req.user.id,
      action: "deactivate_user",
      targetType: "User",
      targetId: id,
    });

    const responseUser = targetUser.toObject();
    delete responseUser.password;
    return res.status(200).json({ success: true, message: "User deactivated.", data: responseUser });
  } catch (error) {
    console.error("Deactivate user error:", error);
    return res.status(500).json({ success: false, message: "Server error while deactivating user." });
  }
});

module.exports = router;
