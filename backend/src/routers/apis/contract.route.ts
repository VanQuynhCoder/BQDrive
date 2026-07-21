import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { ContractModel } from "../../models/contract/contract.model";
import { UserModel } from "../../models/user/user.model";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import { formatAddress } from "../../helper/address.helper";
import {
  getContractStatusForBookingStatus,
  syncContractFromBooking,
} from "../../helper/payment-sync.helper";
import {
  BookingStatusEnum,
  ContractStatusEnum,
  OwnerTypeEnum,
  PaymentOptionEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const RENTER_ROLES = [UserRoleEnum.USER];
const RENTER_INFO_REQUIRED_FOR_CONTRACT_MESSAGE =
  "Booking thiếu thông tin người thuê, không thể tạo hợp đồng.";

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
        this.roleGuard([UserRoleEnum.USER]),
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
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getContractDetail),
    );
  }

  private async generateContractCode() {
    const now = new Date();
    const datePart = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const random = Math.floor(1000 + Math.random() * 9000);
      const contractCode = `HD-BQD-${datePart}-${random}`;
      const existed = await ContractModel.exists({ contractCode });

      if (!existed) return contractCode;
    }

    return `HD-BQD-${datePart}-${Date.now().toString().slice(-4)}`;
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

  private async getOwnerAddressSnapshot(booking: any) {
    const ownerType = (booking as any).ownerType || OwnerTypeEnum.BUSINESS;

    if (ownerType === OwnerTypeEnum.USER) {
      const ownerUser = await UserModel.findById((booking as any).ownerId)
        .select("-password -otpCode")
        .lean();

      return ownerUser ? formatAddress(ownerUser) : "";
    }

    const ownerBusinessId = (booking as any).ownerId || booking.businessId;
    const ownerBusiness = ownerBusinessId
      ? await BusinessModel.findById(ownerBusinessId).lean()
      : null;

    return ownerBusiness ? formatAddress(ownerBusiness) : "";
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

  private getContractRenterInfo(booking: any) {
    const renterInfo = (booking as any).renterInfo || {};
    const renterName = String(renterInfo.fullName || "").trim();
    const renterPhone = String(renterInfo.phone || "").trim();
    const renterIdentityNumber = String(renterInfo.cccdNumber || "").trim();
    const renterAddress = String(
      renterInfo.address ||
        (booking as any).pickupAddressSnapshot ||
        "",
    ).trim();

    if (!renterName || !renterPhone || !renterIdentityNumber || !renterAddress) {
      throw ErrorHelper.requestDataInvalid(RENTER_INFO_REQUIRED_FOR_CONTRACT_MESSAGE);
    }

    return {
      renterName,
      renterPhone,
      renterIdentityNumber,
      renterAddress,
      note: String(renterInfo.note || "").trim(),
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

    return {
      ...plainContract,
      status: nextStatus,
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
        BookingStatusEnum.CONFIRMED, // Trạng thái cũ
        BookingStatusEnum.WAITING_PAYMENT, // Trạng thái cũ
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

    const ownerAddressSnapshot =
      (await this.getOwnerAddressSnapshot(booking)) ||
      (booking as any).pickupAddressSnapshot ||
      "";
    const contractRenterInfo = this.getContractRenterInfo(booking);

    const contract = await ContractModel.create({
      bookingId: booking._id,
      userId: booking.userId,
      carId: booking.carId,
      ...(booking.businessId ? { businessId: booking.businessId } : {}),
      ownerId: (booking as any).ownerId || booking.businessId,
      ownerType: (booking as any).ownerType || OwnerTypeEnum.BUSINESS,
      ownerModel:
        ((booking as any).ownerType || OwnerTypeEnum.BUSINESS) ===
        OwnerTypeEnum.USER
          ? "User"
          : "Business",
      ...contractRenterInfo,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalPrice: booking.totalPrice,
      depositAmount: booking.depositAmount,
      remainingAmount: booking.remainingAmount,
      paymentOption: booking.paymentOption || PaymentOptionEnum.DEPOSIT,
      pickupAddressSnapshot: (booking as any).pickupAddressSnapshot,
      returnAddressSnapshot: (booking as any).returnAddressSnapshot,
      ownerAddressSnapshot,
      status: ContractStatusEnum.ACTIVE,
      contractCode: await this.generateContractCode(),
      signedAt: new Date(),
    });

    await contract.populate("carId");
    await contract.populate("ownerId", "-password -otpCode");
    await contract.populate(this.getBusinessPopulate());
    await contract.populate("bookingId");
    const contractResponse = await this.buildContractResponse(contract);

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Tạo hợp đồng thuê xe thành công",
      data: { contract: contractResponse },
    });
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
      userId: authUser.userId,
      isDeleted: false,
    } as any)
      .populate("carId")
      .populate("ownerId", "-password -otpCode")
      .populate(this.getBusinessPopulate())
      .populate("bookingId");

    if (!contract) {
      throw ErrorHelper.recordNotFound("Hợp đồng");
    }
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
