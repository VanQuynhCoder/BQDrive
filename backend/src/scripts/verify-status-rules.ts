import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import * as ModelConstants from "../constants/model.const";
import {
  BookingStatusEnum,
  CarStatusEnum,
  ContractPaymentStatusEnum,
  ContractStatusEnum,
  PaymentRefundStatusEnum,
  PaymentStatusEnum,
  RefundStatusEnum,
} from "../constants/model.const";
import {
  canTransitionBookingStatus,
  canTransitionRefundStatus,
  deriveContractPaymentStatus,
  derivePaymentRefundStatus,
} from "../helper/status.helper";
import { BookingModel } from "../models/booking/booking.model";
import { CarModel } from "../models/car/car.model";
import { ContractModel } from "../models/contract/contract.model";
import { PaymentModel } from "../models/payment/payment.model";
import { RefundModel } from "../models/refund/refund.model";

function run() {
  const newBooking = new BookingModel();
  assert.equal(newBooking.status, BookingStatusEnum.REQUESTED);

  const newPayment = new PaymentModel();
  assert.equal(newPayment.status, PaymentStatusEnum.PENDING);
  assert.equal(
    newPayment.refundStatus,
    PaymentRefundStatusEnum.NOT_REFUNDED,
  );

  const newRefund = new RefundModel();
  assert.equal(
    newRefund.status,
    RefundStatusEnum.WAITING_FOR_REFUND_INFO,
  );

  const newContract = new ContractModel();
  assert.equal(newContract.status, ContractStatusEnum.ACTIVE);
  assert.equal(
    newContract.paymentStatus,
    ContractPaymentStatusEnum.UNPAID,
  );

  const newCar = new CarModel();
  assert.equal(newCar.status, CarStatusEnum.PENDING);
  assert.equal(newCar.isHidden, false);

  assert.deepEqual(Object.values(BookingStatusEnum), [
    "REQUESTED",
    "OWNER_APPROVED",
    "PAYMENT_PENDING",
    "PAID",
    "IN_PROGRESS",
    "RETURN_INSPECTION",
    "AWAITING_EXTRA_CHARGE",
    "COMPLETED",
    "CANCELLED",
    "REJECTED",
    "NO_SHOW",
  ]);
  assert.deepEqual(Object.values(PaymentStatusEnum), [
    "PENDING",
    "PAID",
    "FAILED",
  ]);
  assert.deepEqual(Object.values(RefundStatusEnum), [
    "WAITING_FOR_REFUND_INFO",
    "PROCESSING",
    "SUCCEEDED",
    "MANUAL_REQUIRED",
  ]);
  assert.deepEqual(Object.values(ContractStatusEnum), [
    "ACTIVE",
    "COMPLETED",
    "CANCELLED",
  ]);
  assert.deepEqual(Object.values(CarStatusEnum), [
    "PENDING",
    "APPROVED",
    "RENTED",
    "REJECTED",
  ]);
  for (const exportName of [
    "LegacyCarStatusEnum",
    "LegacyBookingStatusEnum",
    "LegacyPaymentStatusEnum",
    "LegacyRefundStatusEnum",
    "LegacyContractStatusEnum",
  ]) {
    assert.equal(exportName in ModelConstants, false);
  }

  assert.equal(
    canTransitionBookingStatus("REQUESTED", BookingStatusEnum.OWNER_APPROVED),
    true,
  );
  assert.equal(
    canTransitionBookingStatus("REQUESTED", BookingStatusEnum.REJECTED),
    true,
  );
  assert.equal(
    canTransitionBookingStatus("OWNER_APPROVED", BookingStatusEnum.PAID),
    true,
  );
  assert.equal(
    canTransitionBookingStatus("PAID", BookingStatusEnum.IN_PROGRESS),
    true,
  );
  assert.equal(
    canTransitionBookingStatus(
      "IN_PROGRESS",
      BookingStatusEnum.RETURN_INSPECTION,
    ),
    true,
  );
  assert.equal(
    canTransitionBookingStatus(
      "RETURN_INSPECTION",
      BookingStatusEnum.AWAITING_EXTRA_CHARGE,
    ),
    true,
  );
  assert.equal(
    canTransitionBookingStatus(
      "AWAITING_EXTRA_CHARGE",
      BookingStatusEnum.COMPLETED,
    ),
    true,
  );
  assert.equal(
    canTransitionBookingStatus("COMPLETED", BookingStatusEnum.IN_PROGRESS),
    false,
  );

  assert.equal(
    deriveContractPaymentStatus({
      totalPrice: 600_000,
      depositAmount: 180_000,
      paidAmount: 0,
      hasPendingPayment: false,
    }),
    ContractPaymentStatusEnum.UNPAID,
  );
  assert.equal(
    deriveContractPaymentStatus({
      totalPrice: 600_000,
      depositAmount: 180_000,
      paidAmount: 0,
      hasPendingPayment: true,
    }),
    ContractPaymentStatusEnum.PENDING,
  );
  assert.equal(
    deriveContractPaymentStatus({
      totalPrice: 600_000,
      depositAmount: 180_000,
      paidAmount: 180_000,
    }),
    ContractPaymentStatusEnum.DEPOSIT_PAID,
  );
  assert.equal(
    deriveContractPaymentStatus({
      totalPrice: 600_000,
      depositAmount: 180_000,
      paidAmount: 100_000,
    }),
    ContractPaymentStatusEnum.PARTIAL,
  );
  assert.equal(
    deriveContractPaymentStatus({
      totalPrice: 600_000,
      depositAmount: 180_000,
      paidAmount: 600_000,
    }),
    ContractPaymentStatusEnum.PAID_FULL,
  );

  assert.equal(
    derivePaymentRefundStatus(600_000, 0),
    PaymentRefundStatusEnum.NOT_REFUNDED,
  );
  assert.equal(
    derivePaymentRefundStatus(600_000, 180_000),
    PaymentRefundStatusEnum.PARTIALLY_REFUNDED,
  );
  assert.equal(
    derivePaymentRefundStatus(600_000, 600_000),
    PaymentRefundStatusEnum.REFUNDED,
  );

  assert.equal(
    canTransitionRefundStatus(
      RefundStatusEnum.WAITING_FOR_REFUND_INFO,
      RefundStatusEnum.MANUAL_REQUIRED,
    ),
    true,
  );
  assert.equal(
    canTransitionRefundStatus(
      RefundStatusEnum.MANUAL_REQUIRED,
      RefundStatusEnum.PROCESSING,
    ),
    true,
  );
  assert.equal(
    canTransitionRefundStatus(
      RefundStatusEnum.PROCESSING,
      RefundStatusEnum.SUCCEEDED,
    ),
    true,
  );
  assert.equal(
    canTransitionRefundStatus(
      RefundStatusEnum.SUCCEEDED,
      RefundStatusEnum.PROCESSING,
    ),
    false,
  );

  assert.equal("HIDDEN" in CarStatusEnum, false);

  const invalidDocuments = [
    new CarModel({ status: "HIDDEN" }),
    new BookingModel({ status: "PENDING" }),
    new BookingModel({ status: "WAITING_PAYMENT" }),
    new BookingModel({ status: "CONFIRMED" }),
    new PaymentModel({ status: "REFUNDED" }),
    new RefundModel({ status: "PENDING" }),
    new RefundModel({ status: "FAILED" }),
    new RefundModel({ status: "CANCELLED" }),
    new ContractModel({ status: "DRAFT" }),
  ];

  for (const document of invalidDocuments) {
    const validationError = document.validateSync();
    assert.ok(validationError?.errors.status);
  }

  const fullyRefundedPayment = new PaymentModel({
    amount: 600_000,
    refundedAmount: 600_000,
    status: PaymentStatusEnum.PAID,
    refundStatus: PaymentRefundStatusEnum.REFUNDED,
  });
  assert.equal(fullyRefundedPayment.validateSync()?.errors.status, undefined);

  const frontendStatusConstants = readFileSync(
    path.resolve(
      __dirname,
      "../../../frontend/src/constants/status.constants.ts",
    ),
    "utf8",
  );
  for (const forbiddenFrontendToken of [
    "LegacyBookingStatus",
    "LegacyPaymentStatus",
    "LegacyRefundStatus",
    "LegacyContractStatus",
    "LegacyCarStatus",
    "WAITING_PAYMENT",
    "CONFIRMED",
    "DRAFT",
  ]) {
    assert.equal(frontendStatusConstants.includes(forbiddenFrontendToken), false);
  }

  console.log("[PASS] Status constants and transition rules are consistent.");
}

run();
