import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { ContractModel } from "../../models/contract/contract.model";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import {
  BookingStatusEnum,
  ContractStatusEnum,
  OwnerTypeEnum,
  PaymentOptionEnum,
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

  async createContract(req: Request, res: Response) {
    const authUser = (req as any).user;
    const {
      bookingId,
      renterName,
      renterPhone,
      renterIdentityNumber,
      renterAddress,
      note,
    } = req.body;

    if (
      !bookingId ||
      !renterName ||
      !renterPhone ||
      !renterIdentityNumber ||
      !renterAddress
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Thiáº¿u bookingId hoáº·c thÃ´ng tin ngÆ°á»i thuÃª",
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
        BookingStatusEnum.OWNER_APPROVED, // Chá»§ xe Ä‘Ã£ duyá»‡t, khÃ¡ch Ä‘Æ°á»£c táº¡o há»£p Ä‘á»“ng trÆ°á»›c khi thanh toÃ¡n
        BookingStatusEnum.PAYMENT_PENDING, // KhÃ¡ch Ä‘ang thanh toÃ¡n, há»£p Ä‘á»“ng váº«n há»£p lá»‡
        BookingStatusEnum.PAID, // ÄÃ£ thanh toÃ¡n, há»£p Ä‘á»“ng cÃ³ thá»ƒ xem/tÃ¡i dÃ¹ng
        BookingStatusEnum.IN_PROGRESS, // Äang thuÃª, há»£p Ä‘á»“ng váº«n cÃ²n hiá»‡u lá»±c
        BookingStatusEnum.CONFIRMED, // Tráº¡ng thÃ¡i cÅ©
        BookingStatusEnum.WAITING_PAYMENT, // Tráº¡ng thÃ¡i cÅ©
      ].includes(booking.status as BookingStatusEnum)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking cáº§n Ä‘Æ°á»£c chá»§ xe xÃ¡c nháº­n trÆ°á»›c khi táº¡o há»£p Ä‘á»“ng",
      );
    }

    if (
      [
        BookingStatusEnum.CANCELLED,
        BookingStatusEnum.COMPLETED,
        BookingStatusEnum.NO_SHOW,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      throw ErrorHelper.requestDataInvalid("Booking khÃ´ng cÃ²n kháº£ dá»¥ng Ä‘á»ƒ táº¡o há»£p Ä‘á»“ng");
    }

    const existedContract = await ContractModel.findOne({
      bookingId: booking._id,
      isDeleted: false,
    })
      .populate("carId")
      .populate("businessId")
      .populate("bookingId");

    if (existedContract) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Contract Ä‘Ã£ tá»“n táº¡i",
        data: { contract: existedContract },
      });
    }

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
      renterName,
      renterPhone,
      renterIdentityNumber,
      renterAddress,
      note,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalPrice: booking.totalPrice,
      depositAmount: booking.depositAmount,
      remainingAmount: booking.remainingAmount,
      paymentOption: booking.paymentOption || PaymentOptionEnum.DEPOSIT,
      status: ContractStatusEnum.ACTIVE,
      contractCode: await this.generateContractCode(),
      signedAt: new Date(),
    });

    await contract.populate("carId");
    await contract.populate("businessId");
    await contract.populate("bookingId");

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Táº¡o há»£p Ä‘á»“ng thuÃª xe thÃ nh cÃ´ng",
      data: { contract },
    });
  }

  async getMyContracts(req: Request, res: Response) {
    const authUser = (req as any).user;

    const contracts = await ContractModel.find({
      userId: authUser.userId,
      isDeleted: false,
    })
      .populate("carId")
      .populate("businessId")
      .populate("bookingId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { contracts },
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
      .populate("businessId")
      .populate("bookingId");

    if (!contract) {
      throw ErrorHelper.recordNotFound("Há»£p Ä‘á»“ng");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { contract },
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
      .populate("carId")
      .populate("bookingId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { contracts },
    });
  }
}

export default new ContractRoute().router;
