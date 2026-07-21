import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
import {
  Building2,
  ImagePlus,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
} from "lucide-react";

import {
  businessService,
  type BusinessProfile,
} from "../../services/business.service";
import { authService } from "../../services/auth.service";
import { formatFullAddress } from "../../utils/address.util";
import { getBusinessTypeLabel } from "../../utils/display.util";
import { isValidVietnamPhone, normalizePhone } from "../../utils/validators";
import { BUSINESS_PROFILE_UPDATED_EVENT } from "../../layouts/BusinessLayout";

type ProfileForm = {
  businessName: string;
  phone: string;
  address: string;
  city: string;
  district?: string;
  ward?: string;
  description: string;
  logo: string;
};

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const emptyForm: ProfileForm = {
  businessName: "",
  phone: "",
  address: "",
  city: "",
  district: "",
  ward: "",
  description: "",
  logo: "",
};

const emptyPasswordForm: PasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};
const maxLogoImageSize = 1024 * 1024;

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
    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  return fallback;
}

function validateNewPassword(password: string, confirmPassword: string) {
  if (password.length < 8) return "Mật khẩu mới cần ít nhất 8 ký tự.";
  if (/\s/.test(password)) return "Mật khẩu mới không được chứa khoảng trắng.";
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return "Mật khẩu mới cần có chữ hoa, chữ thường và số.";
  }
  if (password !== confirmPassword) return "Nhập lại mật khẩu mới không khớp.";
  return "";
}

