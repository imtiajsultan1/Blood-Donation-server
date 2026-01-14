// Seeder to generate donation records for export/reporting.
// Run with: node seed_donations.js (or npm run seed:donations if added).
// Requires MONGO_URI in .env.

const dotenv = require("dotenv");
dotenv.config();

const connectDB = require("./config/db");
const Donation = require("./models/Donation");
const Donor = require("./models/Donor");
const Institution = require("./models/Institution");

// Toggle these as needed.
const CLEAR_DONATIONS_FIRST = true;
const RESET_STATS = true;
const DONATION_COUNT = Number(process.env.SEED_DONATIONS_COUNT || 180);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDateWithinPastDays = (days) => {
  const now = new Date();
  const past = new Date(now.getTime() - randInt(1, days) * 24 * 60 * 60 * 1000);
  return past;
};

const cities = [
  "Dhaka",
  "Chittagong",
  "Khulna",
  "Rajshahi",
  "Sylhet",
  "Barishal",
  "Rangpur",
  "Mymensingh",
];
const noteSamples = [
  "Routine donation",
  "Emergency support",
  "Community drive",
  "Hospital camp",
  "Urgent request response",
];

async function seedDonations() {
  await connectDB();

  if (CLEAR_DONATIONS_FIRST) {
    await Donation.deleteMany({});
    console.log("Cleared donations.");
  }

  const donors = await Donor.find({ isDeleted: false });
  if (!donors.length) {
    console.error("No donors found. Run seed.js first to create donors.");
    process.exit(1);
  }

  const institutions = await Institution.find({ isDeleted: false });

  const donations = [];
  for (let i = 0; i < DONATION_COUNT; i++) {
    const donor = pick(donors);
    const institution = institutions.length ? pick(institutions) : null;
    const donationDate = randomDateWithinPastDays(365);
    const units = randInt(1, 3);
    const location = institution ? institution.name : `${pick(cities)} Donation Center`;
    const notes = pick(noteSamples);

    donations.push({
      donor: donor._id,
      institution: institution ? institution._id : undefined,
      donationDate,
      units,
      location,
      notes,
    });
  }

  await Donation.insertMany(donations);
  console.log(`Created ${donations.length} donations.`);

  if (RESET_STATS) {
    await Donor.updateMany({}, { $set: { totalDonations: 0, lastDonationDate: null } });
    await Institution.updateMany({}, { $set: { totalDonations: 0 } });

    const donorAgg = await Donation.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$donor",
          totalDonations: { $sum: 1 },
          lastDonationDate: { $max: "$donationDate" },
        },
      },
    ]);

    if (donorAgg.length) {
      await Donor.bulkWrite(
        donorAgg.map((d) => ({
          updateOne: {
            filter: { _id: d._id },
            update: { $set: { totalDonations: d.totalDonations, lastDonationDate: d.lastDonationDate } },
          },
        }))
      );
    }

    const instAgg = await Donation.aggregate([
      { $match: { isDeleted: false, institution: { $ne: null } } },
      { $group: { _id: "$institution", totalDonations: { $sum: 1 } } },
    ]);

    if (instAgg.length) {
      await Institution.bulkWrite(
        instAgg.map((i) => ({
          updateOne: {
            filter: { _id: i._id },
            update: { $set: { totalDonations: i.totalDonations } },
          },
        }))
      );
    }

    console.log("Updated donor and institution totals.");
  }

  console.log("Donation seeding complete.");
  process.exit(0);
}

seedDonations().catch((err) => {
  console.error("Donation seeding failed:", err);
  process.exit(1);
});
