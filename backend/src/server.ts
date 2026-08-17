import dotenv from "dotenv";
import { createServer } from "http";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import app from "./app";
import connectDB from "./config/database";
import { startBookingExpirationJob } from "./helper/booking-hold.helper";
import { startReturnReminderJob } from "./helper/booking-return-reminder.helper";
import { startBookingExtensionExpirationJob } from "./helper/booking-extension.helper";
import { verifySmtpConnection } from "./helper/mail.helper";
import {
  initializeBookingChatSocket,
  initializeNotificationSocket,
} from "./sockets/booking-chat.socket";
import { initializeSupportChatSocket } from "./sockets/support-chat.socket";
import { notificationCenterService } from "./services/notification-center.service";

const PORT = process.env.PORT || 5000;
const httpServer = createServer(app);

const io = initializeBookingChatSocket(httpServer);
notificationCenterService.setNotificationNamespace(initializeNotificationSocket(io));
initializeSupportChatSocket(io);

connectDB().then(async () => {
  console.log("Database Name:", mongoose.connection.name);
  await verifySmtpConnection();
  startBookingExpirationJob();
  startReturnReminderJob();
  startBookingExtensionExpirationJob();

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
