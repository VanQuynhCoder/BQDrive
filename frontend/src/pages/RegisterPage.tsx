import { useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  Phone,
  Send,
  UserRound,
} from "lucide-react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";

import AuthLayout from "../layouts/AuthLayout";
import { authService } from "../services/auth.service";

const inputShellClass =
  "flex min-h-11 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 transition focus-within:border-secondary focus-within:bg-white/[0.07] focus-within:ring-4 focus-within:ring-secondary/10";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown } } }
    ).response;

    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  return fallback;
};

export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    otp: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSendOtp = async () => {
    if (!form.email) {
      toast.error("Vui lòng nhập email");
      return;
    }

    try {
      setSendingOtp(true);

      await authService.sendOtp({
        email: form.email,
      });

      toast.success("OTP đã được gửi tới email");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Gửi OTP thất bại"));
    } finally {
      setSendingOtp(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.password) {
      toast.error("Vui lòng nhập đầy đủ thông tin");
      return;
    }

    if (!form.otp) {
      toast.error("Vui lòng nhập OTP");
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }

    if (!agree) {
      toast.error("Vui lòng đồng ý điều khoản dịch vụ");
      return;
    }

    try {
      setLoading(true);

      await authService.verifyOtp({
        email: form.email,
        otp: form.otp,
      });

      await authService.register({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });

      toast.success("Đăng ký thành công");
      navigate("/login");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Đăng ký thất bại"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      badge="Tạo tài khoản"
      title="Tham gia BQDrive"
      subtitle="Tạo tài khoản để đặt xe nhanh hơn và quản lý mọi chuyến đi tại một nơi."
    >
      <form onSubmit={handleRegister} className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-white">
            Họ tên
          </span>
          <span className={inputShellClass}>
            <UserRound size={20} className="shrink-0 text-secondary" />
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Nguyễn Văn A"
              autoComplete="name"
              className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-white">
            Email
          </span>
          <span className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_138px]">
            <span className={inputShellClass}>
              <Mail size={20} className="shrink-0 text-secondary" />
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="example@gmail.com"
                autoComplete="email"
                className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
              />
            </span>

            <button
              type="button"
              onClick={handleSendOtp}
              disabled={sendingOtp}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-4 font-extrabold text-white transition hover:bg-white/[0.15] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingOtp ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
              {sendingOtp ? "Đang gửi" : "Gửi OTP"}
            </button>
          </span>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-white">
              Mã OTP
            </span>
            <span className={inputShellClass}>
              <BadgeCheck size={20} className="shrink-0 text-secondary" />
              <input
                name="otp"
                value={form.otp}
                onChange={handleChange}
                placeholder="Nhập mã OTP"
                inputMode="numeric"
                className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-white">
              Số điện thoại
            </span>
            <span className={inputShellClass}>
              <Phone size={20} className="shrink-0 text-secondary" />
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="0901234567"
                autoComplete="tel"
                inputMode="tel"
                className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
              />
            </span>
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-white">
            Mật khẩu
          </span>
          <span className={inputShellClass}>
            <LockKeyhole size={20} className="shrink-0 text-secondary" />
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={handleChange}
              placeholder="Nhập mật khẩu"
              autoComplete="new-password"
              className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-secondary"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-white">
            Xác nhận mật khẩu
          </span>
          <span className={inputShellClass}>
            <CheckCircle2 size={20} className="shrink-0 text-secondary" />
            <input
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Nhập lại mật khẩu"
              autoComplete="new-password"
              className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((value) => !value)}
              aria-label={
                showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
              }
              title={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-secondary"
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/[0.68]">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-secondary"
          />

          <span>
            Tôi đồng ý với{" "}
            <span className="font-extrabold text-secondary">
              Điều khoản dịch vụ
            </span>{" "}
            và{" "}
            <span className="font-extrabold text-secondary">
              Chính sách bảo mật
            </span>
            .
          </span>
        </label>

        <button
          disabled={loading}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary shadow-lg shadow-yellow-500/20 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Loader2 size={20} className="animate-spin" />}
          {loading ? "Đang đăng ký..." : "Tạo tài khoản"}
        </button>

        <p className="text-center text-sm font-semibold text-white/[0.62]">
          Bạn đã có tài khoản?{" "}
          <Link
            to="/login"
            className="font-extrabold text-secondary transition hover:text-secondaryLight"
          >
            Đăng nhập ngay
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
