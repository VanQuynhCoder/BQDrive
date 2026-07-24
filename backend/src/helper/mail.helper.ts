import dns from "dns";
import net from "net";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { UserModel } from "../models/user/user.model";
import { BusinessModel } from "../models/business/business.model";
import { CarModel } from "../models/car/car.model";
import { PaymentModel } from "../models/payment/payment.model";
import {
  OwnerTypeEnum,
  UserRoleEnum,
} from "../constants/model.const";

const SMTP_DEFAULT_HOST = "smtp.gmail.com";
const SMTP_DEFAULT_PORT = 587;
const CONNECTION_TIMEOUT_MS = 30_000;
const GREETING_TIMEOUT_MS = 15_000;
const SOCKET_TIMEOUT_MS = 30_000;
const SMTP_ADDRESS_FAMILY = 4;
const smtpAddressFamilyLabel = `IPv${SMTP_ADDRESS_FAMILY}`;
type MailMode = "smtp" | "console";

type MailPayload = {
  to: string | string[];
  subject: string;
  intro: string;
  lines?: string[];
  actionText?: string;
};

function getNumberEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === "true";
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST || SMTP_DEFAULT_HOST;
  const port = getNumberEnv(
    process.env.SMTP_PORT || process.env.EMAIL_PORT,
    SMTP_DEFAULT_PORT,
  );
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const mode = String(process.env.MAIL_MODE || "smtp").toLowerCase() === "console"
    ? "console"
    : "smtp";
  const secure = process.env.SMTP_SECURE;
  const fromName = process.env.EMAIL_FROM_NAME || "BQDrive";
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || user;

  return {
    host,
    port,
    user,
    pass,
    mode: mode as MailMode,
    secure,
    fromName,
    fromAddress,
  };
}

const smtpConfig = getSmtpConfig();
let resolvedSmtpHost: string | null = null;

function getSmtpPortCandidates() {
  const fallbackPort = smtpConfig.port === 465 ? 587 : 465;
  return [smtpConfig.port, fallbackPort];
}

async function resolveSmtpHostForRender() {
  if (resolvedSmtpHost) return resolvedSmtpHost;

  if (net.isIP(smtpConfig.host)) {
    resolvedSmtpHost = smtpConfig.host;
    return resolvedSmtpHost;
  }

  const addresses = await dns.promises.resolve4(smtpConfig.host);
  resolvedSmtpHost = addresses[0] || smtpConfig.host;
  return resolvedSmtpHost;
}

async function createSmtpTransporter(port: number) {
  const host = await resolveSmtpHostForRender();
  const secure = getBooleanEnv(smtpConfig.secure, port === 465);

  const transportOptions: SMTPTransport.Options = {
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    dnsTimeout: CONNECTION_TIMEOUT_MS,
    tls: {
      servername: smtpConfig.host,
    },
  };

  return nodemailer.createTransport(transportOptions);
}

function isSmtpConnectionError(error: any) {
  return (
    error?.command === "CONN" ||
    ["ETIMEDOUT", "ESOCKET", "ECONNECTION", "ENETUNREACH", "ECONNREFUSED"].includes(
      error?.code,
    )
  );
}

