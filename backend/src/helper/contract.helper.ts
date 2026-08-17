import type { ClientSession } from "mongoose";

import { ErrorHelper } from "../base/error";
import {
  BookingStatusEnum,
  ContractStatusEnum,

  PaymentOptionEnum,
  UserRoleEnum,
} from "../constants/model.const";
import { formatAddress } from "./address.helper";
import { getContractStatusForBookingStatus } from "./payment-sync.helper";
import { deriveContractPaymentStatus } from "./status.helper";
import { ContractModel } from "../models/contract/contract.model";
import { UserModel } from "../models/user/user.model";

const CONTRACT_CREATION_BOOKING_STATUSES = new Set<BookingStatusEnum>([
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
  BookingStatusEnum.IN_PROGRESS,
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
]);

const RENTER_INFO_REQUIRED_MESSAGE =
  "Booking thiếu thông tin người thuê, không thể tạo hợp đồng.";

type EnsureContractOptions = {
  session?: ClientSession;
};

function getValidatedPaymentOption(booking: any): PaymentOptionEnum {
  const paymentOption = booking.paymentOption as PaymentOptionEnum;

  if (!Object.values(PaymentOptionEnum).includes(paymentOption)) {
    throw ErrorHelper.requestDataInvalid(
      "Booking chưa có phương án thanh toán hợp lệ để tạo hợp đồng",
    );
  }

  return paymentOption;
}

function getContractRenterInfo(booking: any) {
  const renterInfo = booking.renterInfo || {};
  const renterName = String(renterInfo.fullName || "").trim();
  const renterPhone = String(renterInfo.phone || "").trim();
  const renterAddress = String(
    renterInfo.address || booking.pickupAddressSnapshot || "",
  ).trim();

  if (!renterName || !renterPhone || !renterAddress) {
    throw ErrorHelper.requestDataInvalid(RENTER_INFO_REQUIRED_MESSAGE);
  }

  return {
    renterName,
    renterPhone,
    renterAddress,
    note: String(renterInfo.note || "").trim(),
  };
}

async function getOwnerAddressSnapshot(
  booking: any,
  session?: ClientSession,
) {
  const ownerRef = booking.ownerId as any;

if (
  ownerRef &&
  typeof ownerRef === "object" &&
  ownerRef.address
) {
  return formatAddress(ownerRef);
}

const ownerUserId =
  ownerRef?._id || ownerRef;

if (!ownerUserId) {
  return "";
}

const ownerUser =
  await UserModel.findById(ownerUserId).lean();

return ownerUser
  ? formatAddress(ownerUser)
  : "";
}

async function generateContractCode(session?: ClientSession) {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const contractCode = `HD-BQD-${datePart}-${random}`;
    const query = ContractModel.exists({ contractCode });
    if (session) query.session(session);

    if (!(await query)) return contractCode;
  }

  return `HD-BQD-${datePart}-${Date.now().toString().slice(-6)}`;
}

function assertContractCanFollowBooking(contract: any, booking: any) {
  if (
    contract.status === ContractStatusEnum.CANCELLED &&
    getContractStatusForBookingStatus(booking.status) !==
      ContractStatusEnum.CANCELLED
  ) {
    throw ErrorHelper.requestDataInvalid(
      "Hợp đồng của booking đã bị hủy, không thể tiếp tục thanh toán",
    );
  }

  const bookingPaidAmount = Number(booking.paidAmount || 0);
  const contractPaidAmount = Number(contract.paidAmount || 0);

  if (
    contract.paymentOption !== booking.paymentOption &&
    (bookingPaidAmount > 0 || contractPaidAmount > 0)
  ) {
    throw ErrorHelper.requestDataInvalid(
      "Phương án thanh toán của booking và hợp đồng không nhất quán",
    );
  }
}

/**
 * Creates the contract at payment initiation or refreshes its pre-payment
 * snapshot on a retry. The booking is always the source of truth.
 */
export async function ensureContractForPayment(
  booking: any,
  options: EnsureContractOptions = {},
) {
  if (
    !CONTRACT_CREATION_BOOKING_STATUSES.has(
      booking.status as BookingStatusEnum,
    )
  ) {
    throw ErrorHelper.requestDataInvalid(
      "Booking cần được chủ xe xác nhận trước khi tạo hợp đồng",
    );
  }

  const paymentOption = getValidatedPaymentOption(booking);
const ownerId =
  (booking.ownerId as any)?._id ||
  booking.ownerId;

  if (!ownerId) {
    throw ErrorHelper.requestDataInvalid(
      "Booking thiếu thông tin chủ xe, không thể tạo hợp đồng",
    );
  }

  const ownerAddressSnapshot =
    (await getOwnerAddressSnapshot(booking, options.session)) ||
    booking.pickupAddressSnapshot ||
    "";
  const renterInfo = getContractRenterInfo(booking);
  const paidAmount = Number(booking.paidAmount || 0);
  const totalPrice = Number(booking.totalPrice || 0);
  const upfrontPaymentAmount = Number(booking.upfrontPaymentAmount || 0);
  const remainingAmount = Number(booking.remainingAmount || 0);
  const snapshot = {
    userId: booking.userId,
    carId: booking.carId,
    ownerId,
    ...renterInfo,
    startDate: booking.startDate,
    endDate: booking.endDate,
    totalPrice,
    upfrontPaymentAmount,
    paidAmount,
    remainingAmount,
    paymentStatus: deriveContractPaymentStatus({
      totalPrice,
      upfrontPaymentAmount,
      paidAmount,
      paymentOption,
    }),
    paymentOption,
    pickupAddressSnapshot: booking.pickupAddressSnapshot,
    returnAddressSnapshot: booking.returnAddressSnapshot,
    ownerAddressSnapshot,
    status: getContractStatusForBookingStatus(booking.status),
  };

  const query = ContractModel.findOne({
    bookingId: booking._id,
    isDeleted: false,
  });
  if (options.session) query.session(options.session);
  let contract = await query;

  if (!contract) {
    const contractCode = await generateContractCode(options.session);
    const created = await ContractModel.create(
      [
        {
          bookingId: booking._id,
          ...snapshot,
          contractCode,
          signedAt: new Date(),
          isDeleted: false,
        },
      ],
      options.session ? { session: options.session } : {},
    );
    contract = created[0] || null;
  }

  if (!contract) {
    throw ErrorHelper.requestDataInvalid("Không thể tạo hợp đồng cho booking");
  }

  assertContractCanFollowBooking(contract, booking);

  // Before any successful payment, retrying with FULL/DEPOSIT may refresh the
  // existing snapshot. Once money is recorded, the agreed payment plan is locked.
  if (paidAmount <= 0 && Number(contract.paidAmount || 0) <= 0) {
    Object.assign(contract, snapshot);
    await contract.save(
      options.session ? { session: options.session } : undefined,
    );
  }

  return contract;
}
