import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import app from "./app";
import connectDB from "./config/database";
import { startBookingExpirationJob } from "./helper/booking-hold.helper";
import { startReturnReminderJob } from "./helper/booking-return-reminder.helper";
import { verifySmtpConnection } from "./helper/mail.helper";

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  console.log("Database Name:", mongoose.connection.name);
  await verifySmtpConnection();
  startBookingExpirationJob();
  startReturnReminderJob();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
