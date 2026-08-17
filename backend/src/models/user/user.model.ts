import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  IdentityVerificationStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";

export type DriverLicenseClass = "B" | "B1" | "B2";

export type IUser = BaseDocument & {
  /** Họ tên hiển thị và dùng trong hồ sơ giao dịch. */
  name: string;
  /** Email đăng nhập duy nhất của tài khoản. */
  email: string;
  /** Mật khẩu đã băm; không trả ra cho client. */
  password: string;

  /** Số điện thoại liên hệ của User. */
  phone?: string;
  /** Địa chỉ chi tiết của User. */
  address?: string;
  /** Tỉnh/thành trong hồ sơ địa chỉ. */
  province?: string;
  /** Thành phố theo dữ liệu địa chỉ hiện hành. */
  city?: string;
  /** Quận/huyện trong hồ sơ địa chỉ. */
  district?: string;
  /** Phường/xã trong hồ sơ địa chỉ. */
  ward?: string;
  /** Ảnh đại diện, không phải giấy tờ định danh. */
  avatar?: string;
  /** Mô tả ngắn do User tự khai báo. */
  bio?: string;

  /** Số CCCD; dữ liệu nhạy cảm, chỉ cấp cho luồng admin được phép. */
  cccdNumber?: string;
  /** Ảnh mặt trước CCCD; dữ liệu nhạy cảm, không chia sẻ cho chủ xe. */
  cccdFrontImage?: string;
  /** Ảnh mặt sau CCCD; dữ liệu nhạy cảm, không chia sẻ cho chủ xe. */
  cccdBackImage?: string;
  /** Số giấy phép lái xe; dữ liệu nhạy cảm, cần che khi hiển thị. */
  driverLicenseNumber?: string;
  /** Ảnh giấy phép lái xe; chỉ phục vụ xác minh định danh. */
  driverLicenseImage?: string;
  /** Hạng GPLX dùng kiểm tra điều kiện thuê, có thể hiển thị cho chủ xe. */
  driverLicenseClass?: DriverLicenseClass;
  /** Cho biết User đã nhập đủ bộ giấy tờ bắt buộc. */
  identityProfileCompleted?: boolean;
  /** Trạng thái xét duyệt: INCOMPLETE/PENDING/VERIFIED/REJECTED. */
  identityVerificationStatus?: IdentityVerificationStatusEnum;
  /** Lý do từ chối hoặc ghi chú xử lý hồ sơ định danh. */
  identityVerificationReason?: string;
  /** Thời điểm User gửi hồ sơ lên admin xác minh. */
  identitySubmittedAt?: Date;
  /** Thời điểm admin duyệt hoặc từ chối gần nhất. */
  identityReviewedAt?: Date;
  /** Admin đã thực hiện quyết định xác minh. */
  identityReviewedBy?: mongoose.Types.ObjectId;

  /** Vai trò hệ thống, hiện chỉ USER hoặc ADMIN. */
  role: string;

  /** Cờ khóa đăng nhập/tác vụ của tài khoản. */
  isBlocked?: boolean;
  /** Lý do admin khóa tài khoản. */
  blockedReason?: string;
  /** Thời điểm tài khoản bị khóa. */
  blockedAt?: Date;
  /** Admin thực hiện khóa tài khoản. */
  blockedBy?: mongoose.Types.ObjectId;

  /** Cờ xóa mềm tài khoản, không xóa vật lý dữ liệu liên quan. */
  isDeleted?: boolean;
  /** Lý do xóa mềm tài khoản. */
  deletedReason?: string;
  /** Thời điểm tài khoản bị xóa mềm. */
  deletedAt?: Date;
  /** Admin thực hiện xóa mềm tài khoản. */
  deletedBy?: mongoose.Types.ObjectId;

  /** Cờ xác minh email/OTP của tài khoản. */
  isVerified: boolean;
  /** OTP xác minh hiện tại; dữ liệu tạm thời. */
  otpCode?: string;
  /** Thời hạn của OTP xác minh. */
  otpExpireAt?: Date;
  /** Hash OTP đặt lại mật khẩu. */
  resetPasswordOtpHash?: string;
  /** Thời điểm hết hạn OTP đặt lại mật khẩu. */
  resetPasswordOtpExpiresAt?: Date;
  /** OTP đặt lại mật khẩu đã được xác nhận hay chưa. */
  resetPasswordOtpVerified?: boolean;
  /** Thời điểm xác nhận OTP đặt lại mật khẩu. */
  resetPasswordOtpVerifiedAt?: Date;
  /** Số lần nhập sai OTP đặt lại mật khẩu. */
  resetPasswordOtpAttempts?: number;
  /** Hash token đặt lại mật khẩu sau bước OTP. */
  resetPasswordTokenHash?: string;
  /** Thời điểm token đặt lại mật khẩu hết hạn. */
  resetPasswordTokenExpiresAt?: Date;
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

    address: {
      type: String,
      trim: true,
    },

    province: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    district: {
      type: String,
      trim: true,
    },

    ward: {
      type: String,
      trim: true,
    },

    avatar: {
      type: String,
    },

    bio: {
      type: String,
      trim: true,
    },

    cccdNumber: {
      type: String,
      trim: true,
      select: false,
    },

    cccdFrontImage: {
      type: String,
      trim: true,
      select: false,
    },

    cccdBackImage: {
      type: String,
      trim: true,
      select: false,
    },

    driverLicenseNumber: {
      type: String,
      trim: true,
      select: false,
    },

    driverLicenseImage: {
      type: String,
      trim: true,
      select: false,
    },

    driverLicenseClass: {
      type: String,
      enum: ["B", "B1", "B2"],
    },

    identityProfileCompleted: {
      type: Boolean,
      default: false,
    },

    // Không đặt default để User cũ được suy luận an toàn từ identityProfileCompleted.
    identityVerificationStatus: {
      type: String,
      enum: Object.values(IdentityVerificationStatusEnum),
    },

    identityVerificationReason: {
      type: String,
      trim: true,
    },

    identitySubmittedAt: {
      type: Date,
    },

    identityReviewedAt: {
      type: Date,
    },

    identityReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

role: {
  type: String,
  enum: [UserRoleEnum.ADMIN, UserRoleEnum.USER],
  default: UserRoleEnum.USER,
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

    resetPasswordOtpHash: {
      type: String,
    },

    resetPasswordOtpExpiresAt: {
      type: Date,
    },

    resetPasswordOtpVerified: {
      type: Boolean,
      default: false,
    },

    resetPasswordOtpVerifiedAt: {
      type: Date,
    },

    resetPasswordOtpAttempts: {
      type: Number,
      default: 0,
    },

    resetPasswordTokenHash: {
      type: String,
    },

    resetPasswordTokenExpiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

const UserModel = mongoose.model<IUser>("User", userSchema);

function getIdentityVerificationStatus(user: {
  identityProfileCompleted?: boolean;
  identityVerificationStatus?: IdentityVerificationStatusEnum | string;
}) {
  const status = String(user?.identityVerificationStatus || "");

  if (Object.values(IdentityVerificationStatusEnum).includes(status as IdentityVerificationStatusEnum)) {
    return status as IdentityVerificationStatusEnum;
  }

  return user?.identityProfileCompleted === true
    ? IdentityVerificationStatusEnum.PENDING
    : IdentityVerificationStatusEnum.INCOMPLETE;
}

function hasCompleteIdentityProfile(user: {
  cccdNumber?: string;
  cccdFrontImage?: string;
  cccdBackImage?: string;
  driverLicenseNumber?: string;
  driverLicenseImage?: string;
  driverLicenseClass?: string;
}) {
  return Boolean(
    String(user?.cccdNumber || "").trim() &&
      String(user?.cccdFrontImage || "").trim() &&
      String(user?.cccdBackImage || "").trim() &&
      String(user?.driverLicenseNumber || "").trim() &&
      String(user?.driverLicenseImage || "").trim() &&
      ["B", "B1", "B2"].includes(String(user?.driverLicenseClass || "").toUpperCase()),
  );
}

export { UserModel, getIdentityVerificationStatus, hasCompleteIdentityProfile };
