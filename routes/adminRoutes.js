// Admin utilities: export data (CSV-ish) and view audit logs.
const express = require("express");
const Donor = require("../models/Donor");
const Donation = require("../models/Donation");
const AuditLog = require("../models/AuditLog");
const auth = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(auth, requireAdmin);

// Export donors as CSV (basic fields).
router.get("/export/donors", async (req, res) => {
  try {
    const donors = await Donor.find({ isDeleted: false });
    const header = [
      "id",
      "fullName",
      "email",
      "phone",
      "bloodGroup",
      "city",
      "willingToDonate",
      "visibility",
      "phoneVisibility",
      "totalDonations",
      "lastDonationDate",
    ];
    const rows = donors.map((d) => [
      d._id,
      d.fullName,
      d.email || "",
      d.phone,
      d.bloodGroup,
      d.address?.city || "",
      d.willingToDonate,
      d.visibility,
      d.phoneVisibility,
      d.totalDonations,
      d.lastDonationDate ? d.lastDonationDate.toISOString() : "",
    ]);

    const csv = [header.join(",")]
      .concat(rows.map((r) => r.join(",")))
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=donors.csv");
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Export donors error:", error);
    return res.status(500).json({ success: false, message: "Server error while exporting donors." });
  }
});

// Export donations as CSV.
router.get("/export/donations", async (req, res) => {
  try {
    const donations = await Donation.find({ isDeleted: false })
      .populate("donor", "fullName bloodGroup")
      .populate("institution", "name");

    const header = ["id", "donor", "bloodGroup", "institution", "units", "date", "location"];
    const rows = donations.map((d) => [
      d._id,
      d.donor?.fullName || "",
      d.donor?.bloodGroup || "",
      d.institution?.name || "",
      d.units || 1,
      d.donationDate ? d.donationDate.toISOString() : "",
      d.location || "",
    ]);

    const csv = [header.join(",")]
      .concat(rows.map((r) => r.join(",")))
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=donations.csv");
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Export donations error:", error);
    return res.status(500).json({ success: false, message: "Server error while exporting donations." });
  }
});

// View audit logs (latest 200).
router.get("/audit", async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200).populate("user", "email role");
    return res.status(200).json({ success: true, message: "Audit logs fetched.", data: logs });
  } catch (error) {
    console.error("Audit fetch error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching audit logs." });
  }
});

module.exports = router;
