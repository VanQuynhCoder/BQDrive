import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { taskService } from "../../services/task.service";

class TaskRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get("/", [this.authentication], this.route(this.getTasks));
  }

  async getTasks(req: Request, res: Response) {
    const authUser = (req as any).user;
    const context =
      typeof req.query.context === "string" ? req.query.context : undefined;
    const data = await taskService.getTasksForCurrentUser(authUser, context);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data,
    });
  }
}

export default new TaskRoute().router;
