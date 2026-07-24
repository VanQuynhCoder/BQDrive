import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { RefundStatusEnum, UserRoleEnum } from "../../constants/model.const";
import { BookingModel } from "../../models/booking/booking.model";
import { RefundModel } from "../../models/refund/refund.model";
import { cancellationRefundService } from "../../services/cancellation-refund.service";
import { notificationCenterService } from "../../services/notification-center.service";

class RefundRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/my",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER, UserRoleEnum.BUSINESS]),
      ],
      this.route(this.getMyRefunds),
    );

    this.router.get(
      "/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER, UserRoleEnum.BUSINESS]),
      ],
      this.route(this.getRefundDetail),
    );

    this.router.post(
      "/:id/recipient-info",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.submitRecipientInfo),
    );

    this.router.post(
      "/:id/manual-sent",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER, UserRoleEnum.BUSINESS]),
      ],
      this.route(this.markManualSent),
    );

    this.router.post(
      "/:id/confirm-received",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.confirmReceived),
    );
  }

  private formatRecipientInfo(info: unknown, includeFull: boolean) {
    const value = (info || {}) as Record<string, unknown>;
    const method = String(value.method || "");

    if (!method) return undefined;

    if (method === "BANK_TRANSFER") {
      return {
        method,
        bankName: value.bankName,
        accountHolderName: value.accountHolderName,
        accountNumber: includeFull ? value.accountNumber : undefined,
        accountNumberMasked: value.accountNumberMasked,
        submittedAt: value.submittedAt,
      };
    }

    if (method === "E_WALLET") {
      return {
        method,
        walletProvider: value.walletProvider,
        walletHolderName: value.walletHolderName,
        walletAccount: includeFull ? value.walletAccount : undefined,
        walletAccountMasked: value.walletAccountMasked,
        submittedAt: value.submittedAt,
      };
    }

    return {
      method,
      cashNote: includeFull ? value.cashNote : undefined,
      submittedAt: value.submittedAt,
    };
  }

  private formatRefundResponse(refund: unknown, includeFullRecipientInfo: boolean) {
    const source =
      refund &&
      typeof refund === "object" &&
      "toObject" in refund &&
      typeof (refund as { toObject?: unknown }).toObject === "function"
        ? (refund as { toObject: () => Record<string, unknown> }).toObject()
        : (refund as Record<string, unknown>);
    const { recipientInfo, ...rest } = source;

    return {
      ...rest,
      recipientInfo: this.formatRecipientInfo(
        recipientInfo,
        includeFullRecipientInfo,
      ),
    };
  }

  private async assertCanSeeRefund(refund: any, authUser: any) {
    const canSee = await cancellationRefundService.userCanSeeRefund(refund, {
      userId: authUser.userId,
      role: authUser.role,
    });

    if (!canSee) {
      throw ErrorHelper.permissionDeny();
    }
  }

  async getMyRefunds(req: Request, res: Response) {
    const authUser = (req as any).user;
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
    const scope = String(req.query.scope || "all").toLowerCase();
    const status = String(req.query.status || "").trim().toUpperCase();
    const query: Record<string, unknown> = { isDeleted: false };

    if (status && status !== "ALL") {
      query.status = status;
    }

    const refunds = await RefundModel.find(query)
      .populate({
        path: "bookingId",
        select:
          "_id userId ownerId ownerType businessId carId status startDate endDate cancelReason cancelReasonText cancelledAt cancelledByRole",
        populate: [
          { path: "carId", select: "name licensePlate images" },
          { path: "userId", select: "name email phone" },
        ],
      })
      .populate("paymentIds", "amount method status paymentType refundedAmount paidAt")
      .sort({ createdAt: -1 })
      .lean();

    const visibleRefunds = [];

    for (const refund of refunds) {
      const actor = {
        userId: authUser.userId,
        role: authUser.role,
      };
      const canSee =
        scope === "owner"
          ? await cancellationRefundService.userCanProcessManualRefund(refund, actor)
          : await cancellationRefundService.userCanSeeRefund(refund, actor);
      if (canSee) visibleRefunds.push(this.formatRefundResponse(refund, false));
    }

    const total = visibleRefunds.length;
    const pagedRefunds = visibleRefunds.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        refunds: pagedRefunds,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  }

  async getRefundDetail(req: Request, res: Response) {
    const authUser = (req as any).user;
    const refund = await RefundModel.findOne({
      _id: String(req.params.id),
      isDeleted: false,
    })
      .populate({
        path: "bookingId",
        populate: { path: "carId", select: "name licensePlate images" },
      })
      .populate("paymentIds", "amount method status paymentType refundedAmount paidAt");

    if (!refund) {
      throw ErrorHelper.recordNotFound("Refund");
    }

    await this.assertCanSeeRefund(refund, authUser);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { refund: this.formatRefundResponse(refund, true) },
    });
  }

  async submitRecipientInfo(req: Request, res: Response) {
    const authUser = (req as any).user;
    const refund = await cancellationRefundService.submitRecipientInfo(
      String(req.params.id),
      {
        userId: authUser.userId,
        role: authUser.role,
      },
      req.body || {},
    );
    const booking = await BookingModel.findById(refund.bookingId);

    void notificationCenterService.notifyRefundRecipientInfoSubmitted(
      refund,
      booking,
      authUser.userId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã ghi nhận thông tin nhận tiền hoàn",
      data: { refund: this.formatRefundResponse(refund, true) },
    });
  }

  async markManualSent(req: Request, res: Response) {
    const authUser = (req as any).user;
    const refund = await cancellationRefundService.markManualRefundSent(
      String(req.params.id),
      {
        userId: authUser.userId,
        role: authUser.role,
      },
      req.body || {},
    );
    const booking = await BookingModel.findById(refund.bookingId);

    void notificationCenterService.notifyManualRefundSent(
      refund,
      booking,
      authUser.userId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã ghi nhận chủ xe gửi tiền hoàn thủ công",
      data: { refund: this.formatRefundResponse(refund, true) },
    });
  }

  async confirmReceived(req: Request, res: Response) {
    const authUser = (req as any).user;
    const refund = await cancellationRefundService.confirmRefundReceived(
      String(req.params.id),
      {
        userId: authUser.userId,
        role: authUser.role,
      },
    );
    const booking = await BookingModel.findById(refund.bookingId);

    if (refund.status !== RefundStatusEnum.SUCCEEDED) {
      throw ErrorHelper.requestDataInvalid("REFUND_MANUAL_CONFIRMATION_REQUIRED");
    }

    void notificationCenterService.notifyRefundSucceeded(
      refund,
      booking,
      authUser.userId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã xác nhận nhận tiền hoàn",
      data: { refund: this.formatRefundResponse(refund, true) },
    });
  }
}

export default new RefundRoute().router;
