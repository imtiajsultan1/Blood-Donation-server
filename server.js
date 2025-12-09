// Main server entry point for the Blood Donation API.
// Stack: Node.js + Express + MongoDB (Mongoose).
// Make sure to create a .env file with at least:
// PORT=5000
// MONGO_URI=mongodb://localhost:27017/blood_donation
// JWT_SECRET=supersecretkey_change_this
// JWT_EXPIRES_IN=7d

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// Load environment variables from .env.
dotenv.config();

// Keep the original connection string as a fallback in case .env is missing.
// Please move credentials into .env for safety.
if (!process.env.MONGO_URI) {
  process.env.MONGO_URI = "mongodb+srv://sumaiyya:hello123@cluster0.cgylpnw.mongodb.net/?appName=Cluster0";
}

// Make sure a JWT secret exists to avoid runtime signing errors.
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing. Please set it in your .env file.");
  process.exit(1);
}

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const donorRoutes = require("./routes/donorRoutes");
const donationRoutes = require("./routes/donationRoutes");
const institutionRoutes = require("./routes/institutionRoutes");
const requestRoutes = require("./routes/requestRoutes");
const { authLimiter, searchLimiter } = require("./middleware/rateLimiter");
const contactRoutes = require("./routes/contactRoutes");
const adminRoutes = require("./routes/adminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

// Connect to MongoDB right away.
connectDB();

// Basic middlewares for JSON parsing and CORS.
app.use(cors());
app.use(express.json());

// Rate limit auth endpoints and public search.
app.use("/api/auth", authLimiter);
app.use("/api/donors/search", searchLimiter);

// Simple root route to verify the API is running.
app.get("/", (req, res) => {
  return res
    .status(200)
    .json({ success: true, message: "Blood Donation API Running..." });
});

// Mount feature routes.
app.use("/api/auth", authRoutes);
app.use("/api/donors", donorRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/institutions", institutionRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);

// Global error handler fallback (for unexpected errors).
app.use((err, req, res, next) => {
  console.error("Unexpected error:", err);
  return res.status(500).json({ success: false, message: "Internal server error." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
