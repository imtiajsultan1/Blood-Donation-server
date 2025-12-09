You are an assistant generating a COMPLETE backend for a real-world style blood donation & donor management system.

❗IMPORTANT STYLE RULES
- Use: Node.js + Express + MongoDB (with Mongoose).
- Use CommonJS syntax: `const express = require("express")`, `module.exports = ...`.
- DO NOT use `import`/`export` or TypeScript.
- Code must be beginner-friendly, with MANY comments.
- Avoid advanced patterns (no classes, no complex FP, no decorators).
- Use simple functions, clear variable names, and small files.
- Handle errors cleanly with `try/catch` and proper HTTP status codes.
- All responses are JSON with `{ success, message, data }` style where appropriate.

---

## 1. PROJECT PURPOSE

Build a backend API for a **Blood Donation & Donor Management System** that can realistically be used in a small organization (e.g., university, local club, NGO).

Core ideas:

- Users (admins and normal users) can register and log in.
- Donors can be registered with detailed info (contact, location, emergency contact, willingness to donate, blood group, etc.).
- Donor eligibility is tracked:
  - A donor is **not allowed to donate** if they donated within the last **3 months (90 days)**.
- Donation history is recorded.
- Institutions (e.g., hospitals, organizations) are tracked and ranked by number of donations.
- Donors can be searched by blood group and location.
- Backend will be consumed by a React + Tailwind frontend.

This project is **educational**, not a complete medical/regulatory system, but it should be structured cleanly and realistically.

---

## 2. TECH STACK & SETUP

- Node.js (LTS)
- Express.js
- MongoDB with Mongoose
- JWT for authentication
- bcrypt for password hashing
- dotenv for environment variables
- cors for CORS handling

### Required npm packages

Generate code assuming these packages are installed:

