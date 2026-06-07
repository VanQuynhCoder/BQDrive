import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { PrivateOwnerRequestModel } from "../../models/private-owner-request/privateOwnerRequest.model";
import { UserModel } from "../../models/user/user.model";
import { BusinessModel } from "../../models/business/business.model";
import {
  BusinessTypeEnum,
  PrivateOwnerRequestStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";

class PrivateOwnerRequestRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post(
      "/createRequest",
      [this.authentication, this.roleGuard([UserRoleEnum.CUSTOMER])],
      this.route(this.createRequest),
    );

    this.router.get(
      "/myRequest",
      [this.authentication, this.roleGuard([UserRoleEnum.CUSTOMER, UserRoleEnum.PRIVATE_OWNER])],
      this.route(this.getMyRequest),
    );

    this.router.get(
      "/admin/getAll",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getAllRequests),
    );

    this.router.get(
      "/admin/detail/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getRequestDetail),
    );

    this.router.post(
      "/admin/approve/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.approveRequest),
    );

    this.router.post(
      "/admin/reject/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.rejectRequest),
    );
  }

  async createRequest(req: Request, res: Response) {
    const authUser = (req as any).user;

    const {
      fullName,
      phone,
      identityNumber,
      frontImage,
      backImage,
      address,
      reason,
    } = req.body;

    if (!fullName || !phone || !identityNumber || !frontImage || !backImage || !address) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu fullName, phone, identityNumber, frontImage, backImage hoặc address",
      );
    }

    const user = await UserModel.findOne({
      _id: authUser.userId,
      isDeleted: false,
    });

    if (!user) {
      throw ErrorHelper.userNotExist();
    }

    if (user.role === UserRoleEnum.PRIVATE_OWNER) {
      throw ErrorHelper.requestDataInvalid("Tài khoản đã là chủ xe tư nhân");
    }

    const existedPending = await PrivateOwnerRequestModel.findOne({
      userId: authUser.userId,
      status: PrivateOwnerRequestStatusEnum.PENDING,
      isDeleted: false,
    });

    if (existedPending) {
      throw ErrorHelper.requestDataInvalid("Bạn đã có hồ sơ đang chờ duyệt");
    }

    const request = await PrivateOwnerRequestModel.create({
      userId: authUser.userId,
      fullName,
      phone,
      identityNumber,
      frontImage,
      backImage,
      address,
      reason,
      status: PrivateOwnerRequestStatusEnum.PENDING,
    });

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Gửi hồ sơ đăng ký chủ xe tư nhân thành công",
      data: { request },
    });
  }

  async getMyRequest(req: Request, res: Response) {
    const authUser = (req as any).user;

    const requests = await PrivateOwnerRequestModel.find({
      userId: authUser.userId,
      isDeleted: false,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { requests },
    });
  }

  async getAllRequests(req: Request, res: Response) {
    const { status } = req.query;

    const filter: any = {
      isDeleted: false,
    };

    if (status) {
      filter.status = status;
    }

    const requests = await PrivateOwnerRequestModel.find(filter)
      .populate("userId", "-password")
      .populate("approvedBy", "-password")
      .populate("rejectedBy", "-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { requests },
    });
  }

  async getRequestDetail(req: Request, res: Response) {
    const id = String(req.params.id);

    const request = await PrivateOwnerRequestModel.findOne({
      _id: id,
      isDeleted: false,
    })
      .populate("userId", "-password")
      .populate("approvedBy", "-password")
      .populate("rejectedBy", "-password");

    if (!request) {
      throw ErrorHelper.recordNotFound("Hồ sơ chủ xe tư nhân");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { request },
    });
  }

  async approveRequest(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { adminNote } = req.body;

    const request = await PrivateOwnerRequestModel.findOne({
      _id: id,
      status: PrivateOwnerRequestStatusEnum.PENDING,
      isDeleted: false,
    });

    if (!request) {
      throw ErrorHelper.recordNotFound("Hồ sơ PENDING");
    }

    const user = await UserModel.findOne({
      _id: request.userId,
      isDeleted: false,
    });

    if (!user) {
      throw ErrorHelper.userNotExist();
    }

    user.role = UserRoleEnum.PRIVATE_OWNER;
    await user.save();

    await BusinessModel.findOneAndUpdate(
      {
        userId: user._id,
        isDeleted: false,
      },
      {
        businessName: request.fullName || user.name,
        businessType: BusinessTypeEnum.INDIVIDUAL,
        phone: request.phone || user.phone,
        address: request.address,
        description: request.reason,
        isApproved: true,
        isRejected: false,
        rejectReason: "",
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    request.status = PrivateOwnerRequestStatusEnum.APPROVED;
    request.adminNote = adminNote;
    request.approvedAt = new Date();
    request.approvedBy = authUser.userId;

    await request.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Duyệt hồ sơ thành công, tài khoản đã trở thành chủ xe tư nhân",
      data: { request, user },
    });
  }

  async rejectRequest(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { adminNote } = req.body;

    if (!adminNote) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập lý do từ chối");
    }

    const request = await PrivateOwnerRequestModel.findOne({
      _id: id,
      status: PrivateOwnerRequestStatusEnum.PENDING,
      isDeleted: false,
    });

    if (!request) {
      throw ErrorHelper.recordNotFound("Hồ sơ PENDING");
    }

    request.status = PrivateOwnerRequestStatusEnum.REJECTED;
    request.adminNote = adminNote;
    request.rejectedAt = new Date();
    request.rejectedBy = authUser.userId;

    await request.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Từ chối hồ sơ thành công",
      data: { request },
    });
  }
}

export default new PrivateOwnerRequestRoute().router;
