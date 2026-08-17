import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";

import connectDB from "../config/database";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  await connectDB();

  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("MongoDB connection is not ready");
  }

  const businesses = await db
    .collection("businesses")
    .find({})
    .project({
      _id: 1,
      userId: 1,
      businessName: 1,
      isDeleted: 1,
    })
    .toArray();

  const businessUsers = await db
    .collection("users")
    .find({ role: "BUSINESS" })
    .project({
      _id: 1,
      name: 1,
      email: 1,
      role: 1,
    })
    .toArray();

  console.log("\n===== BUSINESS REMOVAL AUDIT =====");

  console.log("\nBusiness documents:", businesses.length);
  console.log("Users role BUSINESS:", businessUsers.length);

  console.log("\n--- BUSINESS -> USER mapping ---");

  for (const business of businesses) {
    const user = business.userId
      ? await db.collection("users").findOne(
          { _id: business.userId },
          {
            projection: {
              name: 1,
              email: 1,
              role: 1,
            },
          },
        )
      : null;

    console.log({
      businessId: String(business._id),
      businessName: business.businessName,
      userId: business.userId ? String(business.userId) : null,
      userExists: Boolean(user),
      userRole: user?.role || null,
      userEmail: user?.email || null,
    });
  }

const ownerCollections = [
  "cars",
  "bookings",
  "contracts",
  "bookingextensions",
  "extracharges",
  "returninspections",
  "refunds",
  "reviews",
];

  console.log("\n--- Documents using BUSINESS ownership ---");

  for (const collectionName of ownerCollections) {
    const collection = db.collection(collectionName);

    const count = await collection.countDocuments({
      $or: [
        { ownerType: "BUSINESS" },
        { ownerModel: "Business" },
        { businessId: { $exists: true, $ne: null } },
      ],
    });

    console.log(`${collectionName}: ${count}`);
  }

  console.log("\n--- BUSINESS role snapshots ---");

  const roleChecks = [
    {
      collection: "bookings",
      query: { cancelledByRole: "BUSINESS" },
    },
    {
      collection: "payments",
      query: { confirmedByRole: "BUSINESS" },
    },
    {
      collection: "refunds",
      query: {
        $or: [
          { requestedByRole: "BUSINESS" },
          { cancelledByRole: "BUSINESS" },
        ],
      },
    },
    {
      collection: "notifications",
      query: {
        $or: [
          { recipientRole: "BUSINESS" },
          { actorRole: "BUSINESS" },
        ],
      },
    },
    {
      collection: "extracharges",
      query: { confirmedByRole: "BUSINESS" },
    },
    {
      collection: "cars",
      query: {
        $or: [
          { lastLocationUpdatedByRole: "BUSINESS" },
          { "locationHistory.updatedByRole": "BUSINESS" },
          { "approvalSubmission.submittedByRole": "BUSINESS" },
        ],
      },
    },
  ];

  for (const item of roleChecks) {
    const count = await db
      .collection(item.collection)
      .countDocuments(item.query);

    console.log(`${item.collection}: ${count}`);
  }

  console.log("\n[READ ONLY] Không có document nào bị thay đổi.");
  console.log("\n===== PER BUSINESS DEPENDENCY AUDIT =====");

for (const business of businesses) {
  const businessId = business._id;

  const user = business.userId
    ? await db.collection("users").findOne(
        { _id: business.userId },
        {
          projection: {
            _id: 1,
            name: 1,
            email: 1,
            role: 1,
          },
        },
      )
    : null;

  const carsCount = await db.collection("cars").countDocuments({
    $or: [
      { ownerId: businessId },
      { businessId: businessId },
    ],
  });

  const bookingsCount = await db.collection("bookings").countDocuments({
    $or: [
      { ownerId: businessId },
      { businessId: businessId },
    ],
  });

  const contractsCount = await db.collection("contracts").countDocuments({
    $or: [
      { ownerId: businessId },
      { businessId: businessId },
    ],
  });
  const extensionsCount = await db
  .collection("bookingextensions")
  .countDocuments({
    $or: [
      { ownerId: businessId },
      { businessId: businessId },
    ],
  });

const refundsOwnerCount = await db
  .collection("refunds")
  .countDocuments({
    $or: [
      { ownerId: businessId },
      { businessId: businessId },
    ],
  });

  const extraChargesCount = await db
    .collection("extracharges")
    .countDocuments({
      ownerId: businessId,
    });

  const returnInspectionsCount = await db
    .collection("returninspections")
    .countDocuments({
      ownerId: businessId,
    });

  const reviewsCount = await db.collection("reviews").countDocuments({
    ownerId: businessId,
  });

  console.log("\n----------------------------------------");

  console.log({
    businessName: business.businessName,
    businessId: String(businessId),

    linkedUserId: business.userId
      ? String(business.userId)
      : null,

    linkedUserExists: Boolean(user),

    linkedUserEmail: user?.email || null,
    linkedUserRole: user?.role || null,
dependencies: {
  cars: carsCount,
  bookings: bookingsCount,
  contracts: contractsCount,
  bookingextensions: extensionsCount,
  refunds: refundsOwnerCount,
  extracharges: extraChargesCount,
  returninspections: returnInspectionsCount,
  reviews: reviewsCount,
},
  });
}

console.log("\n===== BUSINESS USERS AUDIT =====");

for (const user of businessUsers) {
  const linkedBusiness = await db.collection("businesses").findOne(
    {
      userId: user._id,
    },
    {
      projection: {
        _id: 1,
        businessName: 1,
        userId: 1,
      },
    },
  );

  console.log({
    userId: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,

    hasBusinessDocument: Boolean(linkedBusiness),

    businessId: linkedBusiness
      ? String(linkedBusiness._id)
      : null,

    businessName: linkedBusiness?.businessName || null,
  });
}
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[FATAL]", error);
  await mongoose.disconnect();
  process.exit(1);
});