function logSmtpConfig() {
  console.log("SMTP Config:", {
    host: smtpConfig.host,
    resolvedHost: resolvedSmtpHost || null,
    portCandidates: getSmtpPortCandidates(),
    mode: smtpConfig.mode,
    secure: smtpConfig.secure ?? null,
    fromName: smtpConfig.fromName,
    fromAddress: smtpConfig.fromAddress || null,
    addressFamily: smtpAddressFamilyLabel,
    emailUser: smtpConfig.user || null,
    hasEmailPass: Boolean(smtpConfig.pass),
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
}

function assertMailEnv() {
  if (smtpConfig.mode === "console") return;

  if (!smtpConfig.user || !smtpConfig.pass) {
    throw new Error("Missing EMAIL_USER or EMAIL_PASS for SMTP authentication");
  }

  if (!smtpConfig.fromAddress) {
    throw new Error("Missing EMAIL_FROM_ADDRESS or EMAIL_USER for mail sender");
  }
}

function getMailFrom() {
  return `"${smtpConfig.fromName}" <${smtpConfig.fromAddress || smtpConfig.user}>`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function compactLines(lines: Array<string | undefined | null>) {
  return lines.filter((line): line is string => Boolean(line && line.trim()));
}

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value?: Date | string) {
  if (!value) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateOnly(value?: Date | string) {
  if (!value) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
  }).format(new Date(value));
}

function formatHolidayRange(holiday: any) {
  const startDate = formatDateOnly(holiday?.startDate || holiday?.date);
  const endDate = formatDateOnly(holiday?.endDate || holiday?.date);

  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
}

function formatRentalPeriod(booking: any) {
  const startDate = formatDateOnly(booking?.startDate);
  const endDate = formatDateOnly(booking?.endDate);

  if (startDate === "--") return "--";
  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
}

function getSupportPhone() {
  return process.env.SUPPORT_PHONE || process.env.HOTLINE || "Đang cập nhật";
}

function getSupportEmail() {
  return (
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_FROM_ADDRESS ||
    smtpConfig.fromAddress ||
    smtpConfig.user ||
    "Đang cập nhật"
  );
}

function getWebsiteUrl() {
  return (
    process.env.WEBSITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    "http://localhost:5173"
  );
}

function renderBusinessMail(payload: MailPayload) {
  const lines = compactLines(payload.lines || []);

  return `
    <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="background:#0f172a;padding:22px 24px;">
          <div style="font-size:22px;font-weight:800;color:#eab308;">BQDrive</div>
          <div style="margin-top:6px;color:#ffffffcc;font-size:14px;">Thông báo nghiệp vụ</div>
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${escapeHtml(payload.subject)}</h2>
          <p style="margin:0 0 16px;line-height:1.6;color:#334155;">${escapeHtml(payload.intro)}</p>
          ${
            lines.length
              ? `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
                  ${lines
                    .map(
                      (line) =>
                        `<p style="margin:0 0 8px;line-height:1.5;color:#475569;">${escapeHtml(line)}</p>`,
                    )
                    .join("")}
                </div>`
              : ""
          }
          ${
            payload.actionText
              ? `<p style="margin:18px 0 0;font-weight:700;color:#b45309;">${escapeHtml(payload.actionText)}</p>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

export async function sendBusinessNotificationMail(payload: MailPayload) {
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const to = recipients.map((item) => item?.trim()).filter(Boolean);

  if (to.length === 0) {
    console.warn("Skip mail because recipient email is missing", {
      subject: payload.subject,
    });
    return;
  }

  if (smtpConfig.mode === "console") {
    console.log("MAIL_MODE=console, skip real email", {
      to,
      subject: payload.subject,
      intro: payload.intro,
      lines: payload.lines,
      actionText: payload.actionText,
    });
    return;
  }

  assertMailEnv();

  let lastError: unknown = null;

  for (const port of getSmtpPortCandidates()) {
    try {
      const transporter = await createSmtpTransporter(port);

      await transporter.sendMail({
        from: getMailFrom(),
        to,
        subject: payload.subject,
        html: renderBusinessMail(payload),
      });

      console.log("Business notification email sent successfully", {
        host: smtpConfig.host,
        resolvedHost: resolvedSmtpHost,
        port,
        to,
        subject: payload.subject,
      });
      return;
    } catch (error: any) {
      lastError = error;
      console.error("Business notification email send attempt failed", {
        host: smtpConfig.host,
        resolvedHost: resolvedSmtpHost,
        port,
        to,
        subject: payload.subject,
        code: error?.code,
        command: error?.command,
        message: error?.message,
      });

      if (!isSmtpConnectionError(error)) break;
    }
  }

  throw lastError;
}

export async function safeSendMail(taskName: string, task: () => Promise<void>) {
  try {
    await task();
  } catch (error: any) {
    console.error("Mail notification failed", {
      taskName,
      code: error?.code,
      command: error?.command,
      message: error?.message,
    });
  }
}

async function getUserById(userId: unknown) {
  if (!userId) return null;
  if (typeof userId === "object" && "email" in (userId as any)) {
    return userId as any;
  }

  return UserModel.findById(userId).select("name email").lean();
}

async function getBusinessById(businessId: unknown) {
  if (!businessId) return null;
  if (typeof businessId === "object" && "businessName" in (businessId as any)) {
    return businessId as any;
  }

  return BusinessModel.findById(businessId)
    .populate("userId", "name email")
    .lean();
}

async function getCarById(carId: unknown) {
  if (!carId) return null;
  if (typeof carId === "object" && "name" in (carId as any)) {
    return carId as any;
  }

  return CarModel.findById(carId)
    .populate("brandId", "name")
    .populate("businessId")
    .populate("ownerId", "name email")
    .lean();
}

async function getBookingCustomer(booking: any) {
  return getUserById(booking?.userId);
}

async function getBookingCar(booking: any) {
  return getCarById(booking?.carId);
}

async function getOwnerRecipient(ownerType: unknown, ownerId: unknown, businessId?: unknown) {
  if (ownerType === OwnerTypeEnum.USER) {
    const user = await getUserById(ownerId);
    return {
      email: user?.email,
      name: user?.name || "Chủ xe ký gửi",
    };
  }

  const business = await getBusinessById(ownerId || businessId);
  const businessUser = business?.userId as any;

  return {
    email: businessUser?.email,
    name: business?.businessName || businessUser?.name || "Doanh nghiệp",
  };
}

async function getOwnerRecipientFromBooking(booking: any) {
  return getOwnerRecipient(
    booking?.ownerType || OwnerTypeEnum.BUSINESS,
    booking?.ownerId,
    booking?.businessId,
  );
}

async function getOwnerRecipientFromCar(car: any) {
  return getOwnerRecipient(
    car?.ownerType || OwnerTypeEnum.BUSINESS,
    car?.ownerId,
    car?.businessId,
  );
}

async function getAdminEmails() {
  const admins = await UserModel.find({
    role: UserRoleEnum.ADMIN,
    isDeleted: false,
  })
    .select("email")
    .lean();

  return admins.map((admin) => admin.email).filter(Boolean);
}

async function getHolidayPricingRecipients() {
  const cars = await CarModel.find({
    isDeleted: false,
    ownerType: { $in: [OwnerTypeEnum.USER, OwnerTypeEnum.BUSINESS] },
  })
    .select("ownerId ownerType businessId")
    .lean();
  const userOwnerIds = cars
    .filter((car: any) => car.ownerType === OwnerTypeEnum.USER && car.ownerId)
    .map((car: any) => car.ownerId);
  const businessOwnerIds = cars
    .filter((car: any) => car.ownerType === OwnerTypeEnum.BUSINESS)
    .map((car: any) => car.ownerId || car.businessId)
    .filter(Boolean);

  const [users, businesses] = await Promise.all([
    UserModel.find({
      _id: { $in: userOwnerIds },
      isDeleted: false,
    })
      .select("name email")
      .lean(),
    BusinessModel.find({
      _id: { $in: businessOwnerIds },
      isDeleted: false,
    })
      .populate("userId", "name email")
      .select("businessName userId")
      .lean(),
  ]);
  const recipients = new Map<string, string>();

  users.forEach((user: any) => {
    if (user.email) {
      recipients.set(user.email, user.name || "Người dùng ký gửi");
    }
  });

  businesses.forEach((business: any) => {
    const businessUser = business.userId as any;

    if (businessUser?.email) {
      recipients.set(
        businessUser.email,
        business.businessName || businessUser.name || "Doanh nghiệp",
      );
    }
  });

  return Array.from(recipients.entries()).map(([email, name]) => ({
    email,
    name,
  }));
}

function getCarName(car: any) {
  return car?.name || "xe";
}

function getBookingLines(booking: any, car: any, customer?: any) {
  return compactLines([
    `Xe: ${getCarName(car)}`,
    customer?.name ? `Khách thuê: ${customer.name}` : undefined,
    `Thời gian nhận xe: ${formatDateTime(booking?.startDate)}`,
    `Thời gian trả xe: ${formatDateTime(booking?.endDate)}`,
    `Tổng tiền dự kiến: ${formatCurrency(booking?.totalPrice)}`,
  ]);
}

function getCarLines(car: any, ownerName?: string) {
  const brandName = car?.brandId?.name;
  const rentalPrice =
    car?.rentalUnit === "HOUR"
      ? formatCurrency(car?.pricePerHour)
      : formatCurrency(car?.pricePerDay);

  return compactLines([
    `Xe: ${getCarName(car)}`,
    brandName ? `Hãng xe: ${brandName}` : undefined,
    ownerName ? `Chủ sở hữu: ${ownerName}` : undefined,
    `Giá thuê: ${rentalPrice}`,
  ]);
}

export async function verifySmtpConnection() {
  let lastError: unknown = null;

  try {
    assertMailEnv();
    if (smtpConfig.mode === "console") {
      console.log("MAIL_MODE=console, skip SMTP connection verification");
      return;
    }

    logSmtpConfig();

    for (const port of getSmtpPortCandidates()) {
      try {
        const transporter = await createSmtpTransporter(port);
        await transporter.verify();

        console.log("SMTP Connected Successfully", {
          host: smtpConfig.host,
          resolvedHost: resolvedSmtpHost,
          port,
          secure: port === 465,
          addressFamily: smtpAddressFamilyLabel,
        });
        return;
      } catch (error: any) {
        lastError = error;
        console.error("SMTP Connection Attempt Failed", {
          host: smtpConfig.host,
          resolvedHost: resolvedSmtpHost,
          port,
          secure: port === 465,
          addressFamily: smtpAddressFamilyLabel,
          code: error?.code,
          command: error?.command,
          message: error?.message,
        });

        if (!isSmtpConnectionError(error)) break;
      }
    }

    throw lastError;
  } catch (error) {
    console.error("SMTP Connection Failed", {
      host: smtpConfig.host,
      resolvedHost: resolvedSmtpHost,
      portCandidates: getSmtpPortCandidates(),
      addressFamily: smtpAddressFamilyLabel,
      emailUser: smtpConfig.user || null,
      error,
    });
  }
}

export async function sendOtpMail(email: string, otp: string) {
  assertMailEnv();

  console.log("Sending OTP email:", {
    host: smtpConfig.host,
    resolvedHost: resolvedSmtpHost,
    portCandidates: getSmtpPortCandidates(),
    addressFamily: smtpAddressFamilyLabel,
    emailUser: smtpConfig.user,
    to: email,
  });

  let lastError: unknown = null;

  if (smtpConfig.mode === "console") {
    console.log("MAIL_MODE=console, skip real OTP email", {
      to: email,
      subject: "BQDrive - Mã xác thực OTP",
      otp,
    });
    return;
  }

  for (const port of getSmtpPortCandidates()) {
    try {
      const transporter = await createSmtpTransporter(port);

      await transporter.sendMail({
        from: getMailFrom(),
        to: email,
        subject: "BQDrive - Mã xác thực OTP",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>BQDrive</h2>
            <p>Mã OTP xác thực tài khoản của bạn là:</p>
            <h1 style="letter-spacing: 4px;">${otp}</h1>
            <p>Mã này có hiệu lực trong 5 phút.</p>
            <p>Nếu bạn không yêu cầu đăng ký, vui lòng bỏ qua email này.</p>
          </div>
        `,
      });

      console.log("OTP email sent successfully:", {
        host: smtpConfig.host,
        resolvedHost: resolvedSmtpHost,
        port,
        secure: port === 465,
        addressFamily: smtpAddressFamilyLabel,
        emailUser: smtpConfig.user,
        to: email,
      });
      return;
    } catch (error: any) {
      lastError = error;
      console.error("OTP email send attempt failed:", {
        host: smtpConfig.host,
        resolvedHost: resolvedSmtpHost,
        port,
        secure: port === 465,
        addressFamily: smtpAddressFamilyLabel,
        emailUser: smtpConfig.user,
        to: email,
        code: error?.code,
        command: error?.command,
        message: error?.message,
      });

      if (!isSmtpConnectionError(error)) break;
    }
  }

  throw lastError;
}

export async function sendPasswordResetOtpMail(email: string, otp: string, name?: string) {
  assertMailEnv();

  const subject = "BQDrive - Mã xác thực đặt lại mật khẩu";
  const displayName = name || "bạn";

  let lastError: unknown = null;

  if (smtpConfig.mode === "console") {
    console.log("MAIL_MODE=console, skip real password reset OTP email", {
      to: email,
      subject,
      otp,
    });
    return;
  }

  for (const port of getSmtpPortCandidates()) {
    try {
      const transporter = await createSmtpTransporter(port);

      await transporter.sendMail({
        from: getMailFrom(),
        to: email,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; color: #111827;">
            <h2 style="margin: 0 0 12px;">BQDrive</h2>
            <p>Chào ${displayName},</p>
            <p>Bạn đang yêu cầu đặt lại mật khẩu cho tài khoản BQDrive.</p>
            <p>Mã xác thực của bạn là:</p>
            <h1 style="letter-spacing: 6px; color: #0f172a;">${otp}</h1>
            <p>Mã có hiệu lực trong 5 phút.</p>
            <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
          </div>
        `,
      });

      console.log("Password reset OTP email sent successfully:", {
        host: smtpConfig.host,
        resolvedHost: resolvedSmtpHost,
        port,
        secure: port === 465,
        addressFamily: smtpAddressFamilyLabel,
        emailUser: smtpConfig.user,
        to: email,
      });
      return;
    } catch (error: any) {
      lastError = error;
      console.error("Password reset OTP email send attempt failed:", {
        host: smtpConfig.host,
        resolvedHost: resolvedSmtpHost,
        port,
        secure: port === 465,
        addressFamily: smtpAddressFamilyLabel,
        emailUser: smtpConfig.user,
        to: email,
        code: error?.code,
        command: error?.command,
        message: error?.message,
      });

      if (!isSmtpConnectionError(error)) break;
    }
  }

  throw lastError;
}

export async function sendPasswordChangedMail(email: string, name?: string) {
  await safeSendMail("sendPasswordChangedMail", async () => {
    await sendBusinessNotificationMail({
      to: email,
      subject: "BQDrive - Mật khẩu đã được thay đổi",
      intro: `Chào ${name || "bạn"}, mật khẩu tài khoản BQDrive của bạn đã được thay đổi thành công.`,
      lines: [
        "Nếu bạn thực hiện thay đổi này, bạn có thể đăng nhập bằng mật khẩu mới.",
        "Nếu bạn không thực hiện thay đổi này, vui lòng liên hệ bộ phận hỗ trợ BQDrive ngay.",
      ],
    });
  });
}

export async function sendBookingCreatedMail(booking: any) {
  await safeSendMail("sendBookingCreatedMail", async () => {
    const [owner, car, customer] = await Promise.all([
      getOwnerRecipientFromBooking(booking),
      getBookingCar(booking),
      getBookingCustomer(booking),
    ]);

    await sendBusinessNotificationMail({
      to: owner.email,
      subject: "BQDrive - Có yêu cầu thuê xe mới",
      intro:
        "Khách vừa gửi yêu cầu thuê xe. Vui lòng vào hệ thống để duyệt hoặc từ chối yêu cầu này.",
      lines: getBookingLines(booking, car, customer),
      actionText: "Bạn cần xử lý booking này trong trang quản lý booking.",
    });
  });
}

export async function sendBookingApprovedMail(booking: any) {
  await safeSendMail("sendBookingApprovedMail", async () => {
    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);

    await sendBusinessNotificationMail({
      to: customer?.email,
      subject: "BQDrive - Yêu cầu thuê xe đã được duyệt",
      intro:
        "Yêu cầu thuê xe của bạn đã được chủ xe duyệt. Vui lòng tiếp tục thanh toán để hoàn tất bước đặt xe.",
      lines: getBookingLines(booking, car),
      actionText: "Bạn có thể quay lại BQDrive để tiếp tục thanh toán.",
    });
  });
}

export async function sendBookingRejectedMail(booking: any) {
  await safeSendMail("sendBookingRejectedMail", async () => {
    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);

    await sendBusinessNotificationMail({
      to: customer?.email,
      subject: "BQDrive - Yêu cầu thuê xe bị từ chối",
      intro:
        "Yêu cầu thuê xe của bạn đã bị chủ xe từ chối. Bạn có thể chọn xe hoặc khung thời gian khác trên BQDrive.",
      lines: compactLines([
        ...getBookingLines(booking, car),
        booking?.cancelReason ? `Lý do: ${booking.cancelReason}` : undefined,
      ]),
    });
  });
}

