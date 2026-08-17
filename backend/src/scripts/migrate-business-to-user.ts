import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";

import connectDB from "../config/database";

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const APPLY = process.argv.includes("--apply");

type BusinessMap = {
  businessId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  businessName?: string;
};

async function main() {
  await connectDB();

  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("MongoDB connection is not ready");
  }

  console.log("\n=======================================");
  console.log(" BUSINESS -> USER MIGRATION");
  console.log("=======================================");

  console.log(
    APPLY
      ? "\n⚠ APPLY MODE - DATABASE SẼ ĐƯỢC THAY ĐỔI"
      : "\n✓ DRY RUN - KHÔNG THAY ĐỔI DATABASE",
  );

  // =====================================================
  // 1. Tạo mapping Business._id -> User._id
  // =====================================================

  const businesses = await db
    .collection("businesses")
    .find({})
    .project({
      _id: 1,
      userId: 1,
      businessName: 1,
    })
    .toArray();

  const mappings: BusinessMap[] = [];

  console.log("\n===== BUSINESS -> USER MAPPING =====");

  for (const business of businesses) {
    if (!business.userId) {
      console.log(
        `[SKIP] ${business.businessName || business._id}: không có userId`,
      );
      continue;
    }

    const user = await db.collection("users").findOne({
      _id: business.userId,
    });

    if (!user) {
      console.log(
        `[ORPHAN] ${business.businessName || business._id} -> User không tồn tại`,
      );

      continue;
    }

    mappings.push({
      businessId: business._id as mongoose.Types.ObjectId,
      userId: business.userId as mongoose.Types.ObjectId,
      businessName: business.businessName,
    });

    console.log(
      `[OK] ${business.businessName || business._id}: ${business._id} -> ${business.userId}`,
    );
  }

  console.log(`\nValid mappings: ${mappings.length}`);

  if (mappings.length === 0) {
    throw new Error("Không tìm thấy Business -> User mapping hợp lệ");
  }

  // =====================================================
  // 2. Chuyển ownership
  //
  // Giai đoạn này:
  //
  // ownerId    -> User._id
  // ownerType  -> USER
  // ownerModel -> User
  //
  // CHƯA XÓA businessId
  // =====================================================

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

  console.log("\n===== OWNERSHIP MIGRATION =====");

  for (const mapping of mappings) {
    console.log(
      `\n--- ${mapping.businessName || String(mapping.businessId)} ---`,
    );

    for (const collectionName of ownerCollections) {
      const collection = db.collection(collectionName);

      const filter = {
        $or: [
          {
            ownerId: mapping.businessId,
          },
          {
            businessId: mapping.businessId,
            ownerType: "BUSINESS",
          },
        ],
      };

      const count = await collection.countDocuments(filter);

      console.log(`${collectionName}: ${count}`);

      if (APPLY && count > 0) {
        const result = await collection.updateMany(filter, {
          $set: {
            ownerId: mapping.userId,
            ownerType: "USER",
            ownerModel: "User",
          },
        });

        console.log(`  updated: ${result.modifiedCount}`);
      }
    }
  }

  // =====================================================
  // 3. BUSINESS user -> USER
  // =====================================================

  const businessUserCount = await db
    .collection("users")
    .countDocuments({
      role: "BUSINESS",
    });

  console.log("\n===== USER ROLE =====");
  console.log(`Users BUSINESS -> USER: ${businessUserCount}`);

  if (APPLY && businessUserCount > 0) {
    const result = await db.collection("users").updateMany(
      {
        role: "BUSINESS",
      },
      {
        $set: {
          role: "USER",
        },
      },
    );

    console.log(`updated users: ${result.modifiedCount}`);
  }

  // =====================================================
  // 4. BOOKING snapshot role
  // =====================================================

  const bookingRoleCount = await db
    .collection("bookings")
    .countDocuments({
      cancelledByRole: "BUSINESS",
    });

  console.log("\n===== BOOKING ROLE SNAPSHOT =====");
  console.log(`cancelledByRole: ${bookingRoleCount}`);

  if (APPLY && bookingRoleCount > 0) {
    await db.collection("bookings").updateMany(
      {
        cancelledByRole: "BUSINESS",
      },
      {
        $set: {
          cancelledByRole: "USER",
        },
      },
    );
  }

  // =====================================================
  // 5. PAYMENT snapshot role
  // =====================================================

  const paymentRoleCount = await db
    .collection("payments")
    .countDocuments({
      confirmedByRole: "BUSINESS",
    });

  console.log("\n===== PAYMENT ROLE SNAPSHOT =====");
  console.log(`confirmedByRole: ${paymentRoleCount}`);

  if (APPLY && paymentRoleCount > 0) {
    await db.collection("payments").updateMany(
      {
        confirmedByRole: "BUSINESS",
      },
      {
        $set: {
          confirmedByRole: "USER",
        },
      },
    );
  }

  // =====================================================
  // 6. EXTRA CHARGE snapshot role
  // =====================================================

  const extraChargeRoleCount = await db
    .collection("extracharges")
    .countDocuments({
      confirmedByRole: "BUSINESS",
    });

  console.log("\n===== EXTRA CHARGE ROLE SNAPSHOT =====");
  console.log(`confirmedByRole: ${extraChargeRoleCount}`);

  if (APPLY && extraChargeRoleCount > 0) {
    await db.collection("extracharges").updateMany(
      {
        confirmedByRole: "BUSINESS",
      },
      {
        $set: {
          confirmedByRole: "USER",
        },
      },
    );
  }

  // =====================================================
  // 7. REFUND snapshot roles
  // =====================================================

  const refundRequestedCount = await db
    .collection("refunds")
    .countDocuments({
      requestedByRole: "BUSINESS",
    });

  const refundCancelledCount = await db
    .collection("refunds")
    .countDocuments({
      cancelledByRole: "BUSINESS",
    });

  console.log("\n===== REFUND ROLE SNAPSHOT =====");
  console.log(`requestedByRole: ${refundRequestedCount}`);
  console.log(`cancelledByRole: ${refundCancelledCount}`);

  if (APPLY) {
    if (refundRequestedCount > 0) {
      await db.collection("refunds").updateMany(
        {
          requestedByRole: "BUSINESS",
        },
        {
          $set: {
            requestedByRole: "USER",
          },
        },
      );
    }

    if (refundCancelledCount > 0) {
      await db.collection("refunds").updateMany(
        {
          cancelledByRole: "BUSINESS",
        },
        {
          $set: {
            cancelledByRole: "USER",
          },
        },
      );
    }
  }

  // =====================================================
  // 8. NOTIFICATION roles
  // =====================================================

  const recipientRoleCount = await db
    .collection("notifications")
    .countDocuments({
      recipientRole: "BUSINESS",
    });

  const actorRoleCount = await db
    .collection("notifications")
    .countDocuments({
      actorRole: "BUSINESS",
    });

  console.log("\n===== NOTIFICATION ROLE SNAPSHOT =====");
  console.log(`recipientRole: ${recipientRoleCount}`);
  console.log(`actorRole: ${actorRoleCount}`);

  if (APPLY) {
    if (recipientRoleCount > 0) {
      await db.collection("notifications").updateMany(
        {
          recipientRole: "BUSINESS",
        },
        {
          $set: {
            recipientRole: "USER",
          },
        },
      );
    }

    if (actorRoleCount > 0) {
      await db.collection("notifications").updateMany(
        {
          actorRole: "BUSINESS",
        },
        {
          $set: {
            actorRole: "USER",
          },
        },
      );
    }
  }

  // =====================================================
  // 9. CAR audit roles
  // =====================================================

  const lastLocationRoleCount = await db
    .collection("cars")
    .countDocuments({
      lastLocationUpdatedByRole: "BUSINESS",
    });

  const submittedRoleCount = await db
    .collection("cars")
    .countDocuments({
      "approvalSubmission.submittedByRole": "BUSINESS",
    });

  const historyRoleCount = await db
    .collection("cars")
    .countDocuments({
      "locationHistory.updatedByRole": "BUSINESS",
    });

  console.log("\n===== CAR ROLE SNAPSHOT =====");
  console.log(`lastLocationUpdatedByRole: ${lastLocationRoleCount}`);
  console.log(
    `approvalSubmission.submittedByRole: ${submittedRoleCount}`,
  );
  console.log(`locationHistory.updatedByRole: ${historyRoleCount}`);

  if (APPLY) {
    if (lastLocationRoleCount > 0) {
      await db.collection("cars").updateMany(
        {
          lastLocationUpdatedByRole: "BUSINESS",
        },
        {
          $set: {
            lastLocationUpdatedByRole: "USER",
          },
        },
      );
    }

    if (submittedRoleCount > 0) {
      await db.collection("cars").updateMany(
        {
          "approvalSubmission.submittedByRole": "BUSINESS",
        },
        {
          $set: {
            "approvalSubmission.submittedByRole": "USER",
          },
        },
      );
    }

    if (historyRoleCount > 0) {
      await db.collection("cars").updateMany(
        {
          "locationHistory.updatedByRole": "BUSINESS",
        },
        {
          $set: {
            "locationHistory.$[item].updatedByRole": "USER",
          },
        },
        {
          arrayFilters: [
            {
              "item.updatedByRole": "BUSINESS",
            },
          ],
        },
      );
    }
  }

  // =====================================================
  // END
  // =====================================================

  console.log("\n=======================================");

  if (APPLY) {
    console.log("✓ MIGRATION ĐÃ ĐƯỢC ÁP DỤNG");
    console.log(
      "Lưu ý: businessId, businesses collection và BusinessModel CHƯA bị xóa.",
    );
  } else {
    console.log("✓ DRY RUN HOÀN TẤT");
    console.log("Không có document nào bị thay đổi.");
    console.log(
      "Nếu kết quả đúng, chạy lại với --apply.",
    );
  }

  console.log("=======================================\n");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("\n[FATAL MIGRATION ERROR]");
  console.error(error);

  await mongoose.disconnect();

  process.exit(1);
});