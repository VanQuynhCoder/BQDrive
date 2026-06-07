import bcrypt from "bcryptjs";
import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserModel } from "../../models/user/user.model";
import { TokenHelper } from "../../helper/token.helper";
import { UserRoleEnum } from "../../constants/model.const";
import { sendOtpMail } from "../../helper/mail.helper";
import { OAuth2Client } from "google-auth-library";

class AuthRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post("/send-otp", this.route(this.sendOtp));
    this.router.post("/verify-otp", this.route(this.verifyOtp));
    this.router.post("/register", this.route(this.register));
    this.router.post("/login", this.route(this.login));
    this.router.get("/getMe", [this.authentication], this.route(this.getMe));
    this.router.post("/google-login", this.route(this.googleLogin));
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
        role: UserRoleEnum.CUSTOMER,
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
    user.phone = phone;
    user.role = UserRoleEnum.CUSTOMER;

    await user.save();

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đăng ký thành công",
      data: {
        user,
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

    const token = TokenHelper.generateToken({
      userId: user._id.toString(),
      role: user.role,
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đăng nhập thành công",
      data: {
        token,
        user,
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

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        user,
      },
    });
  }
  async googleLogin(req: Request, res: Response) {
    const { credential } = req.body;

    if (!credential) {
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
        role: UserRoleEnum.CUSTOMER,
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
  }
}

export default new AuthRoute().router;