export async function sendBookingRequestTimeoutMail(booking: any) {
  await safeSendMail("sendBookingRequestTimeoutMail", async () => {
    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);

    await sendBusinessNotificationMail({
      to: customer?.email,
      subject: "BQDrive - Yêu cầu thuê xe đã được hủy tự động",
      intro:
        `Kính gửi ${customer?.name || "Quý khách"}, BQDrive rất tiếc vì yêu cầu thuê xe của bạn chưa được bên cho thuê phản hồi trong thời gian quy định.`,
      lines: compactLines([
        ...getBookingLines(booking, car),
        booking?.cancelReason ? `Lý do: ${booking.cancelReason}` : undefined,
        "Hệ thống đã tự động hủy yêu cầu này để tránh giữ lịch xe quá lâu.",
        "Bạn có thể quay lại BQDrive để chọn xe khác hoặc chọn khung thời gian thuê phù hợp hơn.",
      ]),
      actionText:
        "BQDrive xin lỗi bạn vì sự bất tiện này và hy vọng tiếp tục được hỗ trợ chuyến đi tiếp theo.",
    });
  });
}

export async function sendBookingPaymentTimeoutMail(booking: any) {
  await safeSendMail("sendBookingPaymentTimeoutMail", async () => {
    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);

    await sendBusinessNotificationMail({
      to: customer?.email,
      subject: "BQDrive - Booking đã được hủy tự động",
      intro:
        `Kính gửi ${customer?.name || "Quý khách"}, booking của bạn đã được chủ xe duyệt nhưng chưa được thanh toán trong thời gian quy định.`,
      lines: compactLines([
        ...getBookingLines(booking, car),
        booking?.cancelReason ? `Lý do: ${booking.cancelReason}` : undefined,
        "Hệ thống đã tự động hủy booking để giải phóng lịch xe.",
        "Bạn có thể quay lại BQDrive để gửi yêu cầu thuê mới hoặc chọn khung thời gian phù hợp hơn.",
      ]),
      actionText:
        "BQDrive xin lỗi vì sự bất tiện này và hy vọng tiếp tục được hỗ trợ bạn trong chuyến đi tiếp theo.",
    });
  });
}

