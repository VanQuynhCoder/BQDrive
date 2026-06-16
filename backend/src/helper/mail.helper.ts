import nodemailer from "nodemailer";
import dns from "dns";
import net from "net";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const SMTP_DEFAULT_HOST = "smtp.gmail.com"; 
const SMTP_DEFAULT_PORT = 587;
const CONNECTION_TIMEOUT_MS = 15_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;
const SMTP_ADDRESS_FAMILY = 4;

function getNumberEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST || SMTP_DEFAULT_HOST;
  const port = getNumberEnv(
    process.env.SMTP_PORT || process.env.EMAIL_PORT,
    SMTP_DEFAULT_PORT,
  );
  const secure = port === 465;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  return {
    host,
    port,
    secure,
    user,
    pass,
  };
}

const smtpConfig = getSmtpConfig();
let resolvedSmtpHost: string | null = null;
const smtpAddressFamilyLabel = `IPv${SMTP_ADDRESS_FAMILY}`;

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

async function createSmtpTransporter() {
  const host = await resolveSmtpHostForRender();
  const transportOptions: SMTPTransport.Options = {
    host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    requireTLS: !smtpConfig.secure,
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

function logSmtpConfig() {
  console.log("SMTP Config:", {
    host: smtpConfig.host,
    resolvedHost: resolvedSmtpHost || null,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    addressFamily: smtpAddressFamilyLabel,
    emailUser: smtpConfig.user || null,
    hasEmailPass: Boolean(smtpConfig.pass),
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
}

function assertMailEnv() {
  if (!smtpConfig.user || !smtpConfig.pass) {
    throw new Error("Missing EMAIL_USER or EMAIL_PASS for SMTP authentication");
  }
}

export async function verifySmtpConnection() {
  try {
    assertMailEnv();
    const transporter = await createSmtpTransporter();
    logSmtpConfig();
    await transporter.verify();
    console.log("SMTP Connected Successfully");
  } catch (error) {
    console.error("SMTP Connection Failed", {
      host: smtpConfig.host,
      port: smtpConfig.port,
      addressFamily: smtpAddressFamilyLabel,
      emailUser: smtpConfig.user || null,
      error,
    });
  }
}

export async function sendOtpMail(email: string, otp: string) {
  assertMailEnv();
  const transporter = await createSmtpTransporter();

  console.log("Sending OTP email:", {
    host: smtpConfig.host,
    resolvedHost: resolvedSmtpHost,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    addressFamily: smtpAddressFamilyLabel,
    emailUser: smtpConfig.user,
    to: email,
  });

  await transporter.sendMail({
    from: `"BQDrive" <${smtpConfig.user}>`,
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
    port: smtpConfig.port,
    emailUser: smtpConfig.user,
    to: email,
  });
}
