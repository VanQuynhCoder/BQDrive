import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
import {
  Building2,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  Unlock,
  UserPlus,
  X,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  adminService,
  type AdminBusiness,
  type CreateBusinessData,
} from "../../services/admin.service";
import { getBusinessTypeLabel } from "../../utils/display.util";
import { isValidVietnamPhone, normalizePhone } from "../../utils/validators";

type BusinessAction = "block" | "unblock" | "delete";
type CreateBusinessStep = 1 | 2 | 3;

type BusinessCreateForm = {
  businessName: string;
  email: string;
  phone: string;
  address: string;
  description: string;
  otp: string;
  password: string;
  confirmPassword: string;
};

const emptyCreateForm: BusinessCreateForm = {
  businessName: "",
  email: "",
  phone: "",
  address: "",
  description: "",
  otp: "",
  password: "",
  confirmPassword: "",
};

const createSteps: Array<{ step: CreateBusinessStep; label: string }> = [
  { step: 1, label: "Thông tin doanh nghiệp" },
  { step: 2, label: "OTP xác thực email" },
  { step: 3, label: "Tạo tài khoản" },
];

const inputClass =
  "min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-primary outline-none transition placeholder:text-slate-400 focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:bg-slate-50 disabled:text-slate-500";
const iconInputClass = `${inputClass} pl-11`;
const textareaClass =
  "w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-primary outline-none transition placeholder:text-slate-400 focus:border-secondary focus:ring-4 focus:ring-secondary/10";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2 font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary shadow-sm shadow-yellow-500/20 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60";

