import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { ContractModel } from "../../models/contract/contract.model";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import {
  BookingStatusEnum,
  BusinessTypeEnum,
  ContractStatusEnum,
  OwnerTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const RENTER_ROLES = [UserRoleEnum.CUSTOMER, UserRoleEnum.PRIVATE_OWNER];

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
        this.roleGuard([UserRoleEnum.CUSTOMER, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.getMyContracts),
    );

    this.router.get(
      "/owner/my-contracts",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.getOwnerContracts),
    );

    this.router.get(
      "/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.CUSTOMER, UserRoleEnum.PRIVATE_OWNER]),
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

  private getOwnerType(business: any) {
    return business?.businessType === BusinessTypeEnum.INDIVIDUAL
      ? OwnerTypeEnum.PRIVATE_OWNER
      : OwnerTypeEnum.BUSINESS;
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
        "Thiếu bookingId hoặc thông tin người thuê",
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
      .populate("businessId")
      .populate("bookingId");

    if (existedContract) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Contract đã tồn tại",
        data: { contract: existedContract },
      });
    }

    const business = await BusinessModel.findOne({
      _id: booking.businessId,
      isDeleted: false,
    });

    const contract = await ContractModel.create({
      bookingId: booking._id,
      userId: booking.userId,
      carId: booking.carId,
      businessId: booking.businessId,
      ownerType: this.getOwnerType(business),
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
      paymentOption: booking.paymentOption,
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
      message: "Tạo hợp đồng thuê xe thành công",
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
      throw ErrorHelper.recordNotFound("Hợp đồng");
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

    const business = await BusinessModel.findOne({
      userId: authUser.userId,
      isDeleted: false,
    });

    if (!business) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "success",
        data: { contracts: [] },
      });
    }

    const contracts = await ContractModel.find({
      businessId: business._id,
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
