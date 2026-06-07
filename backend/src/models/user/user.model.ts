import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import { UserRoleEnum } from "../../constants/model.const";

export type IUser = BaseDocument & {
  name: string;
  email: string;
  password: string;

  phone?: string;
  avatar?: string;

  role: string;

  isBlocked?: boolean;
  blockedReason?: string;
  blockedAt?: Date;
  blockedBy?: mongoose.Types.ObjectId;

  isDeleted?: boolean;
  deletedReason?: string;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;

  isVerified: boolean;
  otpCode?: string;
  otpExpireAt?: Date;
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    avatar: {
      type: String,
    },

    role: {
      type: String,
      enum: Object.values(UserRoleEnum),
      default: UserRoleEnum.CUSTOMER,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    blockedReason: {
      type: String,
    },

    blockedAt: {
      type: Date,
    },

    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedReason: {
      type: String,
    },

    deletedAt: {
      type: Date,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    otpCode: {
      type: String,
    },

    otpExpireAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

const UserModel = mongoose.model<IUser>("User", userSchema);

export { UserModel };