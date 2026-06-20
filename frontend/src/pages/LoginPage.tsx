import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
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
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.message === "string") {
      if (
        response.data.message === "Dữ liệu không hợp lệ" &&
        typeof response.data.data === "string"
      ) {
        return response.data.data;
      }

      return response.data.message;
    }

    if (typeof response?.data?.data === "string") {
      return response.data.data;
    }
  }

  return fallback;
};

function getRedirectPath(role?: string) {
  const normalizedRole = role?.toUpperCase();

  if (normalizedRole === "ADMIN") return "/admin";
  if (normalizedRole === "BUSINESS") return "/business";

  return "/";
}

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");

    if (!email) {
      setError("Vui lòng nhập email");
      return;
    }

    if (!email.includes("@")) {
      setError("Định dạng email không hợp lệ");
      return;
    }

    if (!password) {
      setError("Vui lòng nhập mật khẩu");
      return;
    }

    try {
      setLoading(true);

      const { user } = await authService.login({
        email,
        password,
      });

      toast.success("Đăng nhập thành công");
      navigate(getRedirectPath(user.role), { replace: true });
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Đăng nhập thất bại"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      badge="Đăng nhập"
      title="Chào mừng trở lại"
      subtitle="Tiếp tục đặt xe, quản lý lịch trình và theo dõi booking của bạn trên BQDrive."
    >
      <form onSubmit={handleLogin} className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-white">
            Email
          </span>
          <span className={inputShellClass}>
            <Mail size={20} className="shrink-0 text-secondary" />
            <input
              type="email"
              placeholder="name@gmail.com"
              autoComplete="email"
              className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-white">
            Mật khẩu
          </span>
          <span className={inputShellClass}>
            <LockKeyhole size={20} className="shrink-0 text-secondary" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Nhập mật khẩu"
              autoComplete="current-password"
              className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm font-semibold text-white/[0.65]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-secondary"
            />
            Ghi nhớ đăng nhập
          </label>

          <button
            type="button"
            className="w-fit text-sm font-extrabold text-secondary transition hover:text-secondaryLight"
          >
            Quên mật khẩu?
          </button>
        </div>

        <button
          disabled={loading}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary shadow-lg shadow-yellow-500/20 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Loader2 size={20} className="animate-spin" />}
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm text-white/50">
          <div className="h-px bg-white/10" />
          <span>Hoặc đăng nhập với</span>
          <div className="h-px bg-white/10" />
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-white p-2">
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              try {
                if (!credentialResponse.credential) {
                  setError("Không nhận được Google credential");
                  return;
                }

                const { user } = await authService.googleLogin({
                  credential: credentialResponse.credential,
                });

                toast.success("Đăng nhập Google thành công");
                navigate(getRedirectPath(user.role), { replace: true });
              } catch (error: unknown) {
                setError(getErrorMessage(error, "Đăng nhập Google thất bại"));
              }
            }}
            onError={() => {
              setError("Đăng nhập Google thất bại");
            }}
          />
        </div>

        <p className="text-center text-sm font-semibold text-white/[0.62]">
          Chưa có tài khoản?{" "}
          <Link
            to="/register"
            className="font-extrabold text-secondary transition hover:text-secondaryLight"
          >
            Đăng ký ngay
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
