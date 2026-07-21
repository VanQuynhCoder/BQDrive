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
  return process.env.SUPPORT_PHONE || process.env.HOTLINE || "Dang cap nhat";
}

function getSupportEmail() {
  return (
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_FROM_ADDRESS ||
    smtpConfig.fromAddress ||
    smtpConfig.user ||
    "Dang cap nhat"
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
          <div style="margin-top:6px;color:#ffffffcc;font-size:14px;">ThÃ´ng bÃ¡o nghiá»‡p vá»¥</div>
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
      name: user?.name || "Chá»§ xe kÃ½ gá»­i",
    };
  }

  const business = await getBusinessById(ownerId || businessId);
  const businessUser = business?.userId as any;

  return {
    email: businessUser?.email,
    name: business?.businessName || businessUser?.name || "Doanh nghiá»‡p",
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
      recipients.set(user.email, user.name || "NgÆ°á»i dÃ¹ng kÃ½ gá»­i");
    }
  });

  businesses.forEach((business: any) => {
    const businessUser = business.userId as any;

    if (businessUser?.email) {
      recipients.set(
        businessUser.email,
        business.businessName || businessUser.name || "Doanh nghiá»‡p",
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
    customer?.name ? `KhÃ¡ch thuÃª: ${customer.name}` : undefined,
    `Thá»i gian nháº­n xe: ${formatDateTime(booking?.startDate)}`,
    `Thá»i gian tráº£ xe: ${formatDateTime(booking?.endDate)}`,
    `Tá»•ng tiá»n dá»± kiáº¿n: ${formatCurrency(booking?.totalPrice)}`,
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
    brandName ? `HÃ£ng xe: ${brandName}` : undefined,
    ownerName ? `Chá»§ sá»Ÿ há»¯u: ${ownerName}` : undefined,
    `GiÃ¡ thuÃª: ${rentalPrice}`,
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
      subject: "BQDrive - MÃ£ xÃ¡c thá»±c OTP",
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
        subject: "BQDrive - MÃ£ xÃ¡c thá»±c OTP",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>BQDrive</h2>
            <p>MÃ£ OTP xÃ¡c thá»±c tÃ i khoáº£n cá»§a báº¡n lÃ :</p>
            <h1 style="letter-spacing: 4px;">${otp}</h1>
            <p>MÃ£ nÃ y cÃ³ hiá»‡u lá»±c trong 5 phÃºt.</p>
            <p>Náº¿u báº¡n khÃ´ng yÃªu cáº§u Ä‘Äƒng kÃ½, vui lÃ²ng bá» qua email nÃ y.</p>
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

  const subject = "BQDrive - MÃ£ xÃ¡c thá»±c Ä‘áº·t láº¡i máº­t kháº©u";
  const displayName = name || "báº¡n";

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
            <p>ChÃ o ${displayName},</p>
            <p>Báº¡n Ä‘ang yÃªu cáº§u Ä‘áº·t láº¡i máº­t kháº©u cho tÃ i khoáº£n BQDrive.</p>
            <p>MÃ£ xÃ¡c thá»±c cá»§a báº¡n lÃ :</p>
            <h1 style="letter-spacing: 6px; color: #0f172a;">${otp}</h1>
            <p>MÃ£ cÃ³ hiá»‡u lá»±c trong 5 phÃºt.</p>
            <p>Náº¿u báº¡n khÃ´ng yÃªu cáº§u Ä‘áº·t láº¡i máº­t kháº©u, vui lÃ²ng bá» qua email nÃ y.</p>
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
      subject: "BQDrive - Máº­t kháº©u Ä‘Ã£ Ä‘Æ°á»£c thay Ä‘á»•i",
      intro: `ChÃ o ${name || "báº¡n"}, máº­t kháº©u tÃ i khoáº£n BQDrive cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c thay Ä‘á»•i thÃ nh cÃ´ng.`,
      lines: [
        "Náº¿u báº¡n thá»±c hiá»‡n thay Ä‘á»•i nÃ y, báº¡n cÃ³ thá»ƒ Ä‘Äƒng nháº­p báº±ng máº­t kháº©u má»›i.",
        "Náº¿u báº¡n khÃ´ng thá»±c hiá»‡n thay Ä‘á»•i nÃ y, vui lÃ²ng liÃªn há»‡ bá»™ pháº­n há»— trá»£ BQDrive ngay.",
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
      subject: "BQDrive - CÃ³ yÃªu cáº§u thuÃª xe má»›i",
      intro:
        "KhÃ¡ch vá»«a gá»­i yÃªu cáº§u thuÃª xe. Vui lÃ²ng vÃ o há»‡ thá»‘ng Ä‘á»ƒ duyá»‡t hoáº·c tá»« chá»‘i yÃªu cáº§u nÃ y.",
      lines: getBookingLines(booking, car, customer),
      actionText: "Báº¡n cáº§n xá»­ lÃ½ booking nÃ y trong trang quáº£n lÃ½ booking.",
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
      subject: "BQDrive - YÃªu cáº§u thuÃª xe Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t",
      intro:
        "YÃªu cáº§u thuÃª xe cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c chá»§ xe duyá»‡t. Vui lÃ²ng tiáº¿p tá»¥c thanh toÃ¡n Ä‘á»ƒ hoÃ n táº¥t bÆ°á»›c Ä‘áº·t xe.",
      lines: getBookingLines(booking, car),
      actionText: "Báº¡n cÃ³ thá»ƒ quay láº¡i BQDrive Ä‘á»ƒ tiáº¿p tá»¥c thanh toÃ¡n.",
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
      subject: "BQDrive - YÃªu cáº§u thuÃª xe bá»‹ tá»« chá»‘i",
      intro:
        "YÃªu cáº§u thuÃª xe cá»§a báº¡n Ä‘Ã£ bá»‹ chá»§ xe tá»« chá»‘i. Báº¡n cÃ³ thá»ƒ chá»n xe hoáº·c khung thá»i gian khÃ¡c trÃªn BQDrive.",
      lines: compactLines([
        ...getBookingLines(booking, car),
        booking?.cancelReason ? `LÃ½ do: ${booking.cancelReason}` : undefined,
      ]),
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
      subject: "BQDrive - KhÃ¡ch chá»n thanh toÃ¡n khi nháº­n xe",
      intro:
        "KhÃ¡ch Ä‘Ã£ chá»n thanh toÃ¡n tiá»n máº·t khi nháº­n xe. Chá»§ xe cáº§n bÃ n giao xe vÃ  xÃ¡c nháº­n Ä‘Ã£ nháº­n tiá»n Ä‘Ãºng quy trÃ¬nh.",
      lines: compactLines([
        ...getBookingLines(booking, car, customer),
        payment?.amount ? `Sá»‘ tiá»n cáº§n thu: ${formatCurrency(payment.amount)}` : undefined,
      ]),
      actionText: "Vui lÃ²ng kiá»ƒm tra booking trÆ°á»›c khi bÃ n giao xe.",
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
      payment?.amount ? `Sá»‘ tiá»n Ä‘Ã£ thanh toÃ¡n: ${formatCurrency(payment.amount)}` : undefined,
      payment?.method ? `PhÆ°Æ¡ng thá»©c: ${payment.method}` : undefined,
    ]);
    const intro = isDepositPayment
      ? "Thanh toÃ¡n cá»c Ä‘Ã£ Ä‘Æ°á»£c ghi nháº­n thÃ nh cÃ´ng. Booking váº«n cÃ²n pháº§n tiá»n cÃ²n láº¡i cáº§n xá»­ lÃ½."
      : "Thanh toÃ¡n Ä‘Ã£ Ä‘Æ°á»£c ghi nháº­n thÃ nh cÃ´ng. Booking Ä‘Ã£ thanh toÃ¡n Ä‘á»§ khoáº£n cáº§n tráº£.";
    const actionText = isDepositPayment
      ? "Pháº§n cÃ²n láº¡i cÃ³ thá»ƒ thanh toÃ¡n trÃªn há»‡ thá»‘ng hoáº·c tráº£ trá»±c tiáº¿p khi nháº­n xe."
      : "Vui lÃ²ng theo dÃµi lá»‹ch nháº­n xe trÃªn há»‡ thá»‘ng BQDrive.";

    await sendBusinessNotificationMail({
      to: [customer?.email, owner.email].filter(Boolean),
      subject: "BQDrive - Thanh toÃ¡n thÃ nh cÃ´ng",
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
      subject: "BQDrive - Thanh toÃ¡n cá»c thÃ nh cÃ´ng, cÃ²n láº¡i cáº§n thanh toÃ¡n",
      intro:
        `Xin chÃ o ${customer?.name || "báº¡n"}, BQDrive Ä‘Ã£ ghi nháº­n thanh toÃ¡n cá»c thÃ nh cÃ´ng cho booking #${bookingCode}.`,
      lines: compactLines([
        ...getBookingLines(booking, car, customer),
        `Tá»•ng tiá»n thuÃª: ${formatCurrency(booking?.totalPrice)}`,
        payment?.amount
          ? `Sá»‘ tiá»n cá»c Ä‘Ã£ thanh toÃ¡n: ${formatCurrency(payment.amount)}`
          : undefined,
        `Sá»‘ tiá»n cÃ²n láº¡i cáº§n thanh toÃ¡n: ${formatCurrency(remainingAmount)}`,
        "Báº¡n cÃ³ thá»ƒ xá»­ lÃ½ pháº§n cÃ²n láº¡i báº±ng má»™t trong hai cÃ¡ch:",
        "1. Thanh toÃ¡n pháº§n cÃ²n láº¡i trÃªn há»‡ thá»‘ng BQDrive.",
        "2. Thanh toÃ¡n trá»±c tiáº¿p cho chá»§ xe khi nháº­n xe.",
      ]),
      actionText:
        "LÆ°u Ã½: Náº¿u thanh toÃ¡n trá»±c tiáº¿p, khoáº£n tiá»n sáº½ Ä‘Æ°á»£c ghi nháº­n trÃªn há»‡ thá»‘ng sau khi chá»§ xe xÃ¡c nháº­n Ä‘Ã£ thu.",
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
      subject: "BQDrive - Chá»§ xe Ä‘Ã£ xÃ¡c nháº­n thu pháº§n cÃ²n láº¡i",
      intro:
        "Chá»§ xe Ä‘Ã£ xÃ¡c nháº­n thu pháº§n tiá»n cÃ²n láº¡i trá»±c tiáº¿p. Booking hiá»‡n Ä‘Ã£ thanh toÃ¡n Ä‘á»§.",
      lines: compactLines([
        ...getBookingLines(booking, car, customer),
        payment?.amount
          ? `Sá»‘ tiá»n Ä‘Ã£ thu trá»±c tiáº¿p: ${formatCurrency(payment.amount)}`
          : undefined,
        "PhÆ°Æ¡ng thá»©c ghi nháº­n: Tiá»n máº·t / thanh toÃ¡n trá»±c tiáº¿p khi nháº­n xe.",
      ]),
      actionText: "Cáº£m Æ¡n báº¡n Ä‘Ã£ sá»­ dá»¥ng BQDrive.",
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
      subject: "BQDrive - Chuyáº¿n thuÃª Ä‘Ã£ báº¯t Ä‘áº§u",
      intro:
        "Xe Ä‘Ã£ Ä‘Æ°á»£c bÃ n giao thÃ nh cÃ´ng. Chuyáº¿n thuÃª cá»§a báº¡n hiá»‡n Ä‘ang diá»…n ra.",
      lines: getBookingLines(booking, car),
      actionText: "ChÃºc báº¡n cÃ³ má»™t chuyáº¿n Ä‘i an toÃ n cÃ¹ng BQDrive.",
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
      subject: "BQDrive - Sáº¯p Ä‘áº¿n háº¡n tráº£ xe",
      intro:
        "Chuyáº¿n thuÃª xe cá»§a báº¡n sáº¯p Ä‘áº¿n thá»i gian tráº£ xe. Vui lÃ²ng chuáº©n bá»‹ tráº£ xe Ä‘Ãºng giá» vÃ  kiá»ƒm tra láº¡i tÃ i sáº£n cÃ¡ nhÃ¢n trÆ°á»›c khi bÃ n giao.",
      lines: compactLines([
        ...getBookingLines(booking, car, customer),
        `Thá»i gian tráº£ xe: ${formatDateTime(booking?.endDate)}`,
        booking?.returnAddressSnapshot
          ? `Äá»‹a Ä‘iá»ƒm tráº£ xe: ${booking.returnAddressSnapshot}`
          : undefined,
      ]),
      actionText:
        "BQDrive gá»­i nháº¯c trÆ°á»›c 30 phÃºt Ä‘á»ƒ báº¡n cÃ³ Ä‘á»§ thá»i gian chuáº©n bá»‹ tráº£ xe.",
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
          subject: "BQDrive - Admin vá»«a cáº­p nháº­t ngÃ y lá»…",
          intro:
            `ChÃ o ${recipient.name}, admin vá»«a thiáº¿t láº­p ngÃ y lá»… trong há»‡ thá»‘ng. ` +
            "GiÃ¡ thuÃª ngÃ y lá»… sáº½ Ä‘Æ°á»£c Ã¡p dá»¥ng khi khÃ¡ch chá»n lá»‹ch thuÃª trÃ¹ng ngÃ y nÃ y.",
          lines: compactLines([
            `NgÃ y lá»…: ${holiday.name || "NgÃ y lá»…"}`,
            `Thá»i gian Ã¡p dá»¥ng: ${formatHolidayRange(holiday)}`,
            holiday.note ? `Ghi chÃº: ${holiday.note}` : undefined,
          ]),
          actionText:
            "Vui lÃ²ng vÃ o trang quáº£n lÃ½ xe Ä‘á»ƒ kiá»ƒm tra vÃ  Ä‘iá»u chá»‰nh giÃ¡ ngÃ y lá»… náº¿u cáº§n.",
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
      subject: "BQDrive - Booking Ä‘Æ°á»£c Ä‘Ã¡nh dáº¥u khÃ´ng nháº­n xe",
      intro:
        "Booking cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c chá»§ xe Ä‘Ã¡nh dáº¥u khÃ¡ch khÃ´ng nháº­n xe.",
      lines: compactLines([
        ...getBookingLines(booking, car),
        booking?.noShowReason ? `LÃ½ do: ${booking.noShowReason}` : undefined,
      ]),
      actionText:
        "ChÃ­nh sÃ¡ch xá»­ lÃ½ cá»c/thanh toÃ¡n sáº½ Ä‘Æ°á»£c thá»±c hiá»‡n theo quy Ä‘á»‹nh cá»§a há»‡ thá»‘ng hoáº·c chá»§ xe.",
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
        ? "BQDrive - CÃ³ xe kÃ½ gá»­i má»›i chá» duyá»‡t"
        : "BQDrive - CÃ³ xe doanh nghiá»‡p má»›i chá» duyá»‡t",
      intro: isUserConsignment
        ? "CÃ³ xe kÃ½ gá»­i má»›i tá»« ngÆ°á»i dÃ¹ng cáº§n admin kiá»ƒm duyá»‡t."
        : "CÃ³ xe má»›i tá»« doanh nghiá»‡p cáº§n admin kiá»ƒm duyá»‡t.",
      lines: getCarLines(car, owner.name),
      actionText: "Admin vui lÃ²ng vÃ o trang quáº£n lÃ½ xe Ä‘á»ƒ kiá»ƒm duyá»‡t.",
    });
  });
}

