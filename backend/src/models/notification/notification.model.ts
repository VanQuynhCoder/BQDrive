import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  NotificationActionKeyEnum,
  NotificationEntityTypeEnum,
  NotificationTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

export type INotification = BaseDocument & {
  /** User nhận thông báo. */
  recipientId: mongoose.Types.ObjectId;
  /** Role của người nhận tại thời điểm phát thông báo. */
  recipientRole: UserRoleEnum;
  /** Loại sự kiện để frontend chọn biểu tượng và hành động. */
  type: NotificationTypeEnum;
  /** Tiêu đề ngắn của thông báo. */
  title: string;
  /** Nội dung chi tiết hiển thị cho người dùng. */
  message: string;
  /** User gây ra sự kiện, nếu có. */
  actorId?: mongoose.Types.ObjectId;
  /** Role của actor, nếu có. */
  actorRole?: UserRoleEnum;
  /** Loại entity liên quan như booking, xe hoặc hồ sơ. */
  entityType: NotificationEntityTypeEnum;
  /** ID entity để điều hướng/tra cứu. */
  entityId?: mongoose.Types.ObjectId;
  /** Booking liên quan trực tiếp, nếu có. */
  bookingId?: mongoose.Types.ObjectId;
  /** Xe liên quan trực tiếp, nếu có. */
  carId?: mongoose.Types.ObjectId;
  /** Khóa hành động để frontend hiển thị CTA phù hợp. */
  actionKey?: NotificationActionKeyEnum;
  /** URL nội bộ khi người dùng bấm thông báo. */
  actionUrl?: string;
  /** Dữ liệu mở rộng không ảnh hưởng schema nghiệp vụ chính. */
  metadata?: Record<string, unknown>;
  /** Đã được người nhận đọc hay chưa. */
  isRead: boolean;
  /** Thời điểm đánh dấu đã đọc. */
  readAt?: Date;
  /** Xóa mềm thông báo. */
  isDeleted: boolean;
  /** Thời điểm xóa mềm thông báo. */
  deletedAt?: Date;
  /** Khóa chống phát trùng cùng một sự kiện. */
  dedupeKey: string;
};

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipientRole: {
      type: String,
      enum: Object.values(UserRoleEnum),
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationTypeEnum),
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    actorRole: {
      type: String,
      enum: Object.values(UserRoleEnum),
    },
    entityType: {
      type: String,
      enum: Object.values(NotificationEntityTypeEnum),
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      index: true,
    },
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Car",
      index: true,
    },
    actionKey: {
      type: String,
      enum: Object.values(NotificationActionKeyEnum),
    },
    actionUrl: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
    dedupeKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index(
  { recipientId: 1, dedupeKey: 1 },
  { unique: true },
);

export const NotificationModel = mongoose.model<INotification>(
  "Notification",
  notificationSchema,
);