export async function sendCashPaymentSelectedMail(booking: any, payment?: any) {
  await safeSendMail("sendCashPaymentSelectedMail", async () => {
    const [owner, car, customer] = await Promise.all([
      getOwnerRecipientFromBooking(booking),
      getBookingCar(booking),
      getBookingCustomer(booking),
    ]);

    await sendBusinessNotificationMail({
      to: owner.email,
      subject: "BQDrive - Khách chọn thanh toán khi nhận xe",
      intro:
        "Khách đã chọn thanh toán tiền mặt khi nhận xe. Chủ xe cần bàn giao xe và xác nhận đã nhận tiền đúng quy trình.",
      lines: compactLines([
        ...getBookingLines(booking, car, customer),
        payment?.amount ? `Số tiền cần thu: ${formatCurrency(payment.amount)}` : undefined,
      ]),
      actionText: "Vui lòng kiểm tra booking trước khi bàn giao xe.",
    });
  });
}

export async function sendPaymentSuccessMail(booking: any, payment?: any) {
  await safeSendMail("sendPaymentSuccessMail", async () => {
    const remainingAmount = Math.max(Number(booking?.remainingAmount || 0), 0);
    const isDepositPayment =
      String(payment?.paymentType || "").toUpperCase() === "DEPOSIT" &&
      remainingAmount > 0;
    const [owner, customer, car] = await Promise.all([
      getOwnerRecipientFromBooking(booking),
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);

    const lines = compactLines([
      ...getBookingLines(booking, car, customer),
      payment?.amount ? `Số tiền đã thanh toán: ${formatCurrency(payment.amount)}` : undefined,
      payment?.method ? `Phương thức: ${payment.method}` : undefined,
    ]);
    const intro = isDepositPayment
      ? "Thanh toán cọc đã được ghi nhận thành công. Booking vẫn còn phần tiền còn lại cần xử lý."
      : "Thanh toán đã được ghi nhận thành công. Booking đã thanh toán đủ khoản cần trả.";
    const actionText = isDepositPayment
      ? "Phần còn lại có thể thanh toán trên hệ thống hoặc trả trực tiếp khi nhận xe."
      : "Vui lòng theo dõi lịch nhận xe trên hệ thống BQDrive.";

    await sendBusinessNotificationMail({
      to: [customer?.email, owner.email].filter(Boolean),
      subject: "BQDrive - Thanh toán thành công",
      intro,
      lines,
      actionText,
    });
  });
}

export async function sendDepositRemainingPaymentMail(booking: any, payment?: any) {
  await safeSendMail("sendDepositRemainingPaymentMail", async () => {
    const remainingAmount = Math.max(Number(booking?.remainingAmount || 0), 0);

    if (String(payment?.paymentType || "").toUpperCase() !== "DEPOSIT") {
      console.info("Skip remaining payment mail: paymentType is not DEPOSIT", {
        paymentId: payment?._id,
        bookingId: booking?._id,
      });
      return;
    }

    if (String(payment?.status || "").toUpperCase() !== "PAID") {
      console.info("Skip remaining payment mail: payment status is not PAID", {
        paymentId: payment?._id,
        bookingId: booking?._id,
      });
      return;
    }

    if (remainingAmount <= 0) {
      console.info("Skip remaining payment mail: remainingAmount <= 0", {
        paymentId: payment?._id,
        bookingId: booking?._id,
      });
      return;
    }

    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);

    if (!customer?.email) {
      console.info("Skip remaining payment mail: renter email missing", {
        paymentId: payment?._id,
        bookingId: booking?._id,
      });
      return;
    }

    if (payment?._id) {
      const reservedPayment = await PaymentModel.findOneAndUpdate(
        {
          _id: payment._id,
          remainingPaymentReminderSentAt: { $exists: false },
        },
        {
          $set: {
            remainingPaymentReminderSentAt: new Date(),
          },
        },
        { new: true },
      );

      if (!reservedPayment) {
        console.info("Skip remaining payment mail: already sent", {
          paymentId: payment._id,
          bookingId: booking?._id,
        });
        return;
      }
    }

    const bookingCode = String(booking?._id || "").slice(-8).toUpperCase();

    await sendBusinessNotificationMail({
      to: customer?.email,
      subject: "BQDrive - Thanh toán cọc thành công, còn lại cần thanh toán",
      intro:
        `Xin chào ${customer?.name || "bạn"}, BQDrive đã ghi nhận thanh toán cọc thành công cho booking #${bookingCode}.`,
      lines: compactLines([
        ...getBookingLines(booking, car, customer),
        `Tổng tiền thuê: ${formatCurrency(booking?.totalPrice)}`,
        payment?.amount
          ? `Số tiền cọc đã thanh toán: ${formatCurrency(payment.amount)}`
          : undefined,
        `Số tiền còn lại cần thanh toán: ${formatCurrency(remainingAmount)}`,
        "Bạn có thể xử lý phần còn lại bằng một trong hai cách:",
        "1. Thanh toán phần còn lại trên hệ thống BQDrive.",
        "2. Thanh toán trực tiếp cho chủ xe khi nhận xe.",
      ]),
      actionText:
        "Lưu ý: Nếu thanh toán trực tiếp, khoản tiền sẽ được ghi nhận trên hệ thống sau khi chủ xe xác nhận đã thu.",
    });

    console.info("Remaining payment reminder mail sent", {
      bookingCode,
      paymentId: payment?._id,
      bookingId: booking?._id,
    });
  });
}

