import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";

import connectDB from "../config/database";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type AuditField = {
  collection: string;
  field: string;
};

const AUDIT_FIELDS: AuditField[] = [
  { collection: "bookings", field: "status" },
  { collection: "payments", field: "status" },
  { collection: "payments", field: "refundStatus" },
  { collection: "contracts", field: "status" },
  { collection: "contracts", field: "paymentStatus" },
  { collection: "refunds", field: "status" },
  { collection: "cars", field: "status" },
];

const FORBIDDEN_LEGACY_STATUS_VALUES = {
  booking: ["PENDING", "WAITING_PAYMENT", "CONFIRMED"],
  payment: ["REFUNDED"],
  refund: ["PENDING", "FAILED", "CANCELLED"],
  car: ["HIDDEN"],
  contract: ["DRAFT"],
} as const;

async function countValues({ collection, field }: AuditField) {
  const rows = await mongoose.connection.db
    ?.collection(collection)
    .aggregate([
      {
        $group: {
          _id: { $ifNull: [`$${field}`, "<NULL>"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, _id: 1 } },
    ])
    .toArray();

  return (rows || []).map((row) => ({
    collection,
    field,
    value: String(row._id),
    count: Number(row.count || 0),
  }));
}

async function getAnomalies() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is not ready");

  return {
    paymentRefundedWithoutAmount: await db.collection("payments").countDocuments({
      status: FORBIDDEN_LEGACY_STATUS_VALUES.payment[0],
      $or: [
        { refundedAmount: { $exists: false } },
        { refundedAmount: { $lte: 0 } },
      ],
    }),
    paymentFullRefundMismatch: await db.collection("payments").countDocuments({
      refundStatus: "REFUNDED",
      $expr: {
        $lt: [{ $ifNull: ["$refundedAmount", 0] }, "$amount"],
      },
    }),
    contractPaidFullWithRemaining: await db
      .collection("contracts")
      .countDocuments({
        paymentStatus: "PAID_FULL",
        remainingAmount: { $gt: 0 },
      }),
    legacyBookingStatuses: await db.collection("bookings").countDocuments({
      status: { $in: [...FORBIDDEN_LEGACY_STATUS_VALUES.booking] },
    }),
    legacyRefundStatuses: await db.collection("refunds").countDocuments({
      status: { $in: [...FORBIDDEN_LEGACY_STATUS_VALUES.refund] },
    }),
    legacyPaymentRefundedStatus: await db.collection("payments").countDocuments({
      status: FORBIDDEN_LEGACY_STATUS_VALUES.payment[0],
    }),
    legacyCarHiddenStatus: await db.collection("cars").countDocuments({
      status: FORBIDDEN_LEGACY_STATUS_VALUES.car[0],
    }),
    legacyContractDraftStatus: await db.collection("contracts").countDocuments({
      status: FORBIDDEN_LEGACY_STATUS_VALUES.contract[0],
    }),
  };
}

async function main() {
  await connectDB();

  const groupedRows = await Promise.all(AUDIT_FIELDS.map(countValues));
  const rows = groupedRows.flat();
  const anomalies = await getAnomalies();

  console.table(rows);
  console.log("[ANOMALIES]", JSON.stringify(anomalies, null, 2));
  console.log("[READ_ONLY] No MongoDB documents were changed.");

  await mongoose.disconnect();

  if (Object.values(anomalies).some((count) => count > 0)) {
    throw new Error("Status audit detected legacy values or anomalies");
  }
}

main().catch(async (error) => {
  console.error("[FATAL]", error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exit(1);
});
