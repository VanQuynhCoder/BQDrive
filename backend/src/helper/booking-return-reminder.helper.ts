import { BookingStatusEnum } from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { sendBookingReturnReminderMail } from "./mail.helper";

const RETURN_REMINDER_BEFORE_MS = 30 * 60 * 1000;
const RETURN_REMINDER_JOB_INTERVAL_MS = 60 * 1000;
const RETURN_REMINDER_BATCH_SIZE = 25;

let returnReminderJobStarted = false;

export async function sendUpcomingReturnReminders(now = new Date()) {
  const reminderUntil = new Date(now.getTime() + RETURN_REMINDER_BEFORE_MS);

  const bookings = await BookingModel.find({
    status: BookingStatusEnum.IN_PROGRESS,
    isDeleted: false,
    returnReminderSentAt: { $exists: false },
    endDate: {
      $gt: now,
      $lte: reminderUntil,
    },
  })
    .sort({ endDate: 1 })
    .limit(RETURN_REMINDER_BATCH_SIZE);

  let sentCount = 0;

  for (const booking of bookings) {
    const claimedBooking = await BookingModel.findOneAndUpdate(
      {
        _id: booking._id,
        returnReminderSentAt: { $exists: false },
      },
      { returnReminderSentAt: now },
      { new: true },
    );

    if (!claimedBooking) continue;

    void sendBookingReturnReminderMail(claimedBooking);
    sentCount += 1;
  }

  return { checkedCount: bookings.length, sentCount };
}

export function startReturnReminderJob() {
  if (returnReminderJobStarted) return;

  returnReminderJobStarted = true;

  const runJob = () => {
    sendUpcomingReturnReminders().catch((error) => {
      console.error("Return reminder job failed", {
        message: error?.message,
        stack: error?.stack,
      });
    });
  };

  runJob();

  const interval = setInterval(runJob, RETURN_REMINDER_JOB_INTERVAL_MS);
  interval.unref?.();
}
