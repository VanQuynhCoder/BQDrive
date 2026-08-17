import assert from "node:assert/strict";

import { BookingStatusEnum } from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { assertCarReadyForHandover } from "../routers/apis/booking.route";

type GuardState = {
  activeBooking: any;
  overlappingBooking: any;
  completedBooking: any;
  sessionCallCount: number;
};

function createQuery(value: any, state: GuardState) {
  const query: any = {
    select() {
      return query;
    },
    sort() {
      return query;
    },
    session() {
      state.sessionCallCount += 1;
      return query;
    },
    then(resolve: (result: any) => unknown, reject: (error: unknown) => unknown) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };

  return query;
}

function createBooking(
  startDate = "2026-08-15T20:00:00.000Z",
  endDate = "2026-08-15T22:00:00.000Z",
) {
  return {
    _id: "booking-b",
    carId: "car-1",
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  };
}

function getMatchingBooking(candidate: any, filter: any) {
  if (!candidate) return null;

  const allowedStatuses = filter?.status?.$in;
  if (
    Array.isArray(allowedStatuses) &&
    !allowedStatuses.includes(candidate.status)
  ) {
    return null;
  }

  if (
    filter?.startDate?.$lt &&
    !(new Date(candidate.startDate) < new Date(filter.startDate.$lt))
  ) {
    return null;
  }

  if (
    filter?.endDate?.$gt &&
    !(new Date(candidate.endDate) > new Date(filter.endDate.$gt))
  ) {
    return null;
  }

  return candidate;
}

async function expectActiveTripBlocked(
  state: GuardState,
  status: BookingStatusEnum,
) {
  state.activeBooking = { _id: "booking-a", status };

  await assert.rejects(
    () =>
      assertCarReadyForHandover(createBooking(), {
        now: new Date("2026-08-15T20:00:00.000Z"),
      }),
    (error: any) =>
      String(error?.info?.data || "").includes("quy trình trả xe chưa hoàn tất"),
  );

  state.activeBooking = null;
}