function getBusinessStatus(business: AdminBusiness) {
  if (!business.userId) {
    return { tone: "gray" as const, label: "Thiếu tài khoản" };
  }

  if (business.userId.isBlocked) {
    return { tone: "red" as const, label: "Đã khóa" };
  }

  if (business.isRejected) {
    return { tone: "red" as const, label: "B? từ chối" };
  }

  if (business.isApproved) {
    return { tone: "green" as const, label: "Đã duyệt" };
  }

  return { tone: "yellow" as const, label: "Chờ duyệt" };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.data === "string") {
      return response.data.data;
    }

    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  return fallback;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [action, setAction] = useState<{
    type: BusinessAction;
    business: AdminBusiness;
  } | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateBusinessStep>(1);
  const [createForm, setCreateForm] =
    useState<BusinessCreateForm>(emptyCreateForm);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [creatingBusiness, setCreatingBusiness] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const createBusy = sendingOtp || verifyingOtp || creatingBusiness;
  const progressPercent = ((createStep - 1) / (createSteps.length - 1)) * 100;

  const fetchBusinesses = async () => {
    setLoading(true);
    try {
      const data = await adminService.getBusinesses();
      setBusinesses(data);
    } catch {
      toast.error("Không thể tải danh sách doanh nghiệp");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    adminService
      .getBusinesses()
      .then((data) => {
        if (active) setBusinesses(data);
      })
      .catch(() => {
        toast.error("Không thể tải danh sách doanh nghiệp");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const resetCreateFlow = () => {
    setCreateForm({ ...emptyCreateForm });
    setCreateStep(1);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const openCreateModal = () => {
    resetCreateFlow();
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (createBusy) return;

    setCreateModalOpen(false);
    resetCreateFlow();
  };

  const updateCreateForm = (field: keyof BusinessCreateForm, value: string) => {
    setCreateForm((prev) => {
      const nextValue =
        field === "otp"
          ? value.replace(/\D/g, "").slice(0, 6)
          : field === "phone"
            ? normalizePhone(value)
            : value;

      return {
        ...prev,
        [field]: nextValue,
      };
    });
  };

  const validateBusinessInfo = () => {
    const businessName = createForm.businessName.trim();
    const email = createForm.email.trim().toLowerCase();
    const phone = normalizePhone(createForm.phone);
    const address = createForm.address.trim();

    if (!businessName || !email || !phone || !address) {
      toast.error("Vui lòng nhập đầy để thông tin bắt bước");
      return false;
    }

    if (!isValidEmail(email)) {
      toast.error("Email doanh nghiệp không hợp lệ");
      return false;
    }

    if (!isValidVietnamPhone(phone)) {
      toast.error("Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0.");
      return false;
    }

    setCreateForm((prev) => ({
      ...prev,
      businessName,
      email,
      phone,
      address,
      description: prev.description.trim(),
    }));

    return true;
  };

  const handleSendBusinessOtp = async (event?: FormEvent) => {
    event?.preventDefault();

    if (!validateBusinessInfo()) return;

    setSendingOtp(true);
    try {
      await adminService.sendBusinessOtp({
        email: createForm.email.trim().toLowerCase(),
      });
      toast.success("OTP đã được gửi tới email doanh nghiệp");
      setCreateStep(2);
      setCreateForm((prev) => ({ ...prev, otp: "" }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Gửi OTP thất bại"));
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyBusinessOtp = async (event: FormEvent) => {
    event?.preventDefault();

    const otp = createForm.otp.trim();

    if (!/^\d{6}$/.test(otp)) {
      toast.error("Vui lòng nhập mã OTP gồm 6 số");
      return;
    }

    setVerifyingOtp(true);
    try {
      await adminService.verifyBusinessOtp({
        email: createForm.email.trim().toLowerCase(),
        otp,
      });
      toast.success("Xác thực OTP thành công");
      setCreateStep(3);
    } catch (error) {
      toast.error(getErrorMessage(error, "Xác thực OTP thất bại"));
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleCreateBusiness = async (event: FormEvent) => {
    event?.preventDefault();

    if (!validateBusinessInfo()) return;

    if (createForm.password.length < 6) {
      toast.error("Một khẩu phải có ít nhất 6 ký từ");
      return;
    }

    if (createForm.password !== createForm.confirmPassword) {
      toast.error("Xác nhận mật khẩu không khớp");
      return;
    }

    const payload: CreateBusinessData = {
      businessName: createForm.businessName.trim(),
      email: createForm.email.trim().toLowerCase(),
      password: createForm.password,
      phone: createForm.phone.trim(),
      address: createForm.address.trim(),
      description: createForm.description.trim(),
    };

    setCreatingBusiness(true);
    try {
      await adminService.createBusiness(payload);
      toast.success("Tạo doanh nghiệp thành công");
      setCreateModalOpen(false);
      resetCreateFlow();
      await fetchBusinesses();
    } catch (error) {
      toast.error(getErrorMessage(error, "Tạo doanh nghiệp thất bại"));
    } finally {
      setCreatingBusiness(false);
    }
  };

  const openAction = (type: BusinessAction, business: AdminBusiness) => {
    setReason("");
    setAction({ type, business });
  };

  const closeAction = () => {
    setReason("");
    setAction(null);
  };

  const confirmAction = async () => {
    if (!action) return;

    if ((action?.type === "block" || action?.type === "delete") && !reason.trim()) {
      toast.error("Vui lòng nhập lý do");
      return;
    }

    setSubmitting(true);
    try {
      if (action?.type === "block") {
        await adminService.blockBusiness(action?.business._id, reason.trim());
        toast.success("Đã khóa doanh nghiệp và Ẩn xe liên quan");
      }

      if (action?.type === "unblock") {
        await adminService.unblockBusiness(action?.business._id);
        toast.success("Đã mở khóa doanh nghiệp");
      }

      if (action?.type === "delete") {
        await adminService.deleteBusiness(action?.business._id, reason.trim());
        toast.success("Đã xóa doanh nghiệp");
      }

      closeAction();
      await fetchBusinesses();
    } catch (error) {
      toast.error(getErrorMessage(error, "Thao tác thất bại"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-secondary">
            Quận trả đối tác
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary">
            Quản lý Doanh nghiệp
          </h2>
          <p className="mt-2 max-w-2xl text-slate-500">
            Khóa doanh nghiệp sẽ ẩn toàn bộ xe của doanh nghiệp khỏi hệ thống.
            Tạo mới doanh nghiệp cần xác thực email bằng OTP trước khi cập tài khoản.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 font-extrabold text-white shadow-sm transition hover:bg-primaryDark"
        >
          <Plus size={19} className="text-secondary" />
          Tạo doanh nghiệp
        </button>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Tên doanh nghiệp</th>
                <th className="px-5 py-4">Email</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Số lượng xe</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    Đang tải danh sách doanh nghiệp...
                  </td>
                </tr>
              )}

              {!loading &&
                businesses.map((business) => {
                  const status = getBusinessStatus(business);
                  const carCount =
                    business.totalCars || business.carCount || 0;

                  return (
                    <tr key={business._id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-secondary">
                            <Building2 size={20} />
                          </div>
                          <div>
                            <p className="font-extrabold text-primary">
                              {business.businessName}
                            </p>
                            <p className="text-xs font-semibold text-slate-500">
                              {getBusinessTypeLabel(business.businessType)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {business.userId?.email || "Tài khoản đã bị xóa"}
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge
                          tone={status.tone}
                          label={status.label}
                        />
                      </td>
                      <td className="px-5 py-4 font-bold text-primary">
                        {carCount}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {business.userId && (
                            business.userId.isBlocked ? (
                              <button
                                type="button"
                                onClick={() => openAction("unblock", business)}
                                className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 font-extrabold text-primary hover:bg-secondaryLight"
                              >
                                <Unlock size={16} />
                                Mở khóa
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openAction("block", business)}
                                className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-700 hover:bg-amber-100"
                              >
                                <Lock size={16} />
                                Khóa
                              </button>
                            )
                          )}

                          <button
                            type="button"
                            onClick={() => openAction("delete", business)}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-extrabold text-slate-800 hover:bg-slate-200"
                          >
                            <Trash2 size={16} />
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && businesses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    Không có doanh nghiệp phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {createModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-primary px-6 py-5 text-white">
              <div>
                <p className="text-sm font-bold uppercase text-secondary">
                  Tạo doanh nghiệp có OTP
                </p>
                <h3 className="mt-1 text-2xl font-extrabold">
                  Cấp tài khoản doanh nghiệp
                </h3>
              </div>

              <button
                type="button"
                onClick={closeCreateModal}
                disabled={createBusy}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Đóng modal"
                title="Đóng modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              <div className="relative mb-7">
                <div className="absolute left-0 right-0 top-5 h-1 rounded-full bg-slate-200" />
                <div
                  className="absolute left-0 top-5 h-1 rounded-full bg-secondary transition-all"
                  style={{ width: `${progressPercent}%` }}
                />

                <div className="relative grid grid-cols-3 gap-2">
                  {createSteps.map((item) => {
                    const active = createStep === item.step;
                    const completed = createStep > item.step;

                    return (
                      <div key={item.step} className="flex flex-col items-center gap-2">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-lg border-2 text-sm font-extrabold transition ${
                            completed
                              ? "border-secondary bg-secondary text-primary"
                              : active
                                ? "border-primary bg-primary text-white"
                                : "border-slate-200 bg-white text-slate-400"
                          }`}
                        >
                          {completed ? <Check size={18} /> : item.step}
                        </div>
                        <p
                          className={`text-center text-xs font-extrabold sm:text-sm ${
                            active || completed ? "text-primary" : "text-slate-400"
                          }`}
                        >
                          {item.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {createStep === 1 && (
                <form onSubmit={handleSendBusinessOtp} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Tên doanh nghiệp *
                      </span>
                      <span className="relative block">
                        <Building2
                          size={18}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
                        />
                        <input
                          value={createForm.businessName}
                          onChange={(event) =>
                            updateCreateForm("businessName", event.target.value)
                          }
                          className={iconInputClass}
                          placeholder="BQDrive Partner"
                          autoComplete="organization"
                        />
                      </span>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Email *
                      </span>
                      <span className="relative block">
                        <Mail
                          size={18}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
                        />
                        <input
                          type="email"
                          value={createForm.email}
                          onChange={(event) =>
                            updateCreateForm("email", event.target.value)
                          }
                          className={iconInputClass}
                          placeholder="business@gmail.com"
                          autoComplete="email"
                        />
                      </span>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Số điện thoại *
                      </span>
                      <span className="relative block">
                        <Phone
                          size={18}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
                        />
                        <input
                          value={createForm.phone}
                          onChange={(event) =>
                            updateCreateForm("phone", event.target.value)
                          }
                          className={iconInputClass}
                          placeholder="0901234567"
                          autoComplete="tel"
                          inputMode="tel"
                          type="tel"
                          maxLength={10}
                        />
                      </span>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Địa chỉ *
                      </span>
                      <span className="relative block">
                        <MapPin
                          size={18}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
                        />
                        <input
                          value={createForm.address}
                          onChange={(event) =>
                            updateCreateForm("address", event.target.value)
                          }
                          className={iconInputClass}
                          placeholder="Quận 1, TP. Hồ Chí Minh"
                          autoComplete="street-address"
                        />
                      </span>
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-slate-700">
                      Mô tả
                    </span>
                    <textarea
                      value={createForm.description}
                      onChange={(event) =>
                        updateCreateForm("description", event.target.value)
                      }
                      rows={4}
                      className={textareaClass}
                      placeholder="Mô tả ngắn về doanh nghiệp"
                    />
                  </label>

                  <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeCreateModal}
                      disabled={createBusy}
                      className={secondaryButtonClass}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={sendingOtp}
                      className={primaryButtonClass}
                    >
                      {sendingOtp ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Mail size={18} />
                      )}
                      {sendingOtp ? "Đang gửi..." : "Gửi OTP"}
                    </button>
                  </div>
                </form>
              )}

              {createStep === 2 && (
                <form onSubmit={handleVerifyBusinessOtp} className="space-y-5">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-secondary">
                        <ShieldCheck size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-primary">
                          {createForm.email}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Nhập mã OTP 6 số đã gửi tới email doanh nghiệp.
                        </p>
                      </div>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-slate-700">
                      Mã OTP *
                    </span>
                    <span className="relative block">
                      <KeyRound
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
                      />
                      <input
                        value={createForm.otp}
                        onChange={(event) =>
                          updateCreateForm("otp", event.target.value)
                        }
                        className={`${iconInputClass} text-center text-lg tracking-[0.45em]`}
                        placeholder="123456"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                      />
                    </span>
                  </label>

                  <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      onClick={() => setCreateStep(1)}
                      disabled={createBusy}
                      className={secondaryButtonClass}
                    >
                      Sửa thông tin
                    </button>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => void handleSendBusinessOtp()}
                        disabled={sendingOtp || verifyingOtp}
                        className={secondaryButtonClass}
                      >
                        {sendingOtp ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Mail size={18} />
                        )}
                        Gửi lại OTP
                      </button>
                      <button
                        type="submit"
                        disabled={verifyingOtp}
                        className={primaryButtonClass}
                      >
                        {verifyingOtp ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <ShieldCheck size={18} />
                        )}
                        {verifyingOtp ? "Đang xác thực..." : "Xác thực OTP"}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {createStep === 3 && (
                <form onSubmit={handleCreateBusiness} className="space-y-5">
                  <div className="rounded-lg border border-secondary/40 bg-secondarySoft p-4">
                    <div className="flex items-center gap-3 text-primary">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                        <Check size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold">
                          Email đã xác thực
                        </p>
                        <p className="truncate text-sm font-semibold">
                          {createForm.email}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Một khẩu *
                      </span>
                      <span className="relative block">
                        <KeyRound
                          size={18}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
                        />
                        <input
                          type={showPassword ? "text" : "password"}
                          value={createForm.password}
                          onChange={(event) =>
                            updateCreateForm("password", event.target.value)
                          }
                          className={`${iconInputClass} pr-12`}
                          placeholder="Nhợp mật khẩu"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-primary"
                          aria-label={
                            showPassword ? "Ẩn mật khẩu" : "HiẨn mật khẩu"
                          }
                          title={showPassword ? "Ẩn mật khẩu" : "HiẨn mật khẩu"}
                        >
                          {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </span>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Xác nhận mật khẩu *
                      </span>
                      <span className="relative block">
                        <KeyRound
                          size={18}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
                        />
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          value={createForm.confirmPassword}
                          onChange={(event) =>
                            updateCreateForm(
                              "confirmPassword",
                              event.target.value,
                            )
                          }
                          className={`${iconInputClass} pr-12`}
                          placeholder="Nhợp lệi mật khẩu"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword((value) => !value)
                          }
                          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-primary"
                          aria-label={
                            showConfirmPassword
                              ? "Ẩn mật khẩu"
                              : "HiẨn mật khẩu"
                          }
                          title={
                            showConfirmPassword
                              ? "Ẩn mật khẩu"
                              : "HiẨn mật khẩu"
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                        </button>
                      </span>
                    </label>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4 text-sm sm:grid-cols-2">
                      <div>
                        <p className="font-bold text-slate-500">Doanh nghiệp</p>
                        <p className="mt-1 font-extrabold text-primary">
                          {createForm.businessName}
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-500">Liên h?</p>
                        <p className="mt-1 font-extrabold text-primary">
                          {createForm.phone}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="font-bold text-slate-500">Địa chỉ</p>
                        <p className="mt-1 font-extrabold text-primary">
                          {createForm.address}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeCreateModal}
                      disabled={createBusy}
                      className={secondaryButtonClass}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={creatingBusiness}
                      className={primaryButtonClass}
                    >
                      {creatingBusiness ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <UserPlus size={18} />
                      )}
                      {creatingBusiness ? "Đang tạo..." : "Tạo doanh nghiệp"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <AdminModal
        open={!!action}
        title={
          action?.type === "block"
            ? "Khóa doanh nghiệp"
            : action?.type === "delete"
              ? "Xóa doanh nghiệp"
              : "Mở khóa doanh nghiệp"
        }
        description={
          action
            ? `${action?.business.businessName}${
                action?.type === "block"
                  ? " - toàn bộ xe của doanh nghiệp sẽ bị ẩn khỏi hệ thống."
                  : action?.type === "delete"
                    ? " - chỗ xóa khi không còn booking chờ xác nhận hoặc đã xác nhận."
                    : ""
              }`
            : undefined
        }
        confirmText={
          action?.type === "unblock"
            ? "Mở khóa"
            : action?.type === "delete"
              ? "Xóa doanh nghiệp"
              : "Khóa doanh nghiệp"
        }
        danger={action?.type === "delete"}
        loading={submitting}
        onClose={closeAction}
        onConfirm={confirmAction}
      >
        {action?.type !== "unblock" && (
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Lý do
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-secondary"
              placeholder="Nhợp lý do thao tác..."
            />
          </label>
        )}
      </AdminModal>
    </div>
  );
}











