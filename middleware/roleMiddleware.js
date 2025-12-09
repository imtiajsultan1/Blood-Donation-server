// Middleware that makes sure the authenticated user has the admin role.
// Use this on routes that should only be accessible to admins.
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, message: "Admin access required for this action." });
  }

  next();
};

module.exports = requireAdmin;
