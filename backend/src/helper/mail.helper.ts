import dns from "dns";
import net from "net";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const SMTP_DEFAULT_HOST = "smtp.gmail.com";
const SMTP_DEFAULT_PORT = 587;
const CONNECTION_TIMEOUT_MS = 30_000;
const GREETING_TIMEOUT_MS = 15_000;
const SOCKET_TIMEOUT_MS = 30_000;
const SMTP_ADDRESS_FAMILY = 4;
const smtpAddressFamilyLabel = `IPv${SMTP_ADDRESS_FAMILY}`;

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
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  return {
    host,
    port,
    user,
    pass,
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
  const secure = port === 465;

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
  let lastError: unknown = null;

  try {
    assertMailEnv();
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

  for (const port of getSmtpPortCandidates()) {
    try {
      const transporter = await createSmtpTransporter(port);

      await transporter.sendMail({
        from: `"BQDrive" <${smtpConfig.user}>`,
        to: email,
        subject: "BQDrive - Ma xac thuc OTP",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>BQDrive</h2>
            <p>Ma OTP xac thuc tai khoan cua ban la:</p>
            <h1 style="letter-spacing: 4px;">${otp}</h1>
            <p>Ma nay co hieu luc trong 5 phut.</p>
            <p>Neu ban khong yeu cau dang ky, vui long bo qua email nay.</p>
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