export async function sendRemainingCashConfirmedMail(booking: any, payment?: any) {
  await safeSendMail("sendRemainingCashConfirmedMail", async () => {
    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);

    await sendBusinessNotificationMail({
      to: customer?.email,
      subject: "BQDrive - Chủ xe đã xác nhận thu phần còn lại",
      intro:
        "Chủ xe đã xác nhận thu phần tiền còn lại trực tiếp. Booking hiện đã thanh toán đủ.",
      lines: compactLines([
        ...getBookingLines(booking, car, customer),
        payment?.amount
          ? `Số tiền đã thu trực tiếp: ${formatCurrency(payment.amount)}`
          : undefined,
        "Phương thức ghi nhận: Tiền mặt / thanh toán trực tiếp khi nhận xe.",
      ]),
      actionText: "Cảm ơn bạn đã sử dụng BQDrive.",
    });
  });
}

export async function sendBookingHandoverMail(booking: any) {
  await safeSendMail("sendBookingHandoverMail", async () => {
    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);

    await sendBusinessNotificationMail({
      to: customer?.email,
      subject: "BQDrive - Chuyến thuê đã bắt đầu",
      intro:
        "Xe đã được bàn giao thành công. Chuyến thuê của bạn hiện đang diễn ra.",
      lines: getBookingLines(booking, car),
      actionText: "Chúc bạn có một chuyến đi an toàn cùng BQDrive.",
    });
  });
}

