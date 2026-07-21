import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
import {
  CalendarDays,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  ImagePlus,
  Phone,
  Save,
  ShieldCheck,
  Star,
  UserCircle,
} from "lucide-react";

import Header from "../../components/Header";
import Footer from "../../components/Footer";
import {
  authService,
  type CurrentUserProfile,
} from "../../services/auth.service";
import { formatVietnamDateTime } from "../../utils/date.util";
import { isValidVietnamPhone, normalizePhone } from "../../utils/validators";

type ProfileForm = {
  name: string;
  phone: string;
  address: string;
  city: string;
  district: string;
  ward: string;
  avatar: string;
  bio: string;
};

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const emptyProfileForm: ProfileForm = {
  name: "",
  phone: "",
  address: "",
  city: "",
  district: "",
  ward: "",
  avatar: "",
  bio: "",
};

const emptyPasswordForm: PasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};
const maxAvatarImageSize = 1024 * 1024;

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Invalid image result"));
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") return response.data.message;
  }

  return fallback;
}

function validateNewPassword(password: string, confirmPassword: string) {
  if (password.length < 8) {
    return "Mật khẩu mới cần ít nhất 8 ký tự.";
  }

  if (/\s/.test(password)) {
    return "Mật khẩu mới không được chứa khoảng trắng.";
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return "Mật khẩu mới cần có chữ hoa, chữ thường và số.";
  }

  if (password !== confirmPassword) {
    return "Nhập lại mật khẩu mới không khớp.";
  }

  return "";
}

