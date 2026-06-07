import express, { Request, Response, NextFunction } from "express";

import { ErrorHelper } from "./error";
import { TokenHelper } from "../helper/token.helper";

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

  authentication(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.headers["x-token"] as string;

      if (!token) {
        throw ErrorHelper.unauthorized();
      }

      const decoded = TokenHelper.verifyToken(token);

      (req as any).user = decoded;

      next();
    } catch (error) {
      next(ErrorHelper.badToken());
    }
  }
  roleGuard(roles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as any).user;

        if (!user) {
          throw ErrorHelper.unauthorized();
        }

        if (!roles.includes(user.role)) {
          throw ErrorHelper.permissionDeny();
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }
}

export type { Request, Response, NextFunction };
