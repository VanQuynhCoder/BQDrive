import {
  BaseRoute,
  NextFunction,
  Request,
  Response,
} from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserRoleEnum } from "../../constants/model.const";
import { UserModel } from "../../models/user/user.model";
import { supportChatService } from "../../services/support-chat.service";

function activeSupportRoleGuard(roles: UserRoleEnum[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authUser = (req as any).user;
      const user = await UserModel.findOne({
        _id: String(authUser?.userId || ""),
        role: { $in: roles },
        isDeleted: { $ne: true },
        isBlocked: { $ne: true },
      })
        .select("_id role")
        .lean();

      if (!user) {
        throw ErrorHelper.permissionDeny();
      }

      authUser.userId = String(user._id);
      authUser.role = user.role;
      next();
    } catch (error) {
      next(error);
    }
  };
}

class SupportRoute extends BaseRoute {
  customRouting() {
    this.router.get(
      "/my-conversation",
      [this.authentication, activeSupportRoleGuard([UserRoleEnum.USER])],
      this.route(this.getMyConversation),
    );
    this.router.get(
      "/admin/conversations",
      [this.authentication, activeSupportRoleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getAdminConversations),
    );
    this.router.get(
      "/admin/conversations/:conversationId/messages",
      [this.authentication, activeSupportRoleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getAdminMessages),
    );
    this.router.patch(
      "/admin/conversations/:conversationId/status",
      [this.authentication, activeSupportRoleGuard([UserRoleEnum.ADMIN])],
      this.route(this.updateStatus),
    );
  }

  async getMyConversation(req: Request, res: Response) {
    const authUser = (req as any).user;
    const data = await supportChatService.getMyConversation(
      String(authUser.userId || ""),
      req.query.limit,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data,
    });
  }

  async getAdminConversations(_req: Request, res: Response) {
    const conversations = await supportChatService.getAdminConversations();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { conversations },
    });
  }

  async getAdminMessages(req: Request, res: Response) {
    const authUser = (req as any).user;
    const messages = await supportChatService.getMessages(
      String(req.params.conversationId || ""),
      String(authUser.userId || ""),
      UserRoleEnum.ADMIN,
      req.query.limit,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { messages },
    });
  }

  async updateStatus(req: Request, res: Response) {
    const authUser = (req as any).user;
    const conversation = await supportChatService.updateStatus(
      String(req.params.conversationId || ""),
      String(authUser.userId || ""),
      req.body?.status,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã cập nhật trạng thái hỗ trợ",
      data: { conversation },
    });
  }
}

export default new SupportRoute().router;
