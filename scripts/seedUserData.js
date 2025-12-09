// Seed data for a specific existing user without clearing anything.
// Usage:
//   TARGET_EMAIL=imtiaj@example.com node scripts/seedUserData.js
// or:
//   node scripts/seedUserData.js imtiaj@example.com
//
// It will:
// - Find the user by email (required).
// - Ensure a donor profile exists (create if missing, update basic fields if present).
// - Ensure a few institutions exist (create small sample set if not present).
// - Create a few donations for this donor (spaced across time) and update counters.
// - Create a few blood requests for this user with mixed statuses.

const dotenv = require("dotenv");
dotenv.config();

const connectDB = require("../config/db");
const User = require("../models/User");
const Donor = require("../models/Donor");
const Institution = require("../models/Institution");
const Donation = require("../models/Donation");
const BloodRequest = require("../models/BloodRequest");

const targetEmail = process.env.TARGET_EMAIL || process.argv[2];
if (!targetEmail) {
  console.error("Please provide TARGET_EMAIL env or as first argument.");
  process.exit(1);
}

// Simple helpers.
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

const cities = ["Dhaka", "Chittagong", "Khulna", "Rajshahi", "Sylhet", "Barishal", "Rangpur", "Gazipur"];
const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const institutionsSeed = [
  { name: "Dhaka Medical College Hospital", type: "hospital", city: "Dhaka" },
  { name: "Square Hospital", type: "clinic", city: "Dhaka" },
  { name: "Chittagong Medical College", type: "hospital", city: "Chittagong" },
  { name: "Evercare Hospital", type: "clinic", city: "Dhaka" },
];

async function ensureInstitutions() {
  const existing = await Institution.find();
  const names = existing.map((i) => i.name);
  const toCreate = institutionsSeed.filter((i) => !names.includes(i.name));
  const created = [];
  for (const inst of toCreate) {
    const doc = new Institution({
      name: inst.name,
      type: inst.type,
      address: { city: inst.city, country: "Bangladesh" },
    });
    await doc.save();
    created.push(doc);
  }
  return [...existing, ...created];
}

async function ensureDonorForUser(user) {
  let donor = await Donor.findOne({ user: user._id });
  const basePayload = {
    user: user._id,
    fullName: user.name || "Demo Donor",
    email: user.email,
    phone: `01${Math.floor(100000000 + Math.random() * 899999999)}`,
    emergencyContactName: "Emergency Contact",
    emergencyContactPhone: `01${Math.floor(100000000 + Math.random() * 899999999)}`,
    bloodGroup: pick(bloodGroups),
    willingToDonate: true,
    visibility: "public",
    phoneVisibility: "registered",
    address: {
      city: pick(cities),
      country: "Bangladesh",
    },
    notes: "Auto-generated donor profile for testing.",
  };

  if (!donor) {
    donor = new Donor(basePayload);
    await donor.save();
    console.log("Created donor profile for", user.email);
  } else {
    // Update basic fields but keep totals/dates.
    Object.assign(donor, basePayload);
    await donor.save();
    console.log("Updated donor profile for", user.email);
  }
  return donor;
}

async function createDonations(donor, institutions) {
  // Create 3 donations: 150 days ago, 60 days ago, 10 days ago.
  const donationDates = [daysAgo(150), daysAgo(60), daysAgo(10)];
  const created = [];

  for (const dDate of donationDates) {
    const donation = new Donation({
      donor: donor._id,
      institution: pick(institutions)._id,
      donationDate: dDate,
      units: 1,
      location: pick(cities),
      notes: "Seeded donation record.",
    });
    await donation.save();
    created.push(donation);
  }

  // Update donor totals and lastDonationDate (most recent).
  donor.totalDonations += created.length;
  donor.lastDonationDate = donationDates[donationDates.length - 1];
  await donor.save();

  // Increment institution totals.
  for (const donation of created) {
    if (donation.institution) {
      await Institution.findByIdAndUpdate(donation.institution, { $inc: { totalDonations: 1 } });
    }
  }

  console.log(`Created ${created.length} donations for donor ${donor.fullName}`);
}

async function createRequests(user) {
  const sampleRequests = [
    {
      bloodGroup: pick(bloodGroups),
      city: pick(cities),
      hospital: "City Hospital",
      patientName: "Test Patient",
      unitsNeeded: 2,
      requiredDate: daysFromNow(3),
      contactPhone: `01${Math.floor(100000000 + Math.random() * 899999999)}`,
      status: "open",
    },
    {
      bloodGroup: pick(bloodGroups),
      city: pick(cities),
      hospital: "General Hospital",
      patientName: "Another Patient",
      unitsNeeded: 1,
      requiredDate: daysFromNow(7),
      contactPhone: `01${Math.floor(100000000 + Math.random() * 899999999)}`,
      status: "fulfilled",
    },
    {
      bloodGroup: pick(bloodGroups),
      city: pick(cities),
      hospital: "Clinic",
      patientName: "Sample Name",
      unitsNeeded: 3,
      requiredDate: daysFromNow(1),
      contactPhone: `01${Math.floor(100000000 + Math.random() * 899999999)}`,
      status: "cancelled",
    },
  ];

  const created = [];
  for (const req of sampleRequests) {
    const doc = new BloodRequest({ user: user._id, ...req });
    await doc.save();
    created.push(doc);
  }
  console.log(`Created ${created.length} blood requests for ${user.email}`);
}

async function main() {
  await connectDB();
  const user = await User.findOne({ email: targetEmail.toLowerCase() });
  if (!user) {
    console.error("User not found:", targetEmail);
    process.exit(1);
  }

  console.log("Seeding data for user:", user.email);

  const institutions = await ensureInstitutions();
  const donor = await ensureDonorForUser(user);
  await createDonations(donor, institutions);
  await createRequests(user);

  console.log("Done seeding data for user:", user.email);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
