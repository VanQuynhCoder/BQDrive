import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { ContractModel } from "../../models/contract/contract.model";
import { ReviewModel } from "../../models/review/review.model";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import {
  getContractStatusForBookingStatus,
  syncContractFromBooking,
} from "../../helper/payment-sync.helper";
import {
  BookingStatusEnum,
  OwnerTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const RENTER_ROLES = [UserRoleEnum.USER];

class ContractRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post(
      "/create",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.createContract),
    );

    this.router.get(
      "/my-contracts",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER, UserRoleEnum.BUSINESS]),
      ],
      this.route(this.getMyContracts),
    );

    this.router.get(
      "/owner/my-contracts",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerContracts),
    );

    this.router.get(
      "/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER, UserRoleEnum.BUSINESS]),
      ],
      this.route(this.getContractDetail),
    );
  }

  private async getOwnerContext(authUser: any) {
    if (authUser.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: authUser.userId,
        isDeleted: false,
      });

      if (!business) {
        return null;
      }

      return {
        ownerId: business._id,
        ownerType: OwnerTypeEnum.BUSINESS,
        ownerModel: "Business",
        business,
      };
    }

    return {
      ownerId: authUser.userId,
      ownerType: OwnerTypeEnum.USER,
      ownerModel: "User",
      business: null,
    };
  }

  private buildOwnerFilter(owner: any) {
    const ownerFilter = {
      ownerId: owner.ownerId,
      ownerType: owner.ownerType,
    };

    if (owner.ownerType === OwnerTypeEnum.BUSINESS && owner.business?._id) {
      return {
        $or: [
          ownerFilter,
          { businessId: owner.business._id, ownerId: { $exists: false } },
        ],
      };
    }

    return ownerFilter;
  }

  private getBusinessPopulate() {
    return {
      path: "businessId",
      populate: {
        path: "userId",
        select: "-password -otpCode",
      },
    };
  }

  private async buildContractResponse(contract: any) {
    const booking =
      contract && typeof contract.bookingId === "object"
        ? contract.bookingId
        : await BookingModel.findById(contract.bookingId);

    if (!booking) {
      return contract.toObject ? contract.toObject() : contract;
    }

    const paymentSummary = await syncContractFromBooking(booking);
    const nextStatus = getContractStatusForBookingStatus(booking.status);
    const plainContract = contract.toObject ? contract.toObject() : contract;
    const hasReview =
      booking.status === BookingStatusEnum.COMPLETED
        ? Boolean(
            await ReviewModel.exists({
              bookingId: booking._id,
              renterId: booking.userId,
            }),
          )
        : false;

    return {
      ...plainContract,
      status: nextStatus,
      hasReview,
      canReview: booking.status === BookingStatusEnum.COMPLETED && !hasReview,
      totalPrice: paymentSummary.totalPrice,
      depositAmount: paymentSummary.depositAmount,
      paidAmount: paymentSummary.paidAmount,
      remainingAmount: paymentSummary.remainingAmount,
      paymentStatus: paymentSummary.paymentStatus,
      paymentSummary,
    };
  }

  async createContract(req: Request, res: Response) {
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
      throw ErrorHelper.recordNotFound("Booking");
    }

    if (
      ![
        BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã duyệt, khách được tạo hợp đồng trước khi thanh toán
        BookingStatusEnum.PAYMENT_PENDING, // Khách đang thanh toán, hợp đồng vẫn hợp lệ
        BookingStatusEnum.PAID, // Đã thanh toán, hợp đồng có thể xem/tái dùng
        BookingStatusEnum.IN_PROGRESS, // Đang thuê, hợp đồng vẫn còn hiệu lực
      ].includes(booking.status as BookingStatusEnum)
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
      ].includes(booking.status as BookingStatusEnum)
    ) {
      throw ErrorHelper.requestDataInvalid("Booking không còn khả dụng để tạo hợp đồng");
    }

    const existedContract = await ContractModel.findOne({
      bookingId: booking._id,
      isDeleted: false,
    })
      .populate("carId")
      .populate("ownerId", "-password -otpCode")
      .populate(this.getBusinessPopulate())
      .populate("bookingId");

    if (existedContract) {
      const contractResponse = await this.buildContractResponse(existedContract);

      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Contract đã tồn tại",
        data: { contract: contractResponse },
      });
    }

    throw ErrorHelper.requestDataInvalid(
      "Hợp đồng được hệ thống tạo khi bạn bắt đầu thanh toán booking",
    );
  }

  async getMyContracts(req: Request, res: Response) {
    const authUser = (req as any).user;

    const contracts = await ContractModel.find({
      userId: authUser.userId,
      isDeleted: false,
    })
      .populate("carId")
      .populate("ownerId", "-password -otpCode")
      .populate(this.getBusinessPopulate())
      .populate("bookingId")
      .sort({ createdAt: -1 });
    const contractResponses = await Promise.all(
      contracts.map((contract) => this.buildContractResponse(contract)),
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { contracts: contractResponses },
    });
  }

  async getContractDetail(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    const contract = await ContractModel.findOne({
      _id: id,
      isDeleted: false,
    } as any);

    if (!contract) {
      throw ErrorHelper.recordNotFound("Hợp đồng");
    }

    const isRenter = String(contract.userId) === String(authUser.userId);
    let isOwner = false;

    if (authUser.role === UserRoleEnum.USER) {
      isOwner =
        contract.ownerType === OwnerTypeEnum.USER &&
        String(contract.ownerId) === String(authUser.userId);
    } else if (authUser.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: authUser.userId,
        isDeleted: false,
      }).select("_id");

      if (business) {
        isOwner =
          (contract.ownerType === OwnerTypeEnum.BUSINESS &&
            String(contract.ownerId) === String(business._id)) ||
          String(contract.businessId || "") === String(business._id);
      }
    }

    if (!isRenter && !isOwner) {
      throw ErrorHelper.permissionDeny();
    }

    await contract.populate("carId");
    await contract.populate("ownerId", "-password -otpCode");
    await contract.populate(this.getBusinessPopulate());
    await contract.populate("bookingId");
    const contractResponse = await this.buildContractResponse(contract);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { contract: contractResponse },
    });
  }

  async getOwnerContracts(req: Request, res: Response) {
    const authUser = (req as any).user;

    const owner = await this.getOwnerContext(authUser);

    if (!owner) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "success",
        data: { contracts: [] },
      });
    }

    const contracts = await ContractModel.find({
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    })
      .populate("userId", "-password -otpCode")
      .populate("ownerId", "-password -otpCode")
      .populate("carId")
      .populate("bookingId")
      .sort({ createdAt: -1 });
    const contractResponses = await Promise.all(
      contracts.map((contract) => this.buildContractResponse(contract)),
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { contracts: contractResponses },
    });
  }
}

export default new ContractRoute().router;
