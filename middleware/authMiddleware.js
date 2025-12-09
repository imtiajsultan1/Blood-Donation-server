// Middleware that checks for a valid JWT in the Authorization header.
// On success, the decoded payload is attached to req.user for later use.
const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
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

    // Attach user data to the request object for later middlewares/routes.
    req.user = decoded;
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token. Please log in again." });
  }
};

module.exports = auth;
