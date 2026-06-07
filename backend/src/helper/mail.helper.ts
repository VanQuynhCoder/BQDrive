import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendOtpMail(email: string, otp: string) {
  await transporter.sendMail({
    from: `"BQDrive" <${process.env.EMAIL_USER}>`,
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
}