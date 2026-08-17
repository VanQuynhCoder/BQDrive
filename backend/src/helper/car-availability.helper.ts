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

export const BLOCKING_EXTENSION_STATUSES = [
  BookingExtensionStatusEnum.OWNER_APPROVED,
  BookingExtensionStatusEnum.PAYMENT_PENDING,
];

export type CalendarUnavailableRange = {
  startDate: Date;
  endDate: Date;
  type: "UNAVAILABLE";
};

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

// Trả về các khoảng không thể đặt công khai cho lịch xe, dùng cùng điều kiện với assertCarAvailability.
export async function getCarCalendarUnavailableRanges(input: {
  carId: string;
  from: Date;
  to: Date;
  now?: Date;
}) {
  const now = input.now || new Date();
  const { bufferedStart: queryStart, bufferedEnd: queryEnd } =
    getBufferedAvailabilityRange(input.from, input.to);
  const cleaningBufferMs = getCarCleaningBufferMs();
  const cleaningStartedAfter = new Date(input.from.getTime() - cleaningBufferMs);

  const [bookings, carts, extensions, completedBookings] = await Promise.all([
    BookingModel.find({
      carId: input.carId,
      status: { $in: BLOCKING_BOOKING_STATUSES },
      isDeleted: false,
      startDate: { $lt: queryEnd },
      endDate: { $gt: queryStart },
    } as any).select("startDate endDate").lean(),
    CartModel.find({
      carId: input.carId,
      status: CartStatusEnum.ACTIVE,
      expiredAt: { $gt: now },
      startDate: { $lt: queryEnd },
      endDate: { $gt: queryStart },
    } as any).select("startDate endDate").lean(),
    BookingExtensionModel.find({
      carId: input.carId,
      status: { $in: BLOCKING_EXTENSION_STATUSES },
      isDeleted: false,
      paymentDeadlineAt: { $gt: now },
      oldEndAt: { $lt: queryEnd },
      requestedEndAt: { $gt: queryStart },
    } as any).select("oldEndAt requestedEndAt").lean(),
    cleaningBufferMs > 0
      ? BookingModel.find({
          carId: input.carId,
          status: BookingStatusEnum.COMPLETED,
          isDeleted: false,
          $or: [
            { completedAt: { $gt: cleaningStartedAfter, $lt: input.to } },
            {
              completedAt: null,
              updatedAt: { $gt: cleaningStartedAfter, $lt: input.to },
            },
          ],
        } as any).select("completedAt updatedAt").lean()
      : Promise.resolve([]),
  ]);

  const ranges: CalendarUnavailableRange[] = [];
  const addBufferedRange = (startValue: Date, endValue: Date) => {
    const { bufferedStart, bufferedEnd } = getBufferedAvailabilityRange(
      new Date(startValue),
      new Date(endValue),
    );
    if (bufferedStart < input.to && bufferedEnd > input.from) {
      ranges.push({
        startDate: bufferedStart,
        endDate: bufferedEnd,
        type: "UNAVAILABLE",
      });
    }
  };

  bookings.forEach((booking) => addBufferedRange(booking.startDate, booking.endDate));
  carts.forEach((cart) => addBufferedRange(cart.startDate, cart.endDate));
  extensions.forEach((extension) =>
    addBufferedRange(extension.oldEndAt, extension.requestedEndAt),
  );
  completedBookings.forEach((booking) => {
    const completedAt = booking.completedAt ?? booking.updatedAt;
    if (!completedAt) return;

    const cleaningUntil = getCarCleaningUnavailableUntil(new Date(completedAt));
    if (new Date(completedAt) < input.to && cleaningUntil > input.from) {
      ranges.push({
        startDate: new Date(completedAt),
        endDate: cleaningUntil,
        type: "UNAVAILABLE",
      });
    }
  });

  return ranges
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())
    .reduce<CalendarUnavailableRange[]>((merged, range) => {
      const previous = merged[merged.length - 1];
      if (previous && range.startDate <= previous.endDate) {
        if (range.endDate > previous.endDate) previous.endDate = range.endDate;
        return merged;
      }

      merged.push({ ...range });
      return merged;
    }, []);
}
