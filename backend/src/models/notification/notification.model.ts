import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  NotificationActionKeyEnum,
  NotificationEntityTypeEnum,
  NotificationTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

export type INotification = BaseDocument & {
  recipientId: mongoose.Types.ObjectId;
  recipientRole: UserRoleEnum;
  type: NotificationTypeEnum;
  title: string;
  message: string;
  actorId?: mongoose.Types.ObjectId;
  actorRole?: UserRoleEnum;
  entityType: NotificationEntityTypeEnum;
  entityId?: mongoose.Types.ObjectId;
  bookingId?: mongoose.Types.ObjectId;
  carId?: mongoose.Types.ObjectId;
  actionKey?: NotificationActionKeyEnum;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
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
