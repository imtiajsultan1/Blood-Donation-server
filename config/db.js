// Simple MongoDB connection helper using Mongoose.
// Make sure you have a .env file with MONGO_URI set.
// Example:
// MONGO_URI=mongodb://localhost:27017/blood_donation
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Connect to MongoDB using the URI from environment variables.
    // Modern Mongoose (v8) no longer needs useNewUrlParser/useUnifiedTopology options.
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    // Exit the process if we cannot connect.
    process.exit(1);
  }
};

module.exports = connectDB;