export async function sendCarApprovedMail(car: any) {
  await safeSendMail("sendCarApprovedMail", async () => {
    const owner = await getOwnerRecipientFromCar(car);

    await sendBusinessNotificationMail({
      to: owner.email,
      subject: "BQDrive - Xe cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t",
      intro:
        "Xe cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c admin duyá»‡t vÃ  cÃ³ thá»ƒ hiá»ƒn thá»‹ trÃªn há»‡ thá»‘ng BQDrive.",
      lines: getCarLines(car, owner.name),
      actionText: "Báº¡n cÃ³ thá»ƒ vÃ o trang quáº£n lÃ½ xe Ä‘á»ƒ theo dÃµi tráº¡ng thÃ¡i hiá»ƒn thá»‹.",
    });
  });
}

export async function sendCarRejectedMail(car: any) {
  await safeSendMail("sendCarRejectedMail", async () => {
    const owner = await getOwnerRecipientFromCar(car);

    await sendBusinessNotificationMail({
      to: owner.email,
      subject: "BQDrive - Xe cá»§a báº¡n bá»‹ tá»« chá»‘i",
      intro:
        "Xe cá»§a báº¡n Ä‘Ã£ bá»‹ admin tá»« chá»‘i. Vui lÃ²ng kiá»ƒm tra lÃ½ do vÃ  cáº­p nháº­t láº¡i thÃ´ng tin náº¿u cáº§n.",
      lines: compactLines([
        ...getCarLines(car, owner.name),
        car?.rejectReason ? `LÃ½ do tá»« chá»‘i: ${car.rejectReason}` : undefined,
      ]),
    });
  });
}