async function run() {
  const originalFindOne = BookingModel.findOne;
  const originalCleaningHours = process.env.CAR_CLEANING_BUFFER_HOURS;
  const state: GuardState = {
    activeBooking: null,
    overlappingBooking: null,
    completedBooking: null,
    sessionCallCount: 0,
  };

  process.env.CAR_CLEANING_BUFFER_HOURS = "1";

  try {
    (BookingModel as any).findOne = (filter: any) => {
      const statuses = filter?.status?.$in;
      const isActiveBookingQuery =
        Array.isArray(statuses) &&
        statuses.includes(BookingStatusEnum.IN_PROGRESS);
      const isOverlapBookingQuery =
        Array.isArray(statuses) &&
        statuses.includes(BookingStatusEnum.PAID) &&
        !isActiveBookingQuery;
      const result = isActiveBookingQuery
        ? getMatchingBooking(state.activeBooking, filter)
        : isOverlapBookingQuery
          ? getMatchingBooking(state.overlappingBooking, filter)
          : state.completedBooking;

      return createQuery(result, state);
    };

    for (const [caseNumber, status] of [
      [1, BookingStatusEnum.PAID],
      [2, BookingStatusEnum.OWNER_APPROVED],
      [3, BookingStatusEnum.PAYMENT_PENDING],
    ] as const) {
      state.overlappingBooking = {
        _id: "booking-a",
        status,
        startDate: new Date("2026-08-15T20:00:00.000Z"),
        endDate: new Date("2026-08-15T23:00:00.000Z"),
      };
      await assert.rejects(
        () =>
          assertCarReadyForHandover(
            createBooking(
              "2026-08-15T20:30:00.000Z",
              "2026-08-15T22:00:00.000Z",
            ),
            { now: new Date("2026-08-15T20:30:00.000Z") },
          ),
        (error: any) =>
          String(error?.info?.data || "").includes("trùng thời gian bàn giao"),
      );
      console.log(`[PASS] Overlap Case ${caseNumber} - ${status} trùng lịch bị chặn.`);
    }

    state.overlappingBooking = {
      _id: "booking-a",
      status: BookingStatusEnum.PAID,
      startDate: new Date("2026-08-15T17:00:00.000Z"),
      endDate: new Date("2026-08-15T19:00:00.000Z"),
    };
    await assertCarReadyForHandover(createBooking(), {
      now: new Date("2026-08-15T20:00:00.000Z"),
    });
    console.log("[PASS] Overlap Case 4 - PAID không trùng lịch không bị chặn.");

    for (const status of [
      BookingStatusEnum.CANCELLED,
      BookingStatusEnum.REJECTED,
    ]) {
      state.overlappingBooking = {
        _id: "booking-a",
        status,
        startDate: new Date("2026-08-15T20:00:00.000Z"),
        endDate: new Date("2026-08-15T23:00:00.000Z"),
      };
      await assertCarReadyForHandover(createBooking(), {
        now: new Date("2026-08-15T20:00:00.000Z"),
      });
    }
    console.log("[PASS] Overlap Case 5 - CANCELLED/REJECTED không chặn.");

    state.overlappingBooking = null;
    await expectActiveTripBlocked(state, BookingStatusEnum.RETURN_INSPECTION);
    console.log("[PASS] Overlap Case 6 - RETURN_INSPECTION không trùng lịch vẫn bị chặn.");

    state.completedBooking = {
      _id: "booking-a",
      completedAt: new Date("2026-08-15T19:30:00.000Z"),
    };
    await assert.rejects(
      () =>
        assertCarReadyForHandover(createBooking(), {
          now: new Date("2026-08-15T20:00:00.000Z"),
        }),
      (error: any) => error?.info?.code === "CAR_CLEANING_IN_PROGRESS",
    );
    console.log("[PASS] Overlap Case 7 - Cleaning chưa hết vẫn bị chặn.");

    state.completedBooking = null;
    await assertCarReadyForHandover(createBooking(), {
      now: new Date("2026-08-15T20:00:00.000Z"),
    });
    console.log("[PASS] Overlap Case 8 - Không có booking cản trở, guard cho đi tiếp.");

    await expectActiveTripBlocked(state, BookingStatusEnum.IN_PROGRESS);
    console.log("[PASS] Case 1 - Chuyến trước IN_PROGRESS bị chặn.");

    await expectActiveTripBlocked(state, BookingStatusEnum.RETURN_INSPECTION);
    console.log("[PASS] Case 2 - RETURN_INSPECTION dù hết endDate vẫn bị chặn.");

    await expectActiveTripBlocked(
      state,
      BookingStatusEnum.AWAITING_EXTRA_CHARGE,
    );
    console.log("[PASS] Case 3 - AWAITING_EXTRA_CHARGE vẫn bị chặn.");

    state.completedBooking = {
      _id: "booking-a",
      completedAt: new Date("2026-08-15T18:00:00.000Z"),
    };
    await assert.rejects(
      () =>
        assertCarReadyForHandover(createBooking("2026-08-15T18:30:00.000Z"), {
          now: new Date("2026-08-15T18:30:00.000Z"),
        }),
      (error: any) => error?.info?.code === "CAR_CLEANING_IN_PROGRESS",
    );
    console.log("[PASS] Case 4 - Cleaning lúc 18:30 bị chặn.");

    await assertCarReadyForHandover(createBooking("2026-08-15T19:00:00.000Z"), {
      now: new Date("2026-08-15T19:00:00.000Z"),
    });
    console.log("[PASS] Case 5 - Đúng biên cleaning 19:00 được đi tiếp.");

    await assertCarReadyForHandover(createBooking("2026-08-15T19:30:00.000Z"), {
      now: new Date("2026-08-15T19:30:00.000Z"),
    });
    console.log("[PASS] Case 6 - Sau cleaning được đi tiếp.");

    state.completedBooking = null;
    await assert.rejects(
      () =>
        assertCarReadyForHandover(createBooking(), {
          now: new Date("2026-08-15T19:30:00.000Z"),
        }),
      (error: any) =>
        String(error?.info?.data || "").includes("Chưa đến giờ nhận xe"),
    );
    console.log("[PASS] Case 7 - Bàn giao trước startDate bị chặn.");

    await assertCarReadyForHandover(createBooking(), {
      now: new Date("2026-08-15T20:00:00.000Z"),
    });
    console.log("[PASS] Case 8 - Đúng startDate được đi tiếp.");

    await assertCarReadyForHandover(createBooking(), {
      now: new Date("2026-08-15T20:00:00.000Z"),
    });
    state.activeBooking = {
      _id: "booking-a",
      status: BookingStatusEnum.RETURN_INSPECTION,
    };
    await assert.rejects(() =>
      assertCarReadyForHandover(createBooking(), {
        now: new Date("2026-08-15T20:01:00.000Z"),
      }),
    );
    console.log("[PASS] Case 9 - Kiểm tra lại phát hiện trạng thái phát sinh giữa hai bước.");

    state.activeBooking = null;
    state.completedBooking = {
      _id: "booking-a",
      completedAt: new Date("2026-08-15T18:00:00.000Z"),
    };
    await assertCarReadyForHandover(createBooking(), {
      now: new Date("2026-08-15T20:00:00.000Z"),
    });
    console.log("[PASS] Case 10 - Không còn điều kiện cản trở, luồng được đi tiếp.");

    state.completedBooking = null;
    state.sessionCallCount = 0;
    const fakeSession = {} as any;
    await assertCarReadyForHandover(createBooking(), {
      now: new Date("2026-08-15T20:00:00.000Z"),
      session: fakeSession,
    });
    assert.equal(state.sessionCallCount, 3);
    console.log("[PASS] Case 11 - Cả ba truy vấn guard dùng session của transaction.");
  } finally {
    (BookingModel as any).findOne = originalFindOne;

    if (originalCleaningHours === undefined) {
      delete process.env.CAR_CLEANING_BUFFER_HOURS;
    } else {
      process.env.CAR_CLEANING_BUFFER_HOURS = originalCleaningHours;
    }
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
