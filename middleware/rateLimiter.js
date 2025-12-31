// Simple rate limiters for auth and public endpoints.
const rateLimit = require("express-rate-limit");

// Limit heavy or brute-force prone routes.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { success: false, message: "Too many requests. Please try again later." },
});

// Public search limiter to reduce abuse.
const searchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100,
  message: { success: false, message: "Too many searches. Please slow down." },
});

// Chat/message limiter to reduce spam.
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { success: false, message: "Too many messages. Please slow down." },
});

module.exports = { authLimiter, searchLimiter, messageLimiter };
