import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserRoleEnum } from "../../constants/model.const";
import { sendHolidayPricingReminderMail } from "../../helper/mail.helper";
import { HolidayCalendarModel } from "../../models/holiday-calendar/holidayCalendar.model";

function normalizeHolidayDate(value: unknown) {
  const date = new Date(String(value || ""));

  if (Number.isNaN(date.getTime())) {
    throw ErrorHelper.requestDataInvalid("Ngày lễ không hợp lệ");
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function normalizeHolidayRange(startValue: unknown, endValue: unknown = startValue) {
  const startDate = normalizeHolidayDate(startValue);
  const endDate = normalizeHolidayDate(endValue || startValue);

  if (endDate.getTime() < startDate.getTime()) {
    throw ErrorHelper.requestDataInvalid(
      "Ngày kết thúc không được trước ngày bắt đầu",
    );
  }

  return { startDate, endDate };
}

class HolidayRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/public",
      this.route(this.getPublicHolidays),
    );

    this.router.get(
      "/",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getHolidays),
    );
    this.router.post(
      "/",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.createHoliday),
    );
    this.router.put(
      "/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.updateHoliday),
    );
    this.router.delete(
      "/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.deleteHoliday),
    );
    this.router.patch(
      "/:id/toggle",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.toggleHoliday),
    );
  }

  async getHolidays(_req: Request, res: Response) {
    const holidays = await HolidayCalendarModel.find({
      country: "VN",
      isDeleted: false,
    }).sort({ startDate: 1, endDate: 1, name: 1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { holidays },
    });
  }

  async getPublicHolidays(req: Request, res: Response) {
    const { startDate, endDate } = normalizeHolidayRange(
      req.query.startDate,
      req.query.endDate || req.query.startDate,
    );

    const holidays = await HolidayCalendarModel.find({
      country: "VN",
      type: "HOLIDAY",
      isActive: true,
      isDeleted: false,
      $or: [
        {
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
        },
        {
          date: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      ],
    } as any)
      .select("name date startDate endDate country type isActive note")
      .sort({ startDate: 1, endDate: 1, name: 1 })
      .lean();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { holidays },
    });
  }

  async createHoliday(req: Request, res: Response) {
    const name = String(req.body.name || "").trim();
    const { startDate, endDate } = normalizeHolidayRange(
      req.body.startDate || req.body.date,
      req.body.endDate || req.body.date || req.body.startDate,
    );
    const note = String(req.body.note || "").trim();

    if (!name) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập tên ngày lễ");
    }

    const holiday = await HolidayCalendarModel.create({
      name,
      date: startDate,
      startDate,
      endDate,
      country: "VN",
      type: "HOLIDAY",
      isActive: req.body.isActive !== false,
      note,
      isDeleted: false,
    });

    if (holiday.isActive) {
      void sendHolidayPricingReminderMail(holiday);
    }

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Tạo ngày lễ thành công",
      data: { holiday },
    });
  }

  async updateHoliday(req: Request, res: Response) {
    const updateData: Record<string, unknown> = {};

    if (req.body.name !== undefined) {
      updateData.name = String(req.body.name || "").trim();
    }

    if (
      req.body.startDate !== undefined ||
      req.body.endDate !== undefined ||
      req.body.date !== undefined
    ) {
      const { startDate, endDate } = normalizeHolidayRange(
        req.body.startDate || req.body.date,
        req.body.endDate || req.body.date || req.body.startDate,
      );
      updateData.date = startDate;
      updateData.startDate = startDate;
      updateData.endDate = endDate;
    }

    if (req.body.isActive !== undefined) {
      updateData.isActive = Boolean(req.body.isActive);
    }

    if (req.body.note !== undefined) {
      updateData.note = String(req.body.note || "").trim();
    }

    if (updateData.name === "") {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập tên ngày lễ");
    }

    const holiday = await HolidayCalendarModel.findOneAndUpdate(
      {
        _id: req.params.id,
        isDeleted: false,
      } as any,
      updateData,
      { new: true },
    );

    if (holiday?.isActive) {
      void sendHolidayPricingReminderMail(holiday);
    }

    if (!holiday) {
      throw ErrorHelper.recordNotFound("Ngày lễ");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Cập nhật ngày lễ thành công",
      data: { holiday },
    });
  }

  async deleteHoliday(req: Request, res: Response) {
    const holiday = await HolidayCalendarModel.findOneAndUpdate(
      {
        _id: req.params.id,
        isDeleted: false,
      } as any,
      {
        isDeleted: true,
        isActive: false,
      },
      { new: true },
    );

    if (!holiday) {
      throw ErrorHelper.recordNotFound("Ngày lễ");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xóa ngày lễ thành công",
      data: { holiday },
    });
  }

  async toggleHoliday(req: Request, res: Response) {
    const holiday = await HolidayCalendarModel.findOne({
      _id: req.params.id,
      isDeleted: false,
    } as any);

    if (!holiday) {
      throw ErrorHelper.recordNotFound("Ngày lễ");
    }

    holiday.isActive = !holiday.isActive;
    await holiday.save();

    if (holiday.isActive) {
      void sendHolidayPricingReminderMail(holiday);
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: holiday.isActive ? "Đã bật ngày lễ" : "Đã tắt ngày lễ",
      data: { holiday },
    });
  }
}

export default new HolidayRoute().router;
