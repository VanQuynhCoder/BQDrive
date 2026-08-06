import multer from "multer";

import { BaseRoute, NextFunction, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserRoleEnum } from "../../constants/model.const";
import {
  findGridFsCarImage,
  uploadCarImageToGridFs,
} from "../../services/cloudinary.service";

const MAX_CAR_IMAGE_SIZE = 10 * 1024 * 1024;

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
    this.router.get(
      "/car-images/:fileId",
      this.route(this.getCarImage),
    );

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

    const image = await uploadCarImageToGridFs({
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

  async getCarImage(req: Request, res: Response, next: NextFunction) {
    const storedImage = await findGridFsCarImage(String(req.params.fileId || ""));

    if (!storedImage) {
      throw ErrorHelper.recordNotFound("Không tìm thấy ảnh xe");
    }

    const { bucket, file } = storedImage;
    const contentType = String(file.metadata?.contentType || "image/jpeg");
    const etag = `"${String(file._id)}-${file.length}"`;

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(file.length));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", etag);

    const downloadStream = bucket.openDownloadStream(file._id);
    downloadStream.once("error", next);
    downloadStream.pipe(res);
  }
}

export default new UploadRoute().router;