export async function sendBookingReturnReminderMail(booking: any) {
  await safeSendMail("sendBookingReturnReminderMail", async () => {
    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);

    await sendBusinessNotificationMail({
      to: customer?.email || booking?.renterInfo?.email,
      subject: "BQDrive - Sắp đến hạn trả xe",
      intro:
        "Chuyến thuê xe của bạn sắp đến thời gian trả xe. Vui lòng chuẩn bị trả xe đúng giờ và kiểm tra lại tài sản cá nhân trước khi bàn giao.",
      lines: compactLines([
        ...getBookingLines(booking, car, customer),
        `Thời gian trả xe: ${formatDateTime(booking?.endDate)}`,
        booking?.returnAddressSnapshot
          ? `Địa điểm trả xe: ${booking.returnAddressSnapshot}`
          : undefined,
      ]),
      actionText:
        "BQDrive gửi nhắc trước 30 phút để bạn có đủ thời gian chuẩn bị trả xe.",
    });
  });
}

export async function sendHolidayPricingReminderMail(holiday: any) {
  await safeSendMail("sendHolidayPricingReminderMail", async () => {
    if (!holiday?.isActive || holiday?.isDeleted) return;

    const recipients = await getHolidayPricingRecipients();

    if (recipients.length === 0) return;

    await Promise.all(
      recipients.map((recipient) =>
        sendBusinessNotificationMail({
          to: recipient.email,
          subject: "BQDrive - Admin vừa cập nhật ngày lễ",
          intro:
            `Chào ${recipient.name}, admin vừa thiết lập ngày lễ trong hệ thống. ` +
            "Giá thuê ngày lễ sẽ được áp dụng khi khách chọn lịch thuê trùng ngày này.",
          lines: compactLines([
            `Ngày lễ: ${holiday.name || "Ngày lễ"}`,
            `Thời gian áp dụng: ${formatHolidayRange(holiday)}`,
            holiday.note ? `Ghi chú: ${holiday.note}` : undefined,
          ]),
          actionText:
            "Vui lòng vào trang quản lý xe để kiểm tra và điều chỉnh giá ngày lễ nếu cần.",
        }),
      ),
    );
  });
}