function formatDate(value?: string) {
  if (!value) return "--";

  return formatVietnamDateTime(value, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function UserProfilePage() {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyProfileForm);
  const [passwordForm, setPasswordForm] =
    useState<PasswordForm>(emptyPasswordForm);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let active = true;

    authService
      .getProfile()
      .then(({ user }) => {
        if (!active) return;
        setProfile(user);
        setForm({
          name: user.name || "",
          phone: user.phone || "",
          address: user.address || "",
          city: user.city || user.province || "",
          district: user.district || "",
          ward: user.ward || "",
          avatar: user.avatar || "",
          bio: user.bio || "",
        });
      })
      .catch(() => toast.error("Không thể tải hồ sơ của bạn"))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const updateForm = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updatePasswordForm = (field: keyof PasswordForm, value: string) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const handleAvatarChange = async (file?: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file hình ảnh.");
      return;
    }

    if (file.size > maxAvatarImageSize) {
      toast.error("Ảnh đại diện không được vượt quá 1MB.");
      return;
    }

    try {
      const image = await readImageAsDataUrl(file);
      updateForm("avatar", image);
    } catch {
      toast.error("Không thể đọc ảnh đã chọn.");
    }
  };

  const handleUpdateProfile = async (event: FormEvent) => {
    event.preventDefault();

    const name = form.name.trim();
    const phone = normalizePhone(form.phone);

    if (!name) {
      toast.error("Vui lòng nhập họ tên");
      return;
    }

    if (phone && !isValidVietnamPhone(phone)) {
      toast.error("Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0.");
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await authService.updateUserProfile({
        name,
        phone,
        address: form.address.trim(),
        city: form.city.trim(),
        province: form.city.trim(),
        district: form.district.trim(),
        ward: form.ward.trim(),
        avatar: form.avatar.trim(),
        bio: form.bio.trim(),
      });
      setProfile(updated);
      toast.success("Đã cập nhật hồ sơ");
    } catch (error) {
      toast.error(getErrorMessage(error, "Cập nhật hồ sơ thất bại"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();

    if (!passwordForm.currentPassword) {
      toast.error("Vui lòng nhập mật khẩu hiện tại");
      return;
    }

    const passwordError = validateNewPassword(
      passwordForm.newPassword,
      passwordForm.confirmPassword,
    );

    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    setSavingPassword(true);
    try {
      await authService.changePassword(passwordForm);
      setPasswordForm(emptyPasswordForm);
      toast.success("Đổi mật khẩu thành công");
    } catch (error) {
      toast.error(getErrorMessage(error, "Đổi mật khẩu thất bại"));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
        <section className="mb-8 rounded-2xl bg-primary p-6 text-white md:p-8">
          <p className="text-sm font-extrabold uppercase text-secondary">
            Tài khoản
          </p>
          <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">
            Hồ sơ của tôi
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/70 md:text-base">
            Quản lý thông tin cá nhân, địa chỉ liên hệ và mật khẩu đăng nhập BQDrive.
          </p>
        </section>

        {loading ? (
          <section className="flex min-h-80 items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <Loader2 size={30} className="animate-spin text-secondary" />
          </section>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <aside className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-secondary">
                    {profile?.avatar ? (
                      <img
                        src={profile.avatar}
                        alt={profile.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <UserCircle size={38} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-extrabold text-primary">
                      {profile?.name || "--"}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Người dùng BQDrive
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <InfoLine icon={Mail} label="Email" value={profile?.email} />
                  <InfoLine icon={Phone} label="Số điện thoại" value={profile?.phone} />
                  <InfoLine icon={MapPin} label="Địa chỉ" value={profile?.address} />
                  <InfoLine
                    icon={CalendarDays}
                    label="Ngày tạo tài khoản"
                    value={formatDate(profile?.createdAt)}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-secondarySoft p-3 text-secondary">
                    <Star size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-primary">
                      Đánh giá
                    </h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                      Chưa có đánh giá. Chức năng đánh giá sẽ hiển thị sau khi hoàn thành chuyến thuê.
                    </p>
                  </div>
                </div>
              </section>
            </aside>

            <section className="space-y-6">
              <form
                onSubmit={handleUpdateProfile}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h3 className="text-xl font-extrabold text-primary">
                  Cập nhật thông tin
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Email và role không thể chỉnh sửa tại đây.
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <TextInput
                    label="Họ tên *"
                    value={form.name}
                    onChange={(value) => updateForm("name", value)}
                    placeholder="Tên hiển thị"
                  />
                  <TextInput
                    label="Số điện thoại"
                    value={form.phone}
                    onChange={(value) => updateForm("phone", normalizePhone(value))}
                    placeholder="0901234567"
                    inputMode="tel"
                    maxLength={10}
                  />
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-extrabold text-slate-700">
                      Ảnh đại diện
                    </span>
                    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-secondary">
                        {form.avatar ? (
                          <img
                            src={form.avatar}
                            alt="Ảnh đại diện"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <UserCircle size={34} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-primary">
                          Chọn ảnh từ máy của bạn
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          Hỗ trợ JPG/PNG/WebP, dung lượng tối đa 1MB.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-secondary transition hover:bg-primaryDark">
                            <ImagePlus size={16} />
                            Chọn ảnh
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) => {
                                void handleAvatarChange(event.target.files?.[0]);
                                event.target.value = "";
                              }}
                            />
                          </label>
                          {form.avatar && (
                            <button
                              type="button"
                              onClick={() => updateForm("avatar", "")}
                              className="min-h-10 rounded-xl bg-slate-200 px-4 text-sm font-extrabold text-primary transition hover:bg-slate-300"
                            >
                              Xóa ảnh
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </label>
                  <TextInput
                    label="Địa chỉ chi tiết"
                    value={form.address}
                    onChange={(value) => updateForm("address", value)}
                    placeholder="Số nhà, tên đường"
                    className="sm:col-span-2"
                  />
                  <TextInput
                    label="Tỉnh/Thành phố"
                    value={form.city}
                    onChange={(value) => updateForm("city", value)}
                    placeholder="TP. Hồ Chí Minh"
                  />
                  <TextInput
                    label="Quận/Huyện"
                    value={form.district}
                    onChange={(value) => updateForm("district", value)}
                    placeholder="Quận 1"
                  />
                  <TextInput
                    label="Phường/Xã"
                    value={form.ward}
                    onChange={(value) => updateForm("ward", value)}
                    placeholder="Phường Bến Nghé"
                    className="sm:col-span-2"
                  />
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-extrabold text-slate-700">
                      Giới thiệu ngắn
                    </span>
                    <textarea
                      value={form.bio}
                      onChange={(event) => updateForm("bio", event.target.value)}
                      rows={4}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                      placeholder="Một vài dòng giới thiệu để chuẩn bị cho phần đánh giá sau này"
                    />
                  </label>
                </div>

                <div className="mt-5 flex justify-end border-t border-slate-200 pt-5">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-2 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingProfile ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Save size={18} />
                    )}
                    {savingProfile ? "Đang lưu..." : "Lưu thay đổi"}
                  </button>
                </div>
              </form>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary p-3 text-secondary">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-primary">
                      Đổi mật khẩu
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Mật khẩu mới cần ít nhất 8 ký tự, có chữ hoa, chữ thường và số.
                    </p>
                  </div>
                </div>

                {!profile?.hasLocalPassword ? (
                  <div className="mt-5 rounded-xl border border-secondary/40 bg-secondarySoft px-4 py-3 text-sm font-bold leading-6 text-primary">
                    Tài khoản này đăng nhập bằng Google nên không sử dụng mật khẩu cục bộ.
                    Bạn có thể tiếp tục đăng nhập bằng Google.
                  </div>
                ) : (
                  <form onSubmit={handleChangePassword}>
                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      <PasswordInput
                        label="Mật khẩu hiện tại"
                        value={passwordForm.currentPassword}
                        onChange={(value) => updatePasswordForm("currentPassword", value)}
                      />
                      <PasswordInput
                        label="Mật khẩu mới"
                        value={passwordForm.newPassword}
                        onChange={(value) => updatePasswordForm("newPassword", value)}
                      />
                      <PasswordInput
                        label="Nhập lại mật khẩu mới"
                        value={passwordForm.confirmPassword}
                        onChange={(value) => updatePasswordForm("confirmPassword", value)}
                      />
                    </div>

                    <div className="mt-5 flex justify-end border-t border-slate-200 pt-5">
                      <button
                        type="submit"
                        disabled={savingPassword}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 font-extrabold text-secondary transition hover:bg-primaryDark disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingPassword ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <KeyRound size={18} />
                        )}
                        {savingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </section>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
      <Icon size={19} className="mt-0.5 shrink-0 text-secondary" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <p className="mt-1 break-words font-extrabold text-primary">
          {value || "--"}
        </p>
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  className = "",
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputMode?: "text" | "tel";
  maxLength?: number;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-extrabold text-slate-700">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
      />
    </label>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold text-slate-700">
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
        autoComplete="new-password"
      />
    </label>
  );
}
