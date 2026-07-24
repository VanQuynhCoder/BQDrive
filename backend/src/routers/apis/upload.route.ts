import multer from "multer";

import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserRoleEnum } from "../../constants/model.const";
import { uploadCarImageBuffer } from "../../services/cloudinary.service";

const MAX_CAR_IMAGE_SIZE = 5 * 1024 * 1024;

const carImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CAR_IMAGE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      callback(ErrorHelper.requestDataInvalid("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP"));
      return;
    }

    callback(null, true);
  },
});

class UploadRoute extends BaseRoute {
  customRouting() {
    this.router.post(
      "/car-image",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
        carImageUpload.single("image"),
      ],
      this.route(this.uploadCarImage),
    );
  }

  async uploadCarImage(req: Request, res: Response) {
    const file = req.file;

    if (!file) {
      throw ErrorHelper.requestDataInvalid("Vui lòng chọn ảnh xe");
    }

    const image = await uploadCarImageBuffer({
      buffer: file.buffer,
      mimetype: file.mimetype,
    });

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Upload ảnh xe thành công",
      data: { image },
    });
  }
}

export default new UploadRoute().router;
