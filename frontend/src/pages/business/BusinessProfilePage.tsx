import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
import { Building2, Loader2, Mail, MapPin, Phone, Save } from "lucide-react";

import {
  businessService,
  type BusinessProfile,
} from "../../services/business.service";
import { getBusinessTypeLabel } from "../../utils/display.util";

type ProfileForm = {
  businessName: string;
  phone: string;
  address: string;
  description: string;
};

const emptyForm: ProfileForm = {
  businessName: "",
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

export default function BusinessProfilePage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    businessService
      .getProfile()
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setForm({
          businessName: data.businessName || "",
          phone: data.phone || data.userId?.phone || "",
          address: data.address || "",
          description: data.description || "",
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const businessName = form.businessName.trim();
    const phone = form.phone.trim();
    const address = form.address.trim();

    if (!businessName || !phone || !address) {
      toast.error("Vui lòng nhập tên doanh nghiệp, số điện thoại và địa chỉ");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await businessService.updateProfile({
        businessName,
        phone,
        address,
        description: form.description.trim(),
      });
      setProfile(updated);
      toast.success("Đã cập nhật thông tin doanh nghiệp");
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
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-secondary">
                <Building2 size={28} />
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
                    {profile?.userId?.email || "--"}
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
                    {profile?.phone || profile?.userId?.phone || "--"}
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
                    {profile?.address || "--"}
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
                  placeholder="Địa chỉ doanh nghiệp"
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
        </section>
      )}
    </div>
  );
}
