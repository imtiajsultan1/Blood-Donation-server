// RequestMessage stores messages sent to the owner of a blood request.
const mongoose = require("mongoose");

const requestMessageSchema = new mongoose.Schema({
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  request: { type: mongoose.Schema.Types.ObjectId, ref: "BloodRequest", required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("RequestMessage", requestMessageSchema);
