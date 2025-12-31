const mongoose = require("mongoose");

const requestChatSchema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: "BloodRequest", required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
  lastMessage: {
    text: { type: String },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date },
  },
  pausedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

requestChatSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("RequestChat", requestChatSchema);