export async function sendBookingCompletedMail(booking: any) {
  await safeSendMail("sendBookingCompletedMail", async () => {
    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);
    const customerName =
      customer?.name || booking?.renterInfo?.fullName || "Quý khách";
    const bookingCode = String(booking?._id || "").slice(-8).toUpperCase();
    const reviewUrl = `${getWebsiteUrl().replace(/\/$/, "")}/bookings/${booking?._id}`;

    await sendBusinessNotificationMail({
      to: customer?.email || booking?.renterInfo?.email,
      subject:
        "Cảm ơn Quý khách đã tin tưởng và đồng hành cùng BQDrive, Vui lòng hãy để lại đánh giá trên hệ thống của chúng tôi!",
      intro: `Kính gửi Quý khách ${customerName},`,
      lines: compactLines([
        `Đội ngũ BQDrive xin gửi lời cảm ơn chân thành nhất đến Quý khách vì đã lựa chọn dịch vụ thuê xe của chúng tôi cho chuyến đi vừa qua vào ngày ${formatRentalPeriod(booking)}. Chúng tôi hy vọng Quý khách đã có một hành trình suôn sẻ, an toàn và những trải nghiệm tuyệt vời nhất.`,
        "Sự hài lòng của khách hàng luôn là ưu tiên hàng đầu tại BQDrive. Để không ngừng nâng cao chất lượng dịch vụ, chúng tôi rất mong nhận được những chia sẻ và đóng góp từ Quý khách về trải nghiệm vừa qua. Mọi ý kiến của Quý khách, dù nhỏ nhất, đều là nguồn động lực to lớn giúp chúng tôi hoàn thiện hơn mỗi ngày.",
        `Mã booking: #${bookingCode}`,
        `Xe: ${getCarName(car)}`,
        `Link đánh giá chuyến thuê: ${reviewUrl}`,
        "Nếu Quý khách cần hỗ trợ thêm bất kỳ thông tin nào hoặc muốn đặt xe cho những chuyến đi sắp tới, xin vui lòng liên hệ với chúng tôi qua:",
        `Hotline: ${getSupportPhone()}`,
        `Email: ${getSupportEmail()}`,
        `Website: ${getWebsiteUrl()}`,
        "Một lần nữa, cảm ơn Quý khách đã cho chúng tôi cơ hội được phục vụ. Kính chúc Quý khách nhiều sức khỏe, thành công và hy vọng sẽ được tiếp tục đồng hành cùng Quý khách trên những chặng đường sắp tới!",
        "Trân trọng,",
        "Đội ngũ Chăm sóc Khách hàng BQDrive",
      ]),
      actionText:
        "Vui lòng truy cập chi tiết booking trên BQDrive để để lại đánh giá chuyến thuê.",
    });
  });
}
export async function sendBookingNoShowMail(booking: any) {
  await safeSendMail("sendBookingNoShowMail", async () => {
    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);

    await sendBusinessNotificationMail({
      to: customer?.email,
      subject: "BQDrive - Booking được đánh dấu không nhận xe",
      intro:
        "Booking của bạn đã được chủ xe đánh dấu khách không nhận xe.",
      lines: compactLines([
        ...getBookingLines(booking, car),
        booking?.noShowReason ? `Lý do: ${booking.noShowReason}` : undefined,
      ]),
      actionText:
        "Chính sách xử lý cọc/thanh toán sẽ được thực hiện theo quy định của hệ thống hoặc chủ xe.",
    });
  });
}

