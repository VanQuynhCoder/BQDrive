import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import {
  NotificationTypeEnum,
} from "../../constants/model.const";
import { notificationCenterService } from "../../services/notification-center.service";
import { taskService } from "../../services/task.service";

class NotificationRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/summary",
      [this.authentication],
      this.route(this.getSummary),
    );
    this.router.get(
      "/unread-count",
      [this.authentication],
      this.route(this.getUnreadCount),
    );
    this.router.patch(
      "/read-all",
      [this.authentication],
      this.route(this.markAllRead),
    );
    this.router.patch(
      "/:notificationId/read",
      [this.authentication],
      this.route(this.markRead),
    );
    this.router.delete(
      "/:notificationId",
      [this.authentication],
      this.route(this.deleteNotification),
    );
    this.router.get("/", [this.authentication], this.route(this.getNotifications));
  }

  async getSummary(req: Request, res: Response) {
    const authUser = (req as any).user;
    const data = await taskService.getNotificationSummary(authUser);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data,
    });
  }

  private parseBoolean(value: unknown) {
    if (value === undefined || value === null || value === "") return undefined;
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    throw ErrorHelper.requestDataInvalid("Trạng thái đọc thông báo không hợp lệ");
  }

  private parseNotificationType(value: unknown) {
    if (!value) return undefined;
    const type = String(value) as NotificationTypeEnum;

    if (!Object.values(NotificationTypeEnum).includes(type)) {
      throw ErrorHelper.requestDataInvalid("Loại thông báo không hợp lệ");
    }

    return type;
  }

  async getNotifications(req: Request, res: Response) {
    const authUser = (req as any).user;
    const data = await notificationCenterService.getNotifications(authUser, {
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
      isRead: this.parseBoolean(req.query.isRead),
      type: this.parseNotificationType(req.query.type),
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data,
    });
  }

  async getUnreadCount(req: Request, res: Response) {
    const authUser = (req as any).user;
    const unreadCount = await notificationCenterService.getUnreadCount(authUser);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { unreadCount },
    });
  }

  async markRead(req: Request, res: Response) {
    const authUser = (req as any).user;
    const notification = await notificationCenterService.markRead(
      authUser,
      String(req.params.notificationId),
    );

    if (!notification) {
      throw ErrorHelper.recordNotFound("Thông báo");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã đánh dấu thông báo là đã đọc",
      data: { notification },
    });
  }

  async markAllRead(req: Request, res: Response) {
    const authUser = (req as any).user;
    const data = await notificationCenterService.markAllRead(authUser);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã đánh dấu tất cả thông báo là đã đọc",
      data,
    });
  }

  async deleteNotification(req: Request, res: Response) {
    const authUser = (req as any).user;
    const notification = await notificationCenterService.deleteNotification(
      authUser,
      String(req.params.notificationId),
    );

    if (!notification) {
      throw ErrorHelper.recordNotFound("Thông báo");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã xóa thông báo",
      data: { notificationId: req.params.notificationId },
    });
  }
}

export default new NotificationRoute().router;
