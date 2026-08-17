import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import {
  RefundMethodEnum,
  RefundStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import { BookingModel } from "../../models/booking/booking.model";
import { RefundModel } from "../../models/refund/refund.model";
import { cancellationRefundService } from "../../services/cancellation-refund.service";
import { notificationCenterService } from "../../services/notification-center.service";
import {
  sendRefundReceivedMail,
  sendRefundRecipientInfoSubmittedMail,
  sendRefundSentMail,
} from "../../helper/mail.helper";

class RefundRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/my",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getMyRefunds),
    );

    this.router.get(
      "/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
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
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.markManualSent),
    );

    this.router.post(
      "/:id/confirm-received",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.confirmReceived),
    );
        this.router.post(
      "/:id/check-vnpay-status",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.checkVnpayStatus),
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
        "_id bookingCode userId ownerId carId status startDate endDate cancelReason cancelReasonText cancelledAt cancelledByRole",
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
    void sendRefundRecipientInfoSubmittedMail(refund, booking);

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
    void sendRefundSentMail(refund, booking);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã ghi nhận chủ xe gửi tiền hoàn thủ công",
      data: { refund: this.formatRefundResponse(refund, true) },
    });
  }
async checkVnpayStatus(
  req: Request,
  res: Response,
) {
  const authUser = (req as any).user;
  const refundId = String(req.params.id);

  const refund = await RefundModel.findOne({
    _id: refundId,
    isDeleted: false,
  });

  if (!refund) {
    throw ErrorHelper.recordNotFound("Refund");
  }

  /*
   * Chỉ người có quyền xem Refund mới được
   * yêu cầu hệ thống kiểm tra trạng thái VNPay.
   */
  await this.assertCanSeeRefund(
    refund,
    authUser,
  );

  /*
   * Endpoint này chỉ dùng để kiểm tra một phiên
   * auto-refund VNPay đã được tạo trước đó.
   *
   * Không cho dùng endpoint này để khởi tạo
   * một yêu cầu hoàn tiền VNPay mới.
   */
  if (
    refund.method !== RefundMethodEnum.VNPAY
  ) {
    throw ErrorHelper.requestDataInvalid(
      "REFUND_METHOD_NOT_VNPAY",
    );
  }

  /*
   * Nếu Refund đã hoàn tất thì trả luôn dữ liệu hiện tại.
   * Không cần gọi VNPay lần nữa.
   */
  if (
    refund.status === RefundStatusEnum.SUCCEEDED
  ) {
    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Khoản hoàn tiền đã hoàn tất.",
      data: {
        refund: this.formatRefundResponse(
          refund,
          true,
        ),
        completed: true,
      },
    });
  }

  /*
   * Chỉ recovery Refund đang PROCESSING.
   *
   * Điều này rất quan trọng:
   * processAutomaticVnpayRefund() cũng có khả năng
   * bắt đầu một refund mới từ WAITING_FOR_REFUND_INFO.
   *
   * Route check trạng thái tuyệt đối không được
   * vô tình khởi tạo refund mới.
   */
  if (
    refund.status !== RefundStatusEnum.PROCESSING
  ) {
    throw ErrorHelper.requestDataInvalid(
      "REFUND_NOT_PROCESSING",
    );
  }

  const hasProviderOperations =
    Array.isArray(refund.providerOperations) &&
    refund.providerOperations.length > 0;

  if (!hasProviderOperations) {
    throw ErrorHelper.requestDataInvalid(
      "VNPAY_REFUND_OPERATION_NOT_FOUND",
    );
  }

 const result =
  await cancellationRefundService.processAutomaticVnpayRefund(
    refundId,
    String(req.ip || "127.0.0.1"),
    {
      queryOnly: true,
    },
  );  

  /*
   * Đọc lại document sau khi QueryDr xử lý
   * vì service có thể vừa cập nhật trạng thái.
   */
  const refreshedRefund =
    await RefundModel.findOne({
      _id: refundId,
      isDeleted: false,
    });

  if (!refreshedRefund) {
    throw ErrorHelper.recordNotFound("Refund");
  }

  const completed =
    refreshedRefund.status ===
    RefundStatusEnum.SUCCEEDED;

  const operation = Array.isArray(refreshedRefund.providerOperations)
    ? refreshedRefund.providerOperations.find(
        (item: any) => item.provider === "VNPAY" && item.status !== "SUCCEEDED",
      )
    : undefined;
  const operationStatus = String(result?.operationStatus || operation?.status || "");
  const reason = String(
    result?.reason || operation?.failureReason || refreshedRefund.failureReason || "",
  );
  const transactionStatus = String(operation?.transactionStatus || "");
  const responseCode = String(operation?.responseCode || "");

  let message = "Yêu cầu hoàn tiền VNPay vẫn đang được xử lý.";
  if (completed) {
    message = "Hoàn tiền VNPay đã hoàn tất.";
  } else if (
    refreshedRefund.status === RefundStatusEnum.MANUAL_REQUIRED ||
    operationStatus === "FAILED"
  ) {
    message = "VNPay từ chối hoàn tiền tự động. Khoản hoàn sẽ được xử lý theo luồng thủ công.";
  } else if (reason === "VNPAY_ORIGINAL_TRANSACTION_METADATA_MISSING") {
    message = "Không đủ thông tin giao dịch VNPay để kiểm tra trạng thái hoàn tiền.";
  } else if (
    reason === "VNPAY_QUERY_RETURNED_ORIGINAL_PAYMENT" ||
    reason === "VNPAY_QUERY_TRANSACTION_TYPE_MISMATCH" ||
    reason === "VNPAY_QUERY_TXN_REF_MISMATCH"
  ) {
    message = "VNPay trả về giao dịch không khớp với yêu cầu hoàn tiền nên chưa thể xác nhận kết quả.";
  } else if (/chữ ký phản hồi truy vấn VNPay không hợp lệ/i.test(reason)) {
    message = "Không thể xác thực phản hồi từ VNPay; trạng thái hoàn tiền chưa được thay đổi.";
  } else if (transactionStatus === "06") {
    message = "VNPay đã gửi yêu cầu hoàn tiền sang ngân hàng và đang chờ xử lý.";
  } else if (transactionStatus === "05") {
    message = "VNPay đang xử lý yêu cầu hoàn tiền.";
  } else if (responseCode === "94") {
    message = "VNPay đang giới hạn tần suất kiểm tra. Vui lòng thử lại sau.";
  } else if (responseCode && responseCode !== "00") {
    message = "VNPay chưa trả kết quả cuối cùng cho yêu cầu hoàn tiền.";
  } else if (operationStatus === "UNKNOWN") {
    message = "Chưa xác định được trạng thái cuối cùng từ VNPay. Bạn có thể kiểm tra lại sau.";
  }

  return res.status(200).json({
    status: 200,
    code: "200",
    message,
    data: {
      refund: this.formatRefundResponse(
        refreshedRefund,
        true,
      ),

      completed,

      operationStatus: operationStatus || null,

      reason: reason || null,
    },
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
    void sendRefundReceivedMail(refund, booking);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã xác nhận nhận tiền hoàn",
      data: { refund: this.formatRefundResponse(refund, true) },
    });
  }
}

export default new RefundRoute().router;
