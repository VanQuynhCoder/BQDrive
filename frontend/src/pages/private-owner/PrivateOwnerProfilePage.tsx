import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
import { Loader2, Mail, MapPin, Phone, Save, UserRound } from "lucide-react";

import { authService } from "../../services/auth.service";
import {
  privateOwnerService,
  type PrivateOwnerProfile,
} from "../../services/privateOwner.service";

type ProfileForm = {
  fullName: string;
  phone: string;
  address: string;
  description: string;
};

const emptyForm: ProfileForm = {
  fullName: "",
  phone: "",
  address: "",
  description: "",
};

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

export default function PrivateOwnerProfilePage() {
  const [profile, setProfile] = useState<PrivateOwnerProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    privateOwnerService
      .getProfile()
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setForm({
          fullName: data.businessName || data.userId?.name || "",
          phone: data.phone || data.userId?.phone || "",
          address: data.address || "",
          description: data.description || "",
        });
      })
      .catch((error) => {
        toast.error(getErrorMessage(error, "Không thể tải hồ sơ cá nhân"));
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    const address = form.address.trim();

    if (!fullName || !phone || !address) {
      toast.error("Vui lòng nhập họ tên, số điện thoại và địa chỉ");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await privateOwnerService.updateProfile({
        businessName: fullName,
        phone,
        address,
        description: form.description.trim(),
      });
      setProfile(updated);

      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        localStorage.setItem(
          "user",
          JSON.stringify({
            ...currentUser,
            name: updated.businessName,
            phone: updated.phone,
          }),
        );
      }

      toast.success("Đã cập nhật hồ sơ cá nhân");
    } catch (error) {
      toast.error(getErrorMessage(error, "Cập nhật hồ sơ thất bại"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">
          Hồ sơ chủ xe
        </p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">
          Hồ sơ cá nhân
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Cập nhật thông tin liên hệ dùng cho quá trình quản lý xe và booking
          trên BQDrive.
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
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-secondary">
                <UserRound size={28} />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-xl font-extrabold text-primary">
                  {profile?.businessName || profile?.userId?.name || "--"}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Chủ xe tư nhân
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <InfoBlock
                icon={Mail}
                label="Email"
                value={profile?.userId?.email || "--"}
              />
              <InfoBlock
                icon={Phone}
                label="Số điện thoại"
                value={profile?.phone || profile?.userId?.phone || "--"}
              />
              <InfoBlock
                icon={MapPin}
                label="Địa chỉ"
                value={profile?.address || "--"}
              />
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
              Email là tài khoản đăng nhập đã xác thực nên đang được khóa chỉnh
              sửa.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Họ tên *
                </span>
                <input
                  value={form.fullName}
                  onChange={(event) =>
                    updateForm("fullName", event.target.value)
                  }
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="Nguyễn Văn A"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Email
                </span>
                <input
                  value={profile?.userId?.email || ""}
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
                  onChange={(event) => updateForm("phone", event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="0901234567"
                  inputMode="tel"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Địa chỉ *
                </span>
                <input
                  value={form.address}
                  onChange={(event) => updateForm("address", event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="Địa chỉ liên hệ"
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
                  placeholder="Giới thiệu ngắn về kinh nghiệm cho thuê xe hoặc khu vực hoạt động"
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
        </section>
      )}
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
      <Icon size={19} className="mt-0.5 text-secondary" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <p className="truncate font-extrabold text-primary">{value}</p>
      </div>
    </div>
  );
}
