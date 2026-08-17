import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { UserRoleEnum } from "../../constants/model.const";
import { bookingChatService } from "../../services/booking-chat.service";

class ChatRoute extends BaseRoute {
  customRouting() {
    this.router.get(
      "/bookings/:bookingId/messages",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.getBookingMessages),
    );
  }

  async getBookingMessages(req: Request, res: Response) {
    const authUser = (req as any).user;
    const messages = await bookingChatService.getMessages(
      String(req.params.bookingId || ""),
      String(authUser.userId || ""),
      Number(req.query.limit || 50),
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { messages },
    });
  }
}

export default new ChatRoute().router;
