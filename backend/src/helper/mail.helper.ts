import nodemailer from "nodemailer";

const SMTP_DEFAULT_HOST = "smtp.gmail.com"; 
const SMTP_DEFAULT_PORT = 587;
const CONNECTION_TIMEOUT_MS = 15_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

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

export const transporter = nodemailer.createTransport({
  host: smtpConfig.host,
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
  tls: {
    servername: smtpConfig.host,
  },
});

function logSmtpConfig() {
  console.log("SMTP Config:", {
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
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
    logSmtpConfig();
    await transporter.verify();
    console.log("SMTP Connected Successfully");
  } catch (error) {
    console.error("SMTP Connection Failed", {
      host: smtpConfig.host,
      port: smtpConfig.port,
      emailUser: smtpConfig.user || null,
      error,
    });
  }
}

export async function sendOtpMail(email: string, otp: string) {
  assertMailEnv();

  console.log("Sending OTP email:", {
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
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