```bash
npm install express mongoose bcrypt jsonwebtoken cors dotenv





. FOLDER STRUCTURE

Generate the backend using this structure:

backend/
│── server.js
│── package.json
│── .env (not committed, example in code comments)
│
├── config/
│    └── db.js
│
├── middleware/
│    ├── authMiddleware.js   # verifies JWT and attaches user to req
│    └── roleMiddleware.js   # optional: check admin role
│
├── models/
│    ├── User.js
│    ├── Donor.js
│    ├── Institution.js
│    └── Donation.js
│
└── routes/
     ├── authRoutes.js
     ├── donorRoutes.js
     ├── donationRoutes.js
     └── institutionRoutes.js


Each file should be fully implemented with clear comments.


4. ENVIRONMENT VARIABLES

Assume a .env file like:

PORT=5000
MONGO_URI=mongodb://localhost:27017/blood_donation
JWT_SECRET=supersecretkey_change_this
JWT_EXPIRES_IN=7d


server.js must load these using dotenv.config().


5. DATA MODELS (Mongoose Schemas)
5.1 User model (models/User.js)

Represents system users (admin + normal users).

Fields:

name (String, required)

email (String, required, unique, lowercase)

password (String, required, hashed with bcrypt)

role (String, enum: ["admin", "user"], default: "user")

createdAt (Date, default: now)

Behavior:

Before saving, hash password if modified.

A method (or utility function) to compare passwords.

5.2 Donor model (models/Donor.js)

Represents a blood donor. May or may not be linked to a user login account (keep it simple: no relation required, but optional).

Fields:

fullName (String, required)

email (String, optional, unique if present)

phone (String, required)

emergencyContactName (String, required)

emergencyContactPhone (String, required)

dateOfBirth (Date, optional but recommended)

gender (String, enum: ["male", "female", "other"], optional)

bloodGroup (String, required, enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])

willingToDonate (Boolean, default: true)

address (subdocument):

country (String, default: "Bangladesh" or generic)

division or state (String)

city (String)

area (String)

postalCode (String)

lastDonationDate (Date, optional)

totalDonations (Number, default: 0)

notes (String, optional)

createdAt (Date, default: now)

updatedAt (Date, default: now)

Add a method or helper function to calculate if donor is currently eligible:

Rule: donor is eligible if:

willingToDonate is true

AND either lastDonationDate is null

OR currentDate - lastDonationDate >= 90 days

5.3 Institution model (models/Institution.js)

Represents hospitals, clinics, organizations, or blood camps.

Fields:

name (String, required, unique)

type (String, enum: ["hospital", "clinic", "ngo", "camp", "other"], default: "other")

contactPerson (String, optional)

phone (String, optional)

email (String, optional)

address (subdocument similar to Donor)

totalDonations (Number, default: 0) // updated from donations

createdAt (Date, default: now)

5.4 Donation model (models/Donation.js)

Represents a single donation event.

Fields:

donor (ObjectId, ref: "Donor", required)

institution (ObjectId, ref: "Institution", optional but recommended)

donationDate (Date, required)

units (Number, default: 1) // how many bags or units donated

location (String, optional; e.g., hospital name or city)

notes (String, optional)

createdAt (Date, default: now)

Behavior:

When a new donation is created:

Update donor's lastDonationDate to this donationDate.

Increment donor's totalDonations.

If institution is present, increment institution's totalDonations.

Must validate donor eligibility:

If donor donated within last 90 days, reject with an error message.

6. AUTHENTICATION (JWT)
6.1 Middleware: authMiddleware.js

Function auth:

Reads Authorization header: "Bearer <token>".

If no token, send 401.

Verify JWT using JWT_SECRET.

Attach decoded user info to req.user.

If invalid/expired, send 401 or 400.

6.2 Middleware: roleMiddleware.js

Function requireAdmin:

Uses req.user.role.

If role is not "admin", return 403.

6.3 Routes: authRoutes.js

Base path in server.js: /api/auth.

Endpoints:

POST /register

Body: { name, email, password }

Create new user with role "user" by default.

Hash password with bcrypt.

If email already exists, return 400.

On success, return JWT token + basic user info.

POST /login

Body: { email, password }

Find user by email.

Compare passwords with bcrypt.

If valid, sign JWT with payload { id, email, role }.

Return { success, token, user }.

GET /me (protected)

Use auth middleware.

Return logged-in user's info (without password).

JWT:

Sign tokens with JWT_SECRET and expiration JWT_EXPIRES_IN.

Use simple payload; no sensitive data.

7. DONOR MANAGEMENT ROUTES (donorRoutes.js)

Base path: /api/donors.

Use auth for all donor routes. Some routes (like delete) require admin.

Endpoints:

POST / (Create donor)

Protected (user or admin).

Body includes donor info:

fullName, phone, bloodGroup, address, emergencyContact, willingToDonate, etc.

Validate required fields.

Save new donor.

Return created donor.

GET / (List donors)

Protected.

Optional query params:

bloodGroup

city

willing (true/false)

Implement simple filtering:

If bloodGroup is provided, filter by bloodGroup.

If city provided, filter by address.city (case-insensitive if possible).

Return list of donors (paginated if you want, but keep it simple first).

GET /:id (Get donor by id)

Protected.

Return donor object or 404.

PUT /:id (Update donor)

Protected.

Allow updating fields like name, contact info, blood group, address, willingToDonate.

Update updatedAt.

DELETE /:id (Delete donor)

Admin only (use requireAdmin).

Simple delete or soft-delete (you may choose to permanently delete to keep it simple).

GET /:id/eligibility (Check donor eligibility)

Protected.

Reads donor’s lastDonationDate and willingToDonate.

Rule:

If willingToDonate is false → not eligible.

Else if no lastDonationDate → eligible.

Else if difference between today and lastDonationDate >= 90 days → eligible.

Else → not eligible, also return remaining days until eligible.

Response example:

{
  "success": true,
  "eligible": false,
  "reason": "Donated too recently",
  "daysUntilEligible": 34
}

8. DONATION HISTORY ROUTES (donationRoutes.js)

Base path: /api/donations.

Endpoints:

POST / (Record donation)

Protected.

Body: { donorId, institutionId (optional), donationDate (optional), units, location, notes }.

If donationDate not provided, use new Date().

Before saving:

Load donor.

Validate eligibility with the 90-day rule.

If NOT eligible, return 400 with message like "Donor is not eligible to donate yet. Please wait X more days."

If eligible:

Create donation.

Update donor: lastDonationDate and totalDonations.

If institutionId present:

Increment institution's totalDonations.

Return created donation.

GET / (List all donations)

Protected.

Optional query filters:

donorId

institutionId

fromDate

toDate

Populate donor (fullName, bloodGroup) and institution (name).

Return filtered list.

GET /donor/:donorId (Donation history for a donor)

Protected.

Return donations sorted by date (newest first).

9. INSTITUTION ROUTES (institutionRoutes.js)

Base path: /api/institutions.

Endpoints:

POST / (Create institution)

Admin only.

Body: { name, type, contactPerson, phone, email, address }

Return created institution.

GET / (List institutions)

Protected.

Return all institutions.

GET /ranking (Institution ranking by total donations)

Protected.

Use aggregation or sort by totalDonations descending.

Response example:

[
  { "name": "Dhaka Medical College Hospital", "totalDonations": 120 },
  { "name": "XYZ Clinic", "totalDonations": 45 }
]

10. SERVER SETUP (server.js)

Import required packages.

Load environment variables.

Connect to MongoDB using connectDB from config/db.js.

Enable CORS and express.json().

Mount routes:

/api/auth

/api/donors

/api/donations

/api/institutions

Add a simple root route GET / that returns "Blood Donation API Running...".

Start server on process.env.PORT with console log.

11. CODE QUALITY & COMMENTS

Throughout all files:

Add clear comments explaining what each function, route, and model does.

Prefer simple async/await over .then().

Handle all common errors (missing fields, invalid IDs, not found, etc.).

Use HTTP status codes properly:

200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Server Error.

Make everything easy to read for a beginner learning Node + Express + MongoDB + JWT.

END OF SPEC.


---

If you want, next I can also give you a **matching frontend prompt** for React + Tailwind that works nicely with this backend (pages, forms, API calls, etc.).
::contentReference[oaicite:0]{index=0}