export default function BusinessProfilePage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [passwordForm, setPasswordForm] =
    useState<PasswordForm>(emptyPasswordForm);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    let active = true;

    businessService
      .getProfile()
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setForm({
          businessName: data.businessName || "",
          phone: data.phone || data.userId.phone || "",
          address: data.address || "",
          city: data.city || data.province || "",
          district: data.district || "",
          ward: data.ward || "",
          description: data.description || "",
          logo: data.logo || "",
        });
      })
      .catch(() => {
        toast.error("Không thể tải hồ sơ doanh nghiệp");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const updateForm = (field: keyof ProfileForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updatePasswordForm = (field: keyof PasswordForm, value: string) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoChange = async (file?: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file hình ảnh.");
      return;
    }

    if (file.size > maxLogoImageSize) {
      toast.error("Logo không được vượt quá 1MB.");
      return;
    }

    try {
      const image = await readImageAsDataUrl(file);
      updateForm("logo", image);
    } catch {
      toast.error("Không thể đọc ảnh đã chọn.");
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event?.preventDefault();

    const businessName = form.businessName.trim();
    const phone = normalizePhone(form.phone);
    const address = form.address.trim();
    const city = form.city.trim();

    if (!businessName || !phone || !address) {
      toast.error("Vui lòng nhập tên doanh nghiệp, số điện thoại và địa chỉ");
      return;
    }

    if (!isValidVietnamPhone(phone)) {
      toast.error("Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await businessService.updateProfile({
        businessName,
        phone,
        address,
        city,
        province: city,
        district: (form.district || "").trim(),
        ward: (form.ward || "").trim(),
        description: form.description.trim(),
        logo: form.logo,
      });
      setProfile(updated);
      window.dispatchEvent(
        new CustomEvent(BUSINESS_PROFILE_UPDATED_EVENT, { detail: updated }),
      );
      toast.success("Đã cập nhật thông tin doanh nghiệp");
    } catch (error) {
      toast.error(getErrorMessage(error, "Cập nhật hồ sơ thất bại"));
    } finally {
      setSubmitting(false);
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

    setChangingPassword(true);
    try {
      await authService.changePassword(passwordForm);
      setPasswordForm(emptyPasswordForm);
      toast.success("Đổi mật khẩu thành công");
    } catch (error) {
      toast.error(getErrorMessage(error, "Đổi mật khẩu thất bại"));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">
          Hồ sơ doanh nghiệp
        </p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">
          Thông tin doanh nghiệp
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Cập nhật thông tin hiển thị và thông tin liên hệ của doanh nghiệp.
        </p>
      </section>

      {loading ? (
        <section className="flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <Loader2 size={28} className="animate-spin text-secondary" />
        </section>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-primary text-secondary">
                {profile?.logo ? (
                  <img
                    src={profile.logo}
                    alt={profile.businessName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Building2 size={28} />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-xl font-extrabold text-primary">
                  {profile?.businessName || "--"}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {getBusinessTypeLabel(profile?.businessType)}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
                <Mail size={19} className="mt-0.5 text-secondary" />
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Email
                  </p>
                  <p className="truncate font-extrabold text-primary">
                    {profile?.userId.email || "--"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
                <Phone size={19} className="mt-0.5 text-secondary" />
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Số điện thoại
                  </p>
                  <p className="font-extrabold text-primary">
                    {profile?.phone || profile?.userId.phone || "--"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
                <MapPin size={19} className="mt-0.5 text-secondary" />
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Địa chỉ
                  </p>
                  <p className="font-extrabold text-primary">
                    {profile ? formatFullAddress(profile, "--") : "--"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h3 className="text-xl font-extrabold text-primary">
              Cập nhật hồ sơ
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Email là tài khoản đăng nhập đã xác thực nên đang được khóa chỉnh sửa.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Logo doanh nghiệp
                </span>
                <div className="flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-secondary">
                    {form.logo ? (
                      <img
                        src={form.logo}
                        alt="Logo doanh nghiệp"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Building2 size={32} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-primary">
                      Chọn logo từ máy của bạn
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                      Hỗ trợ JPG/PNG/WebP, dung lượng tối đa 1MB.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-extrabold text-secondary transition hover:bg-primaryDark">
                        <ImagePlus size={16} />
                        Chọn ảnh
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            void handleLogoChange(event.target.files?.[0]);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      {form.logo && (
                        <button
                          type="button"
                          onClick={() => updateForm("logo", "")}
                          className="min-h-10 rounded-lg bg-slate-200 px-4 text-sm font-extrabold text-primary transition hover:bg-slate-300"
                        >
                          Xóa ảnh
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Tên doanh nghiệp *
                </span>
                <input
                  value={form.businessName}
                  onChange={(event) =>
                    updateForm("businessName", event.target.value)
                  }
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="Tên doanh nghiệp"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Email
                </span>
                <input
                  value={profile?.userId.email || ""}
                  disabled
                  className="min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-500 outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Số điện thoại *
                </span>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    updateForm("phone", normalizePhone(event.target.value))
                  }
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="0901234567"
                  inputMode="tel"
                  type="tel"
                  maxLength={10}
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Địa chỉ chi tiết *
                </span>
                <input
                  value={form.address}
                  onChange={(event) => updateForm("address", event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="Địa chỉ doanh nghiệp"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Tỉnh/Thành phố
                </span>
                <input
                  value={form.city}
                  onChange={(event) => updateForm("city", event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="TP. Hồ Chí Minh"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Quận/Huyện
                </span>
                <input
                  value={form.district}
                  onChange={(event) => updateForm("district", event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="Quận 1"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Phường/Xã
                </span>
                <input
                  value={form.ward}
                  onChange={(event) => updateForm("ward", event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="Phường Bến Nghé"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Mô tả
                </span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="Giới thiệu ngắn về doanh nghiệp"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-200 pt-5">
              <button
                disabled={submitting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {submitting ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>

          <form
            onSubmit={handleChangePassword}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary p-3 text-secondary">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-primary">
                    Đổi mật khẩu
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
                    Tài khoản doanh nghiệp được cấp bởi quản trị viên. Vui lòng đổi mật khẩu sau lần đăng nhập đầu tiên để đảm bảo an toàn.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Mật khẩu hiện tại
                </span>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    updatePasswordForm("currentPassword", event.target.value)
                  }
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  autoComplete="current-password"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Mật khẩu mới
                </span>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    updatePasswordForm("newPassword", event.target.value)
                  }
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  autoComplete="new-password"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Nhập lại mật khẩu mới
                </span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    updatePasswordForm("confirmPassword", event.target.value)
                  }
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  autoComplete="new-password"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-200 pt-5">
              <button
                type="submit"
                disabled={changingPassword}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 font-extrabold text-secondary transition hover:bg-primaryDark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {changingPassword ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <KeyRound size={18} />
                )}
                {changingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}









