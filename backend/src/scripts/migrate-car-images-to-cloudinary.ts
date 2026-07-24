import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

import connectDB from "../config/database";
import { CarModel } from "../models/car/car.model";
import { uploadCarImageBuffer } from "../services/cloudinary.service";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MIGRATION_CONCURRENCY = 2;

type MigrationJob = {
  carId: string;
  imageIndex: number;
  image: string;
};

type MigrationStats = {
  checkedCars: number;
  foundBase64Images: number;
  uploadedImages: number;
  skippedImages: number;
  failedImages: number;
};

function parseDataImage(image: string) {
  const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);

  if (!match?.[1] || !match?.[2]) return null;

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function runJob(job: MigrationJob, dryRun: boolean, stats: MigrationStats) {
  const parsedImage = parseDataImage(job.image);

  if (!parsedImage) {
    stats.skippedImages += 1;
    console.log(
      `[SKIP] car=${job.carId} imageIndex=${job.imageIndex} reason=invalid-data-image`,
    );
    return;
  }

  if (dryRun) {
    stats.skippedImages += 1;
    console.log(`[DRY] car=${job.carId} imageIndex=${job.imageIndex}`);
    return;
  }

  try {
    const uploaded = await uploadCarImageBuffer({
      buffer: parsedImage.buffer,
      mimetype: parsedImage.mimeType,
    });

    await CarModel.updateOne(
      { _id: job.carId },
      { $set: { [`images.${job.imageIndex}`]: uploaded.url } },
    );
    stats.uploadedImages += 1;
    console.log(
      `[OK] car=${job.carId} imageIndex=${job.imageIndex} publicId=${uploaded.publicId}`,
    );
  } catch (error) {
    stats.failedImages += 1;
    console.log(
      `[FAIL] car=${job.carId} imageIndex=${job.imageIndex} message=${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  }
}

async function runWithConcurrency(
  jobs: MigrationJob[],
  dryRun: boolean,
  stats: MigrationStats,
) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < jobs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const job = jobs[currentIndex];

      if (job) {
        await runJob(job, dryRun, stats);
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(MIGRATION_CONCURRENCY, Math.max(jobs.length, 1)) },
      () => worker(),
    ),
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const stats: MigrationStats = {
    checkedCars: 0,
    foundBase64Images: 0,
    uploadedImages: 0,
    skippedImages: 0,
    failedImages: 0,
  };

  await connectDB();

  const cars = await CarModel.find({
    images: { $elemMatch: { $regex: "^data:image/" } },
    isDeleted: false,
  }).select("_id images");
  const jobs: MigrationJob[] = [];

  stats.checkedCars = cars.length;

  cars.forEach((car) => {
    const carId = String(car._id);
    const images = Array.isArray(car.images) ? car.images : [];

    images.forEach((image, imageIndex) => {
      if (typeof image === "string" && image.startsWith("data:image/")) {
        stats.foundBase64Images += 1;
        jobs.push({ carId, imageIndex, image });
      }
    });
  });

  console.log(
    `[START] mode=${dryRun ? "dry-run" : "write"} cars=${stats.checkedCars} base64Images=${stats.foundBase64Images}`,
  );

  await runWithConcurrency(jobs, dryRun, stats);

  console.log("[DONE]", JSON.stringify(stats, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[FATAL]", error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exit(1);
});
