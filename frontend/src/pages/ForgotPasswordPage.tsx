import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";

import AuthLayout from "../layouts/AuthLayout";
import { authService } from "../services/auth.service";

type Step = "EMAIL" | "OTP" | "PASSWORD";

const inputShellClass =
  "flex min-h-11 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 transition focus-within:border-secondary focus-within:bg-white/[0.07] focus-within:ring-4 focus-within:ring-secondary/10";

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (
      response?.data?.message === "Dữ liệu không hợp lệ" &&
      typeof response.data.data === "string"
    ) {
      return response.data.data;
    }

    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }

    if (typeof response?.data?.data === "string") {
      return response.data.data;
    }
  }

  return fallback;
}

function getPasswordStrengthError(password: string) {
  if (password.length < 8) {
    return "Mật khẩu mới cần ít nhất 8 ký tự";
  }

  if (/\s/.test(password)) {
    return "Mật khẩu mới không được chứa khoảng trắng";
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return "Mật khẩu mới cần có chữ hoa, chữ thường và số";
  }

  return "";
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("EMAIL");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setResendSeconds((value) => Math.max(value - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const validateEmail = () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Vui lòng nhập email");
      return "";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Email không hợp lệ");
      return "";
    }

    return normalizedEmail;
  };

  const handleSendOtp = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setError("");
    setSuccessMessage("");

    const normalizedEmail = validateEmail();
    if (!normalizedEmail) return;

    try {
      setLoading(true);
      await authService.forgotPassword(normalizedEmail);
      setEmail(normalizedEmail);
      setStep("OTP");
      setResendSeconds(60);
      setSuccessMessage("Mã xác thực đã được gửi đến email của bạn.");
      toast.success("Đã gửi mã xác thực");
    } catch (error: unknown) {
      setError(
        getErrorMessage(
          error,
          "Không thể gửi mã xác thực, vui lòng thử lại sau.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Vui lòng nhập OTP gồm 6 chữ số");
      return;
    }

    try {
      setLoading(true);
      const response = await authService.verifyResetOtp(email, otp.trim());
      setResetToken(response?.data?.resetToken || "");
      setStep("PASSWORD");
      setSuccessMessage("OTP hợp lệ. Vui lòng đặt mật khẩu mới.");
    } catch (error: unknown) {
      setError(getErrorMessage(error, "OTP không hợp lệ hoặc đã hết hạn."));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    const passwordError = getPasswordStrengthError(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Xác nhận mật khẩu không khớp");
      return;
    }

    try {
      setLoading(true);
      await authService.resetPassword({
        email,
        resetToken,
        newPassword,
        confirmPassword,
      });
      toast.success("Đổi mật khẩu thành công");
      navigate("/login", { replace: true });
    } catch (error: unknown) {
      setError(
        getErrorMessage(
          error,
          "Không thể đổi mật khẩu. Vui lòng xác thực OTP lại.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      badge="Khôi phục tài khoản"
      title="Đặt lại mật khẩu"
      subtitle="Nhập email để nhận mã xác thực, sau đó tạo mật khẩu mới cho tài khoản BQDrive."
    >
      <div className="mb-6 grid grid-cols-3 gap-2">
        {[
          { key: "EMAIL", label: "Email" },
          { key: "OTP", label: "OTP" },
          { key: "PASSWORD", label: "Mật khẩu" },
        ].map((item, index) => {
          const activeIndex = ["EMAIL", "OTP", "PASSWORD"].indexOf(step);
          const isActive = item.key === step;
          const isDone = index < activeIndex;

          return (
            <div
              key={item.key}
              className={`rounded-lg border px-3 py-2 text-center text-xs font-extrabold ${
                isActive || isDone
                  ? "border-secondary bg-secondary text-primary"
                  : "border-white/10 bg-white/[0.04] text-white/50"
              }`}
            >
              {item.label}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-secondary/30 bg-secondary/10 px-4 py-3 text-sm font-semibold text-secondary">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <p>{successMessage}</p>
        </div>
      )}

      {step === "EMAIL" && (
        <form onSubmit={handleSendOtp} className="space-y-5">
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
                onChange={(event) => setEmail(event.target.value)}
              />
            </span>
          </label>

          <button
            disabled={loading}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary shadow-lg shadow-yellow-500/20 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 size={20} className="animate-spin" />}
            {loading ? "Đang gửi mã..." : "Gửi mã xác thực"}
          </button>
        </form>
      )}

      {step === "OTP" && (
        <form onSubmit={handleVerifyOtp} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-white">
              Mã OTP
            </span>
            <span className={inputShellClass}>
              <ShieldCheck size={20} className="shrink-0 text-secondary" />
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Nhập 6 chữ số"
                className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </span>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={loading || resendSeconds > 0}
              onClick={() => handleSendOtp()}
              className="flex min-h-12 flex-1 items-center justify-center rounded-lg border border-white/10 px-5 py-3 font-extrabold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resendSeconds > 0
                ? `Gửi lại sau ${resendSeconds}s`
                : "Gửi lại mã"}
            </button>

            <button
              disabled={loading}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary shadow-lg shadow-yellow-500/20 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 size={20} className="animate-spin" />}
              Xác thực OTP
            </button>
          </div>
        </form>
      )}

      {step === "PASSWORD" && (
        <form onSubmit={handleResetPassword} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-white">
              Mật khẩu mới
            </span>
            <span className={inputShellClass}>
              <KeyRound size={20} className="shrink-0 text-secondary" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Ít nhất 8 ký tự"
                autoComplete="new-password"
                className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
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
              Nhập lại mật khẩu mới
            </span>
            <span className={inputShellClass}>
              <KeyRound size={20} className="shrink-0 text-secondary" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Nhập lại mật khẩu"
                autoComplete="new-password"
                className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/[0.35]"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
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

          <button
            disabled={loading || !resetToken}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary shadow-lg shadow-yellow-500/20 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 size={20} className="animate-spin" />}
            Đổi mật khẩu
          </button>
        </form>
      )}

      <Link
        to="/login"
        className="mt-6 inline-flex items-center gap-2 text-sm font-extrabold text-secondary transition hover:text-secondaryLight"
      >
        <ArrowLeft size={17} />
        Quay lại đăng nhập
      </Link>
    </AuthLayout>
  );
}
