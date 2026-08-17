import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { ContractModel } from "../../models/contract/contract.model";
import { BookingExtensionModel } from "../../models/booking-extension/bookingExtension.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { ExtraChargeModel } from "../../models/extra-charge/extraCharge.model";
import { ReturnInspectionModel } from "../../models/return-inspection/returnInspection.model";
import { RefundModel } from "../../models/refund/refund.model";
import {
  ReviewModel,
} from "../../models/review/review.model";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";

import {
  getContractStatusForBookingStatus,
  syncContractFromBooking,
} from "../../helper/payment-sync.helper";

import {
  BookingStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const RENTER_ROLES = [UserRoleEnum.USER];

class ContractRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    // Khách thuê tạo/xem lại hợp đồng của booking
    this.router.post(
      "/create",
      [
        this.authentication,
        this.roleGuard(RENTER_ROLES),
      ],
      this.route(this.createContract),
    );

    // Danh sách hợp đồng của người thuê
    this.router.get(
      "/my-contracts",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getMyContracts),
    );

    // Danh sách hợp đồng của chủ xe
    this.router.get(
      "/owner/my-contracts",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerContracts),
    );

    // Chi tiết hợp đồng
    this.router.get(
      "/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getContractDetail),
    );
  }

  /**
   * Sau khi bỏ BUSINESS:
   * Chủ xe luôn là User.
   */
  private async getOwnerContext(authUser: any) {
    return {
      ownerId: authUser.userId,
    };
  }

  /**
   * Filter dữ liệu thuộc chủ xe.
   */
  private buildOwnerFilter(owner: any) {
    return {
      ownerId: owner.ownerId,
    };
  }

  /**
   * Populate thông tin chủ xe.
   *
   * Contract.ownerId -> User
   */
  private getOwnerPopulate() {
    return {
      path: "ownerId",
      select: "-password -otpCode",
    };
  }

  /**
   * Đồng bộ trạng thái và thông tin thanh toán
   * trước khi trả Contract về frontend.
   */
  private async buildContractAppendix(booking: any) {
    const bookingId = booking?._id;

    if (!bookingId) {
      return undefined;
    }

    const [extensions, payments, extraCharges, returnInspection, refunds] =
      await Promise.all([
        BookingExtensionModel.find({ bookingId, isDeleted: false })
          .sort({ requestedAt: 1, createdAt: 1 })
          .lean(),
        PaymentModel.find({ bookingId }).sort({ createdAt: 1 }).lean(),
        ExtraChargeModel.find({ bookingId, isDeleted: false })
          .sort({ createdAt: 1 })
          .lean(),
        ReturnInspectionModel.findOne({ bookingId, isDeleted: false }).lean(),
        RefundModel.find({ bookingId, isDeleted: false })
          .sort({ requestedAt: 1, createdAt: 1 })
          .lean(),
      ]);

    const firstExtension = extensions[0];
    const handover = booking.handoverSnapshot;

    return {
      // Hợp đồng gốc không được lưu lại một lần nữa. Với hợp đồng legacy từng
      // bị cập nhật khi gia hạn, mốc oldEndAt của lần gia hạn đầu tiên chính là
      // thời điểm kết thúc trong thỏa thuận ban đầu.
      originalSchedule: {
        startDate: booking.startDate,
        endDate: firstExtension?.oldEndAt || booking.endDate,
      },
      extensions: extensions.map((extension: any) => ({
        _id: String(extension._id),
        requestType: extension.requestType,
        sourceRentalMode: extension.sourceRentalMode,
        targetRentalMode: extension.targetRentalMode,
        oldEndAt: extension.oldEndAt,
        requestedEndAt: extension.requestedEndAt,
        additionalDurationMinutes: extension.additionalDurationMinutes,
        billableUnits: extension.billableUnits,
        additionalAmount: extension.additionalAmount,
        status: extension.status,
        requestedAt: extension.requestedAt,
        ownerRespondedAt: extension.ownerRespondedAt,
        paymentDeadlineAt: extension.paymentDeadlineAt,
        activatedAt: extension.activatedAt,
        rejectReason: extension.rejectReason,
        paymentId: extension.paymentId ? String(extension.paymentId) : undefined,
      })),
      payments: payments.map((payment: any) => ({
        _id: String(payment._id),
        paymentType: payment.paymentType,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        transactionCode: payment.transactionCode,
        gatewayOrderId: payment.gatewayOrderId,
        refundedAmount: payment.refundedAmount,
        refundStatus: payment.refundStatus,
      })),
      handover: handover
        ? {
            recordedAt: handover.handoverRecordedAt,
            odometerKm: handover.handoverOdometerKm,
            energyLevelPercent: handover.handoverEnergyLevelPercent,
            dashboardImage: handover.handoverDashboardImage,
            photos: handover.handoverPhotos || [],
            conditionNotes: handover.handoverConditionNotes,
            vehicleCondition: handover.vehicleCondition,
            accessoriesSnapshot: handover.accessoriesSnapshot,
            vehicleDocumentsSnapshot: handover.vehicleDocumentsSnapshot,
            ownerConfirmedAt: handover.ownerConfirmedAt,
            renterConfirmedAt: handover.renterConfirmedAt,
          }
        : null,
      returnInspection: returnInspection
        ? {
            actualReturnAt: returnInspection.actualReturnAt,
            receivedAt: returnInspection.receivedAt,
            returnOdometerKm:
              returnInspection.returnOdometerKm ?? returnInspection.returnOdometer,
            returnEnergyLevelPercent:
              returnInspection.returnEnergyLevelPercent ?? returnInspection.returnFuelLevel,
            dashboardImage: returnInspection.returnDashboardImage,
            photos: returnInspection.returnPhotos || [],
            distanceTravelledKm: returnInspection.distanceTravelledKm,
            totalIncludedKm: returnInspection.totalIncludedKm,
            overageKm: returnInspection.overageKm,
            chargeableOverageKm: returnInspection.chargeableOverageKm,
            mileageStatus: returnInspection.mileageStatus,
            isLate: returnInspection.isLate,
            lateMinutes: returnInspection.lateMinutes,
            hasDamage: returnInspection.hasDamage,
            hasCleaningIssue: returnInspection.hasCleaningIssue,
            hasFuelShortage: returnInspection.hasFuelShortage,
            conditionNotes: returnInspection.conditionNotes,
            vehicleCondition: returnInspection.vehicleCondition,
            accessoriesSnapshot: returnInspection.accessoriesSnapshot,
            vehicleDocumentsSnapshot: returnInspection.vehicleDocumentsSnapshot,
            inspectionStatus: returnInspection.inspectionStatus,
            ownerConfirmedAt: returnInspection.ownerConfirmedAt,
            renterConfirmedAt: returnInspection.renterConfirmedAt,
          }
        : null,
      extraCharges: extraCharges.map((charge: any) => ({
        _id: String(charge._id),
        type: charge.type,
        amount: charge.amount,
        description: charge.description,
        status: charge.status,
        createdAt: charge.createdAt,
        paidAt: charge.paidAt,
        paymentMethod: charge.paymentMethod,
        evidenceImages: charge.evidenceImages || [],
      })),
      // Không trả recipientInfo (số tài khoản/ví) hay thông tin nội bộ của
      // VNPay. Hai bên chỉ cần trạng thái, số tiền và mã tham chiếu an toàn.
      refunds: refunds.map((refund: any) => ({
        _id: String(refund._id),
        refundAmount: refund.refundAmount,
        method: refund.method,
        status: refund.status,
        requestedAt: refund.requestedAt,
        processingAt: refund.processingAt,
        succeededAt: refund.succeededAt,
        reference:
          refund.manualRefundReference || refund.providerRefundId || undefined,
      })),
    };
  }

  private async buildContractResponse(contract: any, includeAppendix = false) {
    const booking =
      contract &&
      typeof contract.bookingId === "object"
        ? contract.bookingId
        : await BookingModel.findById(contract.bookingId);

    if (!booking) {
      const plainContract = contract.toObject
        ? contract.toObject()
        : contract;
      const {
        renterIdentityNumber: _legacyRenterIdentityNumber,
        ...safeContract
      } = plainContract as any;
      return safeContract;
    }

    const paymentSummary =
      await syncContractFromBooking(booking);

    const nextStatus =
      getContractStatusForBookingStatus(
        booking.status,
      );

    const plainContract =
      contract.toObject
        ? contract.toObject()
        : contract;

    // Không trả lại dữ liệu giấy tờ cũ có thể còn nằm trong Booking được populate.
    const {
      renterIdentityNumber: _legacyRenterIdentityNumber,
      bookingId: rawBookingId,
      ...safeContract
    } = plainContract as any;
    const safeBooking =
      rawBookingId && typeof rawBookingId === "object"
        ? {
            ...rawBookingId,
            renterInfo: {
              fullName: rawBookingId.renterInfo?.fullName,
              phone: rawBookingId.renterInfo?.phone,
              email: rawBookingId.renterInfo?.email,
              note: rawBookingId.renterInfo?.note,
            },
            renterEligibilitySnapshot: rawBookingId.renterEligibilitySnapshot
              ? {
                  identityProfileCompleted:
                    rawBookingId.renterEligibilitySnapshot.identityProfileCompleted === true,
                  identityVerificationStatus:
                    rawBookingId.renterEligibilitySnapshot.identityVerificationStatus || null,
                  driverLicenseClass:
                    rawBookingId.renterEligibilitySnapshot.driverLicenseClass || null,
                  licenseEligible:
                    rawBookingId.renterEligibilitySnapshot.licenseEligible === true,
                  checkedAt: rawBookingId.renterEligibilitySnapshot.checkedAt,
                }
              : undefined,
          }
        : rawBookingId;

    const hasReview =
      booking.status === BookingStatusEnum.COMPLETED
        ? Boolean(
            await ReviewModel.exists({
              bookingId: booking._id,
              renterId: booking.userId,
            }),
          )
        : false;

    const appendix = includeAppendix
      ? await this.buildContractAppendix(rawBookingId)
      : undefined;

    return {
      ...safeContract,
      bookingId: safeBooking,

      status: nextStatus,

      hasReview,

      canReview:
        booking.status === BookingStatusEnum.COMPLETED &&
        !hasReview,

      // totalPrice thuộc Contract là giá trị thỏa thuận gốc. Tổng hiện tại của
      // booking (có thể đã gồm gia hạn) chỉ nằm trong paymentSummary/phụ lục.
      totalPrice: safeContract.totalPrice,
      upfrontPaymentAmount: paymentSummary.upfrontPaymentAmount,
      paidAmount: paymentSummary.paidAmount,
      remainingAmount:
        paymentSummary.remainingAmount,

      paymentStatus:
        paymentSummary.paymentStatus,

      paymentSummary,

      ...(appendix ? { appendix } : {}),
    };
  }

  /**
   * Người thuê lấy/tạo Contract của Booking.
   *
   * Contract thực tế được tạo tự động
   * khi bắt đầu quá trình thanh toán.
   */
  async createContract(
    req: Request,
    res: Response,
  ) {
    const authUser = (req as any).user;

    const { bookingId } = req.body;

    if (!bookingId) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu bookingId",
      );
    }

    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: bookingId,
      userId: authUser.userId,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound(
        "Booking",
      );
    }

    if (
      ![
        BookingStatusEnum.OWNER_APPROVED,
        BookingStatusEnum.PAYMENT_PENDING,
        BookingStatusEnum.PAID,
        BookingStatusEnum.IN_PROGRESS,
      ].includes(
        booking.status as BookingStatusEnum,
      )
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking cần được chủ xe xác nhận trước khi tạo hợp đồng",
      );
    }

    if (
      [
        BookingStatusEnum.CANCELLED,
        BookingStatusEnum.COMPLETED,
        BookingStatusEnum.NO_SHOW,
      ].includes(
        booking.status as BookingStatusEnum,
      )
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking không còn khả dụng để tạo hợp đồng",
      );
    }

    const existedContract =
      await ContractModel.findOne({
        bookingId: booking._id,
        isDeleted: false,
      })
        .populate("carId")
        .populate(this.getOwnerPopulate())
        .populate("bookingId");

    if (existedContract) {
      const contractResponse =
        await this.buildContractResponse(
          existedContract,
        );

      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Contract đã tồn tại",
        data: {
          contract: contractResponse,
        },
      });
    }

    throw ErrorHelper.requestDataInvalid(
      "Hợp đồng được hệ thống tạo khi bạn bắt đầu thanh toán booking",
    );
  }

  /**
   * Danh sách Contract của người thuê.
   */
  async getMyContracts(
    req: Request,
    res: Response,
  ) {
    const authUser = (req as any).user;

    const contracts = await ContractModel.find({
      userId: authUser.userId,
      isDeleted: false,
    })
      .populate("carId")
      .populate(this.getOwnerPopulate())
      .populate("bookingId")
      .sort({
        createdAt: -1,
      });

    const contractResponses =
      await Promise.all(
        contracts.map((contract) =>
          this.buildContractResponse(contract),
        ),
      );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        contracts: contractResponses,
      },
    });
  }

  /**
   * Xem chi tiết Contract.
   *
   * USER được xem Contract nếu:
   * - là người thuê
   * hoặc
   * - là chủ xe.
   */
  async getContractDetail(
    req: Request,
    res: Response,
  ) {
    const authUser = (req as any).user;

    const id = String(req.params.id);

    const contract =
      await ContractModel.findOne({
        _id: id,
        isDeleted: false,
      } as any);

    if (!contract) {
      throw ErrorHelper.recordNotFound(
        "Hợp đồng",
      );
    }

    const renterId =
      (contract as any).userId?._id ||
      contract.userId;

    const ownerId =
      (contract as any).ownerId?._id ||
      contract.ownerId;

    const isRenter =
      String(renterId || "") ===
      String(authUser.userId || "");

    const isOwner =
      String(ownerId || "") ===
      String(authUser.userId || "");

    if (!isRenter && !isOwner) {
      throw ErrorHelper.permissionDeny();
    }

    await contract.populate("carId");

    await contract.populate(
      this.getOwnerPopulate(),
    );

    await contract.populate("bookingId");

    const contractResponse =
      await this.buildContractResponse(contract, true);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        contract: contractResponse,
      },
    });
  }

  /**
   * Danh sách Contract của những xe
   * thuộc USER đang đăng nhập.
   */
  async getOwnerContracts(
    req: Request,
    res: Response,
  ) {
    const authUser = (req as any).user;

    const owner =
      await this.getOwnerContext(authUser);

    const contracts =
      await ContractModel.find({
        ...this.buildOwnerFilter(owner),
        isDeleted: false,
      })
        .populate(
          "userId",
          "-password -otpCode",
        )
        .populate(
          this.getOwnerPopulate(),
        )
        .populate("carId")
        .populate("bookingId")
        .sort({
          createdAt: -1,
        });

    const contractResponses =
      await Promise.all(
        contracts.map((contract) =>
          this.buildContractResponse(contract),
        ),
      );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        contracts: contractResponses,
      },
    });
  }
}

export default new ContractRoute().router;
