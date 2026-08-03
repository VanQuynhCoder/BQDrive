import type { ClientSession } from "mongoose";

import { ErrorHelper } from "../base/error";
import {
  BookingExtensionStatusEnum,
  BookingStatusEnum,
  CartStatusEnum,
} from "../constants/model.const";
import { BookingExtensionModel } from "../models/booking-extension/bookingExtension.model";
import { BookingModel } from "../models/booking/booking.model";
import { CartModel } from "../models/cart/cart.model";
import {
  getCarCleaningBufferMs,
  getCarCleaningUnavailableUntil,
  getBookingBufferHours,
  getBufferedAvailabilityRange,
} from "./booking-availability.helper";

export const BLOCKING_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED,
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
  BookingStatusEnum.IN_PROGRESS,
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
];

const BLOCKING_EXTENSION_STATUSES = [
  BookingExtensionStatusEnum.OWNER_APPROVED,
  BookingExtensionStatusEnum.PAYMENT_PENDING,
];

type AvailabilityInput = {
  carId: string;
  start: Date;
  end: Date;
  now?: Date;
  ignoredBookingId?: string;
  ignoredCartId?: string;
  ignoredExtensionId?: string;
  session?: ClientSession;
};

export async function assertCarAvailability(input: AvailabilityInput) {
  const now = input.now || new Date();
  const { bufferedStart, bufferedEnd } = getBufferedAvailabilityRange(
    input.start,
    input.end,
  );
  const bookingFilter: Record<string, unknown> = {
    carId: input.carId,
    status: { $in: BLOCKING_BOOKING_STATUSES },
    isDeleted: false,
    startDate: { $lt: bufferedEnd },
    endDate: { $gt: bufferedStart },
  };

  if (input.ignoredBookingId) {
    bookingFilter._id = { $ne: input.ignoredBookingId };
  }

  const bookingQuery = BookingModel.findOne(bookingFilter).select("_id");
  if (input.session) bookingQuery.session(input.session);
  if (await bookingQuery) {
    throw ErrorHelper.carTimeConflict({
      carId: input.carId,
      startAt: input.start.toISOString(),
      endAt: input.end.toISOString(),
      conflictType: "BOOKING",
      bufferHours: getBookingBufferHours(),
    });
  }

  const cleaningBufferMs = getCarCleaningBufferMs();

  if (cleaningBufferMs > 0) {
    const cleaningStartedAfter = new Date(input.start.getTime() - cleaningBufferMs);
    const cleaningFilter: Record<string, unknown> = {
      carId: input.carId,
      status: BookingStatusEnum.COMPLETED,
      isDeleted: false,
      $or: [
        {
          completedAt: {
            $gt: cleaningStartedAfter,
            $lt: input.end,
          },
        },
        {
          completedAt: null,
          updatedAt: {
            $gt: cleaningStartedAfter,
            $lt: input.end,
          },
        },
      ],
    };

    if (input.ignoredBookingId) {
      cleaningFilter._id = { $ne: input.ignoredBookingId };
    }

    const cleaningQuery = BookingModel.findOne(cleaningFilter)
      .select("_id completedAt updatedAt")
      .sort({ completedAt: -1, updatedAt: -1 });
    if (input.session) cleaningQuery.session(input.session);
    const recentlyCompletedBooking = await cleaningQuery;

    if (recentlyCompletedBooking) {
      const completedAtSource =
        recentlyCompletedBooking.completedAt ?? recentlyCompletedBooking.updatedAt;

      if (completedAtSource) {
        const completedAt = new Date(completedAtSource);
        const cleaningUntil = getCarCleaningUnavailableUntil(completedAt);

        if (completedAt < input.end && cleaningUntil > input.start) {
          throw ErrorHelper.carCleaningInProgress(cleaningUntil);
        }
      }
    }
  }

  const cartFilter: Record<string, unknown> = {
    carId: input.carId,
    status: CartStatusEnum.ACTIVE,
    expiredAt: { $gt: now },
    startDate: { $lt: bufferedEnd },
    endDate: { $gt: bufferedStart },
  };

  if (input.ignoredCartId) {
    cartFilter._id = { $ne: input.ignoredCartId };
  }

  const cartQuery = CartModel.findOne(cartFilter).select("_id");
  if (input.session) cartQuery.session(input.session);
  if (await cartQuery) {
    throw ErrorHelper.carTimeConflict({
      carId: input.carId,
      startAt: input.start.toISOString(),
      endAt: input.end.toISOString(),
      conflictType: "HOLD",
      bufferHours: getBookingBufferHours(),
    });
  }

  const extensionFilter: Record<string, unknown> = {
    carId: input.carId,
    status: { $in: BLOCKING_EXTENSION_STATUSES },
    isDeleted: false,
    paymentDeadlineAt: { $gt: now },
    oldEndAt: { $lt: bufferedEnd },
    requestedEndAt: { $gt: bufferedStart },
  };

  if (input.ignoredExtensionId) {
    extensionFilter._id = { $ne: input.ignoredExtensionId };
  }

  const extensionQuery = BookingExtensionModel.findOne(extensionFilter).select(
    "_id",
  );
  if (input.session) extensionQuery.session(input.session);
  if (await extensionQuery) {
    throw ErrorHelper.carTimeConflict({
      carId: input.carId,
      startAt: input.start.toISOString(),
      endAt: input.end.toISOString(),
      conflictType: "EXTENSION_HOLD",
      bufferHours: getBookingBufferHours(),
    });
  }
}
