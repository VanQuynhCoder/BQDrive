import bcrypt from "bcryptjs";
import crypto from "crypto";
import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserModel } from "../../models/user/user.model";
import { BusinessModel } from "../../models/business/business.model";
import { TokenHelper } from "../../helper/token.helper";
import { UserRoleEnum } from "../../constants/model.const";
import {
  sendOtpMail,
  sendPasswordChangedMail,
  sendPasswordResetOtpMail,
} from "../../helper/mail.helper";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import { validatePhone } from "../../utils/validators";

const RESET_PASSWORD_GENERIC_MESSAGE =
  "Nếu email tồn tại trong hệ thống, mã xác thực sẽ được gửi.";
const RESET_PASSWORD_OTP_TTL_MS = 5 * 60 * 1000;
const RESET_PASSWORD_TOKEN_TTL_MS = 10 * 60 * 1000;
const RESET_PASSWORD_MAX_ATTEMPTS = 5;

class AuthRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post("/send-otp", this.route(this.sendOtp));
    this.router.post("/verify-otp", this.route(this.verifyOtp));
    this.router.post("/forgot-password", this.route(this.forgotPassword));
    this.router.post("/verify-reset-otp", this.route(this.verifyResetOtp));
    this.router.post("/reset-password", this.route(this.resetPassword));
    this.router.post("/register", this.route(this.register));
    this.router.post("/login", this.route(this.login));
    this.router.get("/getMe", [this.authentication], this.route(this.getMe));
    this.router.get("/profile", [this.authentication], this.route(this.getProfile));
    this.router.patch(
      "/profile",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.updateUserProfile),
    );
    this.router.patch(
      "/change-password",
      [this.authentication],
      this.route(this.changePassword),
    );
    this.router.post("/google-login", this.route(this.googleLogin));
  }

  private decodeJwtPayload(token: string) {
    const payloadPart = token.split(".")[1];

    if (!payloadPart) return null;

    try {
      const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        "=",
      );

      return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    } catch {
      return null;
    }
  }

  private normalizeUserRole(role?: string) {
    const normalizedRole = role?.toUpperCase();

    if (
      normalizedRole === UserRoleEnum.ADMIN ||
      normalizedRole === UserRoleEnum.BUSINESS
    ) {
      return normalizedRole;
    }

    return UserRoleEnum.USER;
  }

  private async ensureNormalizedUserRole(user: any) {
    const normalizedRole = this.normalizeUserRole(user.role);

    if (user.role !== normalizedRole) {
      user.role = normalizedRole;
      await user.save();
    }

    return normalizedRole;
  }

  private normalizeEmail(email?: string) {
    return String(email || "").trim().toLowerCase();
  }

  private cleanText(value: unknown, maxLength = 500) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
  }

  private toSafeUser(user: any, role?: string) {
    const userObject = user?.toObject ? user.toObject() : { ...(user || {}) };
    const hasLocalPassword =
      Boolean(userObject.password) &&
      userObject.password !== "GOOGLE_ACCOUNT" &&
      userObject.password !== "TEMP_PASSWORD";
    const {
      password,
      otpCode,
      otpExpireAt,
      resetPasswordOtpHash,
      resetPasswordOtpExpiresAt,
      resetPasswordOtpVerified,
      resetPasswordOtpVerifiedAt,
      resetPasswordOtpAttempts,
      resetPasswordTokenHash,
      resetPasswordTokenExpiresAt,
      ...safeUser
    } = userObject;

    return {
      ...safeUser,
      role: role || safeUser.role,
      hasLocalPassword,
    };
  }

  private isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private validatePasswordStrength(password?: string, label = "Mật khẩu") {
    if (!password) {
      throw ErrorHelper.requestDataInvalid(`Vui lòng nhập ${label.toLowerCase()}`);
    }

    if (password.length < 8) {
      throw ErrorHelper.requestDataInvalid(`${label} cần ít nhất 8 ký tự`);
    }

    if (/\s/.test(password)) {
      throw ErrorHelper.requestDataInvalid(
        `${label} không được chứa khoảng trắng`,
      );
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      throw ErrorHelper.requestDataInvalid(
        `${label} cần có chữ hoa, chữ thường và số`,
      );
    }
  }

  private validateNewPassword(newPassword?: string, confirmPassword?: string) {
    if (!newPassword || !confirmPassword) {
      throw ErrorHelper.requestDataInvalid(
        "Vui lòng nhập mật khẩu mới và xác nhận mật khẩu",
      );
    }

    this.validatePasswordStrength(newPassword, "Mật khẩu mới");

    if (newPassword !== confirmPassword) {
      throw ErrorHelper.requestDataInvalid("Xác nhận mật khẩu không khớp");
    }
  }

  private clearResetPasswordState(user: any) {
    user.set("resetPasswordOtpHash", undefined);
    user.set("resetPasswordOtpExpiresAt", undefined);
    user.set("resetPasswordOtpVerified", false);
    user.set("resetPasswordOtpVerifiedAt", undefined);
    user.set("resetPasswordOtpAttempts", 0);
    user.set("resetPasswordTokenHash", undefined);
    user.set("resetPasswordTokenExpiresAt", undefined);
  }

  async forgotPassword(req: Request, res: Response) {
    const email = this.normalizeEmail(req.body.email);

    if (!email || !this.isValidEmail(email)) {
      throw ErrorHelper.requestDataInvalid("Email không hợp lệ");
    }

    const user = await UserModel.findOne({
      email,
      isDeleted: false,
    });

    if (!user) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: RESET_PASSWORD_GENERIC_MESSAGE,
        data: null,
      });
    }

    const otp = this.generateOtp();
    user.resetPasswordOtpHash = await bcrypt.hash(otp, 10);
    user.resetPasswordOtpExpiresAt = new Date(Date.now() + RESET_PASSWORD_OTP_TTL_MS);
    user.resetPasswordOtpVerified = false;
    user.set("resetPasswordOtpVerifiedAt", undefined);
    user.resetPasswordOtpAttempts = 0;
    user.set("resetPasswordTokenHash", undefined);
    user.set("resetPasswordTokenExpiresAt", undefined);
    await user.save();

    try {
      await sendPasswordResetOtpMail(email, otp, user.name);
    } catch {
      this.clearResetPasswordState(user);
      await user.save();
      throw ErrorHelper.somethingWentWrong(
        "Không thể gửi mã xác thực, vui lòng thử lại sau.",
      );
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: RESET_PASSWORD_GENERIC_MESSAGE,
      data: null,
    });
  }

  async verifyResetOtp(req: Request, res: Response) {
    const email = this.normalizeEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();

    if (!email || !this.isValidEmail(email) || !/^\d{6}$/.test(otp)) {
      throw ErrorHelper.requestDataInvalid("OTP không hợp lệ hoặc đã hết hạn");
    }

    const user = await UserModel.findOne({
      email,
      isDeleted: false,
    });

    if (
      !user ||
      !user.resetPasswordOtpHash ||
      !user.resetPasswordOtpExpiresAt ||
      user.resetPasswordOtpExpiresAt < new Date()
    ) {
      throw ErrorHelper.requestDataInvalid("OTP không hợp lệ hoặc đã hết hạn");
    }

    if ((user.resetPasswordOtpAttempts || 0) >= RESET_PASSWORD_MAX_ATTEMPTS) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn đã nhập sai OTP quá nhiều lần. Vui lòng gửi lại mã mới.",
      );
    }

    const isOtpMatch = await bcrypt.compare(otp, user.resetPasswordOtpHash);

    if (!isOtpMatch) {
      user.resetPasswordOtpAttempts = (user.resetPasswordOtpAttempts || 0) + 1;
      await user.save();
      throw ErrorHelper.requestDataInvalid("OTP không hợp lệ hoặc đã hết hạn");
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordOtpVerified = true;
    user.resetPasswordOtpVerifiedAt = new Date();
    user.resetPasswordTokenHash = await bcrypt.hash(resetToken, 10);
    user.resetPasswordTokenExpiresAt = new Date(
      Date.now() + RESET_PASSWORD_TOKEN_TTL_MS,
    );
    await user.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xác thực OTP thành công",
      data: { resetToken },
    });
  }

  async resetPassword(req: Request, res: Response) {
    const email = this.normalizeEmail(req.body.email);
    const resetToken = String(req.body.resetToken || "").trim();
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!email || !this.isValidEmail(email) || !resetToken) {
      throw ErrorHelper.requestDataInvalid(
        "Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
      );
    }

    this.validateNewPassword(newPassword, confirmPassword);

    const user = await UserModel.findOne({
      email,
      isDeleted: false,
    });

    if (
      !user ||
      !user.resetPasswordOtpVerified ||
      !user.resetPasswordTokenHash ||
      !user.resetPasswordTokenExpiresAt ||
      user.resetPasswordTokenExpiresAt < new Date()
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
      );
    }

    const isTokenMatch = await bcrypt.compare(resetToken, user.resetPasswordTokenHash);

    if (!isTokenMatch) {
      throw ErrorHelper.requestDataInvalid(
        "Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.isVerified = true;
    this.clearResetPasswordState(user);
    await user.save();

    void sendPasswordChangedMail(email, user.name);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại.",
      data: null,
    });
  }

  async sendOtp(req: Request, res: Response) {
    const { email } = req.body;

    if (!email) {
      throw ErrorHelper.requestDataInvalid("Thiếu email");
    }

    const existedUser = await UserModel.findOne({
      email,
      isDeleted: false,
    });

    if (existedUser && existedUser.isVerified) {
      throw ErrorHelper.userExisted();
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpireAt = new Date(Date.now() + 5 * 60 * 1000);

    if (existedUser) {
      existedUser.otpCode = otp;
      existedUser.otpExpireAt = otpExpireAt;
      await existedUser.save();
    } else {
      await UserModel.create({
        name: "TEMP_USER",
        email,
        password: "TEMP_PASSWORD",
        role: UserRoleEnum.USER,
        isVerified: false,
        otpCode: otp,
        otpExpireAt,
      });
    }

    await sendOtpMail(email, otp);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã gửi OTP về email",
      data: null,
    });
  }

  async verifyOtp(req: Request, res: Response) {
    const { email, otp } = req.body;

    if (!email || !otp) {
      throw ErrorHelper.requestDataInvalid("Thiếu email hoặc OTP");
    }

    const user = await UserModel.findOne({
      email,
      isDeleted: false,
    });

    if (!user) {
      throw ErrorHelper.userNotExist();
    }

    if (!user.otpCode || !user.otpExpireAt) {
      throw ErrorHelper.requestDataInvalid("Vui lòng gửi OTP trước");
    }

    if (user.otpCode !== otp) {
      throw ErrorHelper.requestDataInvalid("OTP không chính xác");
    }

    if (user.otpExpireAt < new Date()) {
      throw ErrorHelper.requestDataInvalid("OTP đã hết hạn");
    }

    user.isVerified = true;
    user.set("otpCode", undefined);
    user.set("otpExpireAt", undefined);

    await user.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xác thực OTP thành công",
      data: null,
    });
  }

  async register(req: Request, res: Response) {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      throw ErrorHelper.requestDataInvalid("Thiếu name, email hoặc password");
    }

    this.validatePasswordStrength(password);

    const user = await UserModel.findOne({
      email,
      isDeleted: false,
    });

    if (!user) {
      throw ErrorHelper.requestDataInvalid(
        "Vui lòng xác thực OTP trước khi đăng ký",
      );
    }
    if (!user.isVerified) {
      throw ErrorHelper.requestDataInvalid("Email chưa được xác thực");
    }
    if (user.name !== "TEMP_USER") {
      throw ErrorHelper.userExisted();
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.name = name;
    user.password = hashedPassword;
    user.phone = phone ? validatePhone(phone) : "";
    user.role = UserRoleEnum.USER;

    await user.save();

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đăng ký thành công",
      data: {
        user: this.toSafeUser(user, UserRoleEnum.USER),
      },
    });
  }

  async login(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
      throw ErrorHelper.requestDataInvalid("Thiếu email hoặc password");
    }

    const user = await UserModel.findOne({
      email,
      isDeleted: false,
    });

    if (!user) {
      throw ErrorHelper.userNotExist();
    }

    if (
      String(user.role).toUpperCase() !== UserRoleEnum.ADMIN &&
      !user.isVerified
    ) {
      throw ErrorHelper.requestDataInvalid("Email chưa được xác thực");
    }

    if (user.isBlocked) {
      throw ErrorHelper.userWasBlock();
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw ErrorHelper.userPasswordNotCorrect();
    }

    const normalizedRole = await this.ensureNormalizedUserRole(user);

    const token = TokenHelper.generateToken({
      userId: user._id.toString(),
      role: normalizedRole,
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đăng nhập thành công",
      data: {
        token,
        user: this.toSafeUser(user, normalizedRole),
      },
    });
  }

  async getMe(req: Request, res: Response) {
    const authUser = (req as any).user;

    const user = await UserModel.findOne({
      _id: authUser.userId,
      isDeleted: false,
    }).select("-password");

    if (!user) {
      throw ErrorHelper.userNotExist();
    }

    const normalizedRole = await this.ensureNormalizedUserRole(user);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        user: this.toSafeUser(user, normalizedRole),
      },
    });
  }

  async getProfile(req: Request, res: Response) {
    const authUser = (req as any).user;
    const user = await UserModel.findOne({
      _id: authUser.userId,
      isDeleted: false,
    });

    if (!user) {
      throw ErrorHelper.userNotExist();
    }

    const normalizedRole = await this.ensureNormalizedUserRole(user);
    const business =
      normalizedRole === UserRoleEnum.BUSINESS
        ? await BusinessModel.findOne({
            userId: user._id,
            isDeleted: false,
          }).populate("userId", "-password -otpCode")
        : null;

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        user: this.toSafeUser(user, normalizedRole),
        ...(business ? { business } : {}),
      },
    });
  }

  async updateUserProfile(req: Request, res: Response) {
    const authUser = (req as any).user;
    const user = await UserModel.findOne({
      _id: authUser.userId,
      isDeleted: false,
    });

    if (!user) {
      throw ErrorHelper.userNotExist();
    }

    const name = this.cleanText(req.body.name, 120);
    const phone = req.body.phone ? validatePhone(req.body.phone) : "";
    const address = this.cleanText(req.body.address, 300);
    const avatar = this.cleanText(req.body.avatar, 2_000_000);
    const bio = this.cleanText(req.body.bio, 500);
    const city = this.cleanText(req.body.city, 100);
    const province = this.cleanText(req.body.province, 100) || city;
    const district = this.cleanText(req.body.district, 100);
    const ward = this.cleanText(req.body.ward, 100);

    if (!name) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập họ tên");
    }

    user.name = name;
    user.phone = phone;
    user.address = address;
    user.avatar = avatar;
    user.bio = bio;
    user.city = city;
    user.province = province;
    user.district = district;
    user.ward = ward;

    await user.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Cập nhật hồ sơ thành công",
      data: {
        user: this.toSafeUser(user, UserRoleEnum.USER),
      },
    });
  }

  async changePassword(req: Request, res: Response) {
    const authUser = (req as any).user;
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!currentPassword) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập mật khẩu hiện tại");
    }

    this.validateNewPassword(newPassword, confirmPassword);

    const user = await UserModel.findOne({
      _id: authUser.userId,
      isDeleted: false,
    });

    if (!user) {
      throw ErrorHelper.userNotExist();
    }

    if (user.password === "GOOGLE_ACCOUNT") {
      throw ErrorHelper.requestDataInvalid(
        "Tài khoản đăng nhập bằng Google không sử dụng mật khẩu cục bộ.",
      );
    }

    const isCurrentPasswordCorrect = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isCurrentPasswordCorrect) {
      throw ErrorHelper.requestDataInvalid(
        "Mật khẩu hiện tại không chính xác.",
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    void sendPasswordChangedMail(user.email, user.name);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đổi mật khẩu thành công.",
      data: null,
    });
  }

  private async getGooglePayload(credential?: string, accessToken?: string) {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;

    if (!googleClientId) {
      throw ErrorHelper.requestDataInvalid("Thiếu GOOGLE_CLIENT_ID trong .env");
    }

    if (credential) {
      let payload: any = null;

      try {
        const client = new OAuth2Client(googleClientId);
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: googleClientId,
        });

        payload = ticket.getPayload();
      } catch {
        payload = this.decodeJwtPayload(credential);

        const tokenAudience = Array.isArray(payload?.aud)
          ? payload.aud
          : [payload?.aud];
        const isAudienceValid = tokenAudience.includes(googleClientId);
        const expiresAt = Number(payload?.exp || 0) * 1000;

        if (!isAudienceValid || !expiresAt || expiresAt <= Date.now()) {
          throw ErrorHelper.requestDataInvalid("Google token không hợp lệ");
        }
      }

      if (!payload?.email) {
        throw ErrorHelper.requestDataInvalid("Google token không hợp lệ");
      }

      return {
        email: payload.email,
        name: payload.name || payload.email,
        picture: payload.picture,
        emailVerified: payload.email_verified,
      };
    }

    if (accessToken) {
      const response = await axios.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      const payload = response.data;

      if (!payload?.email) {
        throw ErrorHelper.requestDataInvalid("Google token không hợp lệ");
      }

      return {
        email: payload.email,
        name: payload.name || payload.email,
        picture: payload.picture,
        emailVerified: payload.email_verified,
      };
    }

    throw ErrorHelper.requestDataInvalid("Thiếu Google credential");
  }

  async googleLogin(req: Request, res: Response) {
    const { credential, accessToken } = req.body;
    const googlePayload = await this.getGooglePayload(credential, accessToken);

    {
      let user = await UserModel.findOne({
        email: googlePayload.email,
        isDeleted: false,
      });

      if (!user) {
        const newGoogleUser: any = {
          name: googlePayload.name || googlePayload.email,
          email: googlePayload.email,
          password: "GOOGLE_ACCOUNT",
          role: UserRoleEnum.USER,
          isVerified: googlePayload.emailVerified !== false,
        };

        if (googlePayload.picture) {
          newGoogleUser.avatar = googlePayload.picture;
        }

        user = await UserModel.create(newGoogleUser);
      } else if (!user.isVerified) {
        user.isVerified = true;

        if (!user.avatar && googlePayload.picture) {
          user.avatar = googlePayload.picture;
        }

        await user.save();
      }

      if (user.isBlocked) {
        throw ErrorHelper.userWasBlock();
      }

      const normalizedRole = await this.ensureNormalizedUserRole(user);

      const token = TokenHelper.generateToken({
        userId: user._id.toString(),
        role: normalizedRole,
      });

      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Đăng nhập Google thành công",
        data: {
          token,
          user: this.toSafeUser(user, normalizedRole),
        },
      });
    }

    /*
    if (!credential && !accessToken) {
      throw ErrorHelper.requestDataInvalid("Thiếu Google credential");
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID;

    if (!googleClientId) {
      throw ErrorHelper.requestDataInvalid("Thiếu GOOGLE_CLIENT_ID trong .env");
    }

    const client = new OAuth2Client(googleClientId);

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      throw ErrorHelper.requestDataInvalid("Google token không hợp lệ");
    }

    let user = await UserModel.findOne({
      email: payload.email,
      isDeleted: false,
    });

    if (!user) {
      const newGoogleUser: any = {
        name: payload.name || payload.email,
        email: payload.email,
        password: "GOOGLE_ACCOUNT",
        role: UserRoleEnum.USER,
        isVerified: true,
      };

      if (payload.picture) {
        newGoogleUser.avatar = payload.picture;
      }

      user = await UserModel.create(newGoogleUser);
    }

    if (user.isBlocked) {
      throw ErrorHelper.userWasBlock();
    }

    const token = TokenHelper.generateToken({
      userId: user._id.toString(),
      role: user.role,
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đăng nhập Google thành công",
      data: {
        token,
        user,
      },
    });
    */
  }
}

export default new AuthRoute().router;
