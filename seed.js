// Simple seeding script to inject realistic dummy data.
// Run with: npm run seed
// Make sure .env has MONGO_URI and JWT_SECRET (used only for auth routes, not here).

const dotenv = require("dotenv");
dotenv.config();

const connectDB = require("./config/db");
const User = require("./models/User");
const Donor = require("./models/Donor");
const Institution = require("./models/Institution");
const BloodRequest = require("./models/BloodRequest");

// Toggle this to wipe collections before seeding.
const CLEAR_COLLECTIONS_FIRST = true;

// Helper random utilities.
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDateWithinPastDays = (days) => {
  const now = new Date();
  const past = new Date(now.getTime() - randInt(0, days) * 24 * 60 * 60 * 1000);
  return past;
};
const randomFutureDateWithinDays = (days) => {
  const now = new Date();
  const future = new Date(now.getTime() + randInt(0, days) * 24 * 60 * 60 * 1000);
  return future;
};

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const cities = ["Dhaka", "Chittagong", "Khulna", "Rajshahi", "Sylhet", "Barishal", "Rangpur", "Mymensingh"];
const hospitals = [
  "Dhaka Medical College Hospital",
  "Square Hospital",
  "United Hospital",
  "Ibn Sina Hospital",
  "Chittagong Medical College",
  "Popular Diagnostic",
  "Evercare Hospital",
];
const visibilityOptions = ["public", "registered", "admin"];
const phoneVisibilityOptions = ["public", "registered", "admin"];
const genders = ["male", "female", "other"];
const instTypes = ["hospital", "clinic", "ngo", "camp", "other"];

async function seed() {
  await connectDB();

  if (CLEAR_COLLECTIONS_FIRST) {
    await Promise.all([
      User.deleteMany({}),
      Donor.deleteMany({}),
      Institution.deleteMany({}),
      BloodRequest.deleteMany({}),
    ]);
    console.log("Cleared users, donors, institutions, blood requests.");
  }

  // Create admin.
  const admin = new User({
    name: "Admin User",
    email: "admin@demo.com",
    password: "Admin@123",
    role: "admin",
  });
  await admin.save();

  // Create regular users.
  const users = [];
  for (let i = 1; i <= 120; i++) {
    const user = new User({
      name: `User ${i}`,
      email: `user${i}@demo.com`,
      password: "User@123",
      role: "user",
    });
    await user.save();
    users.push(user);
  }
  console.log(`Created ${users.length + 1} users (including admin).`);

  // Create institutions.
  const institutions = [];
  for (let i = 0; i < 10; i++) {
    const inst = new Institution({
      name: `${pick(cities)} Health Center ${i + 1}`,
      type: pick(instTypes),
      contactPerson: `Contact ${i + 1}`,
      phone: `017${randInt(10000000, 99999999)}`,
      email: `contact${i + 1}@healthcenter.com`,
      address: {
        city: pick(cities),
        country: "Bangladesh",
      },
      totalDonations: randInt(5, 120),
    });
    await inst.save();
    institutions.push(inst);
  }
  console.log(`Created ${institutions.length} institutions.`);

  // Create donor profiles for the first 100 users.
  const donors = [];
  for (let i = 0; i < 100; i++) {
    const user = users[i];
    const visibility = pick(visibilityOptions);
    const phoneVisibility = pick(phoneVisibilityOptions);
    const willingToDonate = Math.random() > 0.1; // 90% willing.
    const hasDonation = Math.random() > 0.3; // 70% have donated before.
    const lastDonationDate = hasDonation ? randomDateWithinPastDays(200) : null;
    const totalDonations = hasDonation ? randInt(1, 6) : 0;

    const donor = new Donor({
      user: user._id,
      fullName: user.name,
      email: user.email,
      phone: `018${randInt(10000000, 99999999)}`,
      emergencyContactName: `EC ${i + 1}`,
      emergencyContactPhone: `019${randInt(10000000, 99999999)}`,
      dateOfBirth: randomDateWithinPastDays(12000), // roughly under 33 years range
      gender: pick(genders),
      bloodGroup: pick(bloodGroups),
      willingToDonate,
      visibility,
      phoneVisibility,
      address: {
        city: pick(cities),
        country: "Bangladesh",
      },
      lastDonationDate,
      totalDonations,
      notes: hasDonation ? "Regular donor" : "New donor",
    });
    await donor.save();
    donors.push(donor);
  }
  console.log(`Created ${donors.length} donors linked to users.`);

  // Create blood requests for random users (some donors, some non-donors).
  const requests = [];
  const requestOwners = [...users].sort(() => 0.5 - Math.random()).slice(0, 25);
  for (let i = 0; i < requestOwners.length; i++) {
    const owner = requestOwners[i];
    const request = new BloodRequest({
      user: owner._id,
      bloodGroup: pick(bloodGroups),
      city: pick(cities),
      hospital: pick(hospitals),
      patientName: `Patient ${i + 1}`,
      unitsNeeded: randInt(1, 4),
      requiredDate: randomFutureDateWithinDays(14), // within the next 2 weeks
      contactPhone: `016${randInt(10000000, 99999999)}`,
      status: pick(["open", "open", "fulfilled", "cancelled"]), // biased to open
    });
    await request.save();
    requests.push(request);
  }
  console.log(`Created ${requests.length} blood requests.`);

  console.log("Seeding complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
