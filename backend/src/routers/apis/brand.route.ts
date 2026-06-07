import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BrandModel } from "../../models/brand/brand.model";
import { UserRoleEnum } from "../../constants/model.const";
class BrandRoute extends BaseRoute {
  constructor() {
    super();
  }

 customRouting() {
  this.router.post(
    "/createBrand",
    [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
    this.route(this.createBrand),
  );

  this.router.get("/getAllBrand", this.route(this.getAllBrand));

  this.router.post(
    "/updateBrand/:id",
    [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
    this.route(this.updateBrand),
  );

  this.router.delete(
    "/deleteBrand/:id",
    [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
    this.route(this.deleteBrand),
  );
}

  async createBrand(req: Request, res: Response) {
    const { name, logo, description } = req.body;

    if (!name) {
      throw ErrorHelper.requestDataInvalid("Thiếu tên hãng xe");
    }

    const existedBrand = await BrandModel.findOne({
      name,
      isDeleted: false,
    });

    if (existedBrand) {
      throw ErrorHelper.requestDataInvalid("Hãng xe đã tồn tại");
    }

    const brand = await BrandModel.create({
      name,
      logo,
      description,
    });

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Tạo hãng xe thành công",
      data: { brand },
    });
  }

  async getAllBrand(req: Request, res: Response) {
    const brands = await BrandModel.find({
      isDeleted: false,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { brands },
    });
  }

  async updateBrand(req: Request, res: Response) {
    const { id } = req.params;
    const { name, logo, description } = req.body;

const brand = await BrandModel.findByIdAndUpdate(
  id,
  {
    name,
    logo,
    description,
  },
  {
    new: true,
  },
);

if (!brand || brand.isDeleted) {
  throw ErrorHelper.recordNotFound("Hãng xe");
}

    if (!brand) {
      throw ErrorHelper.recordNotFound("Hãng xe");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Cập nhật hãng xe thành công",
      data: { brand },
    });
  }

  async deleteBrand(req: Request, res: Response) {
    const { id } = req.params;

const brand = await BrandModel.findByIdAndUpdate(
  id,
  {
    isDeleted: true,
  },
  {
    new: true,
  },
);

if (!brand) {
  throw ErrorHelper.recordNotFound("Hãng xe");
}

if (!brand) {
  throw ErrorHelper.recordNotFound("Hãng xe");
}

    if (!brand) {
      throw ErrorHelper.recordNotFound("Hãng xe");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xóa hãng xe thành công",
      data: { brand },
    });
  }
}

export default new BrandRoute().router;