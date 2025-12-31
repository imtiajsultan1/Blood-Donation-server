// Middleware that checks for a valid JWT in the Authorization header.
// On success, the decoded payload is attached to req.user for later use.
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";

    // Expecting header shape: "Bearer <token>"
    if (!authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided. Authorization denied." });
    }

    const token = authHeader.split(" ")[1];

    // Verify the token using the secret key.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("role isActive");
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found. Please log in again." });
    }

    if (user.isActive === false) {
      return res.status(403).json({ success: false, message: "Account is disabled. Contact support." });
    }

    // Attach user data to the request object for later middlewares/routes.
    req.user = { id: user._id.toString(), role: user.role, email: decoded.email };
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token. Please log in again." });
  }
};

module.exports = auth;