export async function sendBookingCancellationRefundMail(booking: any, refund?: any) {
  await safeSendMail("sendBookingCancellationRefundMail", async () => {
    const [customer, car] = await Promise.all([
      getBookingCustomer(booking),
      getBookingCar(booking),
    ]);
    const bookingCode = String(booking?._id || "").slice(-8).toUpperCase();
    const refundAmount = Number(refund?.refundAmount || 0);

    await sendBusinessNotificationMail({
      to: customer?.email || booking?.renterInfo?.email,
      subject: refundAmount > 0
        ? "BQDrive - Booking đã hủy, yêu cầu hoàn tiền đang chờ xử lý"
        : "BQDrive - Booking đã được hủy",
      intro:
        "Booking của bạn đã được hủy thành công trên hệ thống BQDrive.",
      lines: compactLines([
        `Mã booking: #${bookingCode}`,
        `Xe: ${getCarName(car)}`,
        `Thời gian thuê: ${formatRentalPeriod(booking)}`,
        booking?.cancelReason ? `Lý do hủy: ${booking.cancelReason}` : undefined,
        `Số tiền đã thanh toán tại thời điểm hủy: ${formatCurrency(
          booking?.cancellationSummary?.paidAmountAtCancellation,
        )}`,
        `Phí hủy: ${formatCurrency(booking?.cancellationSummary?.cancellationFee)}`,
        `Số tiền dự kiến hoàn: ${formatCurrency(refundAmount)}`,
        refundAmount > 0
          ? "Do cổng thanh toán chưa có API hoàn tiền tự động trong hệ thống, yêu cầu hoàn tiền sẽ được xử lý thủ công và cần người thuê xác nhận sau khi nhận tiền."
          : "Booking này không phát sinh khoản tiền cần hoàn.",
      ]),
      actionText:
        refundAmount > 0
          ? "Vui lòng theo dõi trạng thái hoàn tiền trong chi tiết booking."
          : "Cảm ơn bạn đã sử dụng BQDrive.",
    });
  });
}

export async function sendCarSubmittedToAdminMail(car: any) {
  await safeSendMail("sendCarSubmittedToAdminMail", async () => {
    const [adminEmails, owner] = await Promise.all([
      getAdminEmails(),
      getOwnerRecipientFromCar(car),
    ]);

    const isUserConsignment = car?.ownerType === OwnerTypeEnum.USER;

    await sendBusinessNotificationMail({
      to: adminEmails,
      subject: isUserConsignment
        ? "BQDrive - Có xe ký gửi mới chờ duyệt"
        : "BQDrive - Có xe doanh nghiệp mới chờ duyệt",
      intro: isUserConsignment
        ? "Có xe ký gửi mới từ người dùng cần admin kiểm duyệt."
        : "Có xe mới từ doanh nghiệp cần admin kiểm duyệt.",
      lines: getCarLines(car, owner.name),
      actionText: "Admin vui lòng vào trang quản lý xe để kiểm duyệt.",
    });
  });
}

export async function sendCarApprovedMail(car: any) {
  await safeSendMail("sendCarApprovedMail", async () => {
    const owner = await getOwnerRecipientFromCar(car);

    await sendBusinessNotificationMail({
      to: owner.email,
      subject: "BQDrive - Xe của bạn đã được duyệt",
      intro:
        "Xe của bạn đã được admin duyệt và có thể hiển thị trên hệ thống BQDrive.",
      lines: getCarLines(car, owner.name),
      actionText: "Bạn có thể vào trang quản lý xe để theo dõi trạng thái hiển thị.",
    });
  });
}

export async function sendCarRejectedMail(car: any) {
  await safeSendMail("sendCarRejectedMail", async () => {
    const owner = await getOwnerRecipientFromCar(car);

    await sendBusinessNotificationMail({
      to: owner.email,
      subject: "BQDrive - Xe của bạn bị từ chối",
      intro:
        "Xe của bạn đã bị admin từ chối. Vui lòng kiểm tra lý do và cập nhật lại thông tin nếu cần.",
      lines: compactLines([
        ...getCarLines(car, owner.name),
        car?.rejectReason ? `Lý do từ chối: ${car.rejectReason}` : undefined,
      ]),
    });
  });
}

