import express, { Request, Response, NextFunction } from "express";

import { BaseError, ErrorHelper } from "./error";
import { TokenHelper } from "../helper/token.helper";
import { UserModel } from "../models/user/user.model";
import { UserRoleEnum } from "../constants/model.const";

function normalizeAuthRole(role?: unknown): UserRoleEnum | null {
  const normalizedRole = String(role || "").toUpperCase();

  if (normalizedRole === UserRoleEnum.ADMIN) {
    return UserRoleEnum.ADMIN;
  }

  if (normalizedRole === UserRoleEnum.USER) {
    return UserRoleEnum.USER;
  }

  return null;
}

export class BaseRoute {
  router = express.Router();

  constructor() {
    this.customRouting();
  }

  customRouting(): void {}

  route(controller: any) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        await controller.call(this, req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }

  async authentication(req: Request, res: Response, next: NextFunction) {
    try {
      const xToken = req.headers["x-token"];
      const authorization = req.headers.authorization;
      const token =
        (Array.isArray(xToken) ? xToken[0] : xToken) ||
        (authorization?.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : undefined);

      if (!token) {
        throw ErrorHelper.unauthorized();
      }

      const decoded = TokenHelper.verifyToken(token) as any;
      const userId = String(decoded?.userId || "");

      if (!userId) {
        throw ErrorHelper.badToken();
      }

      // Token còn hạn chưa đủ để bảo đảm tài khoản vẫn được phép sử dụng.
      // Luôn đọc lại User để khóa/xóa mềm có hiệu lực ngay với token cũ.
      const user = await UserModel.findById(userId)
        .select("_id role isBlocked isDeleted")
        .lean();

      if (!user || user.isDeleted) {
        throw ErrorHelper.userNotExist();
      }

      if (user.isBlocked) {
        throw ErrorHelper.userWasBlock();
      }

      const role = normalizeAuthRole(user.role);
      if (!role) {
        throw ErrorHelper.permissionDeny();
      }

      decoded.userId = String(user._id);
      decoded.role = role;
      (req as any).user = decoded;

      next();
    } catch (error) {
      next(error instanceof BaseError ? error : ErrorHelper.badToken());
    }
  }
  roleGuard(roles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as any).user;

        if (!user) {
          throw ErrorHelper.unauthorized();
        }

        const role = normalizeAuthRole(user.role);

        if (!role || !roles.includes(role)) {
          throw ErrorHelper.permissionDeny();
        }

        user.role = role;

        next();
      } catch (error) {
        next(error);
      }
    };
  }
}

export type { Request, Response, NextFunction };
