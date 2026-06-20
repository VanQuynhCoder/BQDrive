import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import toast from "react-hot-toast";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCheck2,
  Loader2,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";

import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { authService } from "../../services/auth.service";
import {
  privateOwnerRequestService,
  type CreatePrivateOwnerRequestData,
  type PrivateOwnerRequest,
  type PrivateOwnerRequestStatus,
} from "../../services/privateOwnerRequest.service";

type PrivateOwnerForm = {
  fullName: string;
  phone: string;
  identityNumber: string;
  frontImage: string;
  backImage: string;
  address: string;
  reason: string;
};

type CurrentUser = {
  name?: string;
  phone?: string;
};

const maxIdentityImageSize = 1024 * 1024;

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

function getStatusView(status: PrivateOwnerRequestStatus) {
  const map = {
    PENDING: {
      label: "Chờ duyệt",
      message: "Hồ sơ đang được Admin xem xét.",
      badgeClass: "bg-yellow-100 text-yellow-800 ring-yellow-200",
      iconClass: "bg-yellow-100 text-yellow-700",
      icon: Clock,
    },
    APPROVED: {
      label: "Đã duyệt",
      message: "Bạn đã được cấp quyền Chủ xe tư nhân.",
      badgeClass: "bg-emerald-100 text-emerald-800 ring-emerald-200",
      iconClass: "bg-emerald-100 text-emerald-700",
      icon: CheckCircle2,
    },
    REJECTED: {
      label: "Từ chối",
      message: "Hồ sơ đã bị từ chối.",
      badgeClass: "bg-red-100 text-red-800 ring-red-200",
      iconClass: "bg-red-100 text-red-700",
      icon: XCircle,
    },
  } satisfies Record<
    PrivateOwnerRequestStatus,
    {
      label: string;
      message: string;
      badgeClass: string;
      iconClass: string;
      icon: typeof Clock;
    }
  >;

  return map[status];
}

function createInitialForm(): PrivateOwnerForm {
  const user = authService.getCurrentUser() as CurrentUser | null;

  return {
    fullName: user?.name || "",
    phone: user?.phone || "",
    identityNumber: "",
    frontImage: "",
    backImage: "",
    address: "",
    reason: "",
  };
}

export default function BecomePrivateOwnerPage() {
  const [form, setForm] = useState<PrivateOwnerForm>(() => createInitialForm());
  const [myRequests, setMyRequests] = useState<PrivateOwnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const latestRequest = useMemo(() => myRequests[0] || null, [myRequests]);
  const canSubmit =
    !latestRequest ||
    latestRequest.status === "REJECTED";

  const fetchMyRequest = async () => {
    setLoading(true);
    try {
      const requests = await privateOwnerRequestService.getMyRequest();
      setMyRequests(requests);
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể tải hồ sơ của bạn"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    privateOwnerRequestService
      .getMyRequest()
      .then((requests) => {
        if (active) setMyRequests(requests);
      })
      .catch((error) => {
        toast.error(getErrorMessage(error, "Không thể tải hồ sơ của bạn"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const updateForm = (field: keyof PrivateOwnerForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
    field: "frontImage" | "backImage",
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chỉ chọn file ảnh");
      return;
    }

    if (file.size > maxIdentityImageSize) {
      toast.error("Ảnh CCCD nên nhỏ hơn 1MB");
      return;
    }

    try {
      const image = await readImageAsDataUrl(file);
      updateForm(field, image);
      toast.success("Đã chọn ảnh CCCD");
    } catch {
      toast.error("Không thể đọc file ảnh");
    }
  };

  const buildPayload = (): CreatePrivateOwnerRequestData | null => {
    const payload: CreatePrivateOwnerRequestData = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      identityNumber: form.identityNumber.trim(),
      frontImage: form.frontImage,
      backImage: form.backImage,
      address: form.address.trim(),
      reason: form.reason.trim(),
    };

    if (
      !payload.fullName ||
      !payload.phone ||
      !payload.identityNumber ||
      !payload.frontImage ||
      !payload.backImage ||
      !payload.address
    ) {
      toast.error("Vui lòng nhập đầy đủ thông tin bắt buộc");
      return null;
    }

    return payload;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const payload = buildPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      const request = await privateOwnerRequestService.createRequest(payload);
      setMyRequests((prev) => [request, ...prev]);
      setForm(createInitialForm());
      toast.success("Gửi hồ sơ thành công. Vui lòng chờ Admin xét duyệt.");
      await fetchMyRequest();
    } catch (error) {
      toast.error(getErrorMessage(error, "Gửi hồ sơ thất bại"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-20">
        <section className="border-b border-border bg-primary text-white">
          <div className="mx-auto max-w-7xl px-6 py-12 md:py-16">
            <div className="flex max-w-3xl flex-col gap-4">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold text-secondary ring-1 ring-white/15">
                <ShieldCheck size={18} />
                BQDrive Partner
              </span>
              <h1 className="text-3xl font-extrabold md:text-5xl">
                Đăng ký trở thành Chủ xe tư nhân
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/70 md:text-lg">
                Hoàn thiện hồ sơ để được phép đăng xe lên hệ thống BQDrive.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0">
            {canSubmit ? (
              <form
                onSubmit={handleSubmit}
                className="rounded-lg border border-border bg-white p-5 shadow-sm md:p-7"
              >
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
                    <FileCheck2 size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold text-primary">
                      Thông tin hồ sơ
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      Các trường có dấu * là bắt buộc.
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <TextField
                    label="Họ tên *"
                    value={form.fullName}
                    onChange={(value) => updateForm("fullName", value)}
                    autoComplete="name"
                  />
                  <TextField
                    label="Số điện thoại *"
                    value={form.phone}
                    onChange={(value) => updateForm("phone", value)}
                    autoComplete="tel"
                  />
                  <TextField
                    label="CCCD *"
                    value={form.identityNumber}
                    onChange={(value) => updateForm("identityNumber", value)}
                    autoComplete="off"
                  />
                  <TextField
                    label="Địa chỉ *"
                    value={form.address}
                    onChange={(value) => updateForm("address", value)}
                    autoComplete="street-address"
                  />
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <ImageField
                    label="Ảnh CCCD mặt trước *"
                    value={form.frontImage}
                    onChange={(event) => handleImageChange(event, "frontImage")}
                    onRemove={() => updateForm("frontImage", "")}
                  />
                  <ImageField
                    label="Ảnh CCCD mặt sau *"
                    value={form.backImage}
                    onChange={(event) => handleImageChange(event, "backImage")}
                    onRemove={() => updateForm("backImage", "")}
                  />
                </div>

                <label className="mt-5 block">
                  <span className="mb-2 block text-sm font-extrabold text-primary">
                    Lý do tham gia
                  </span>
                  <textarea
                    value={form.reason}
                    onChange={(event) => updateForm("reason", event.target.value)}
                    rows={5}
                    className="w-full rounded-lg border border-border px-4 py-3 text-primary outline-none transition placeholder:text-muted/60 focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                    placeholder="Chia sẻ ngắn gọn về nhu cầu cho thuê xe của bạn"
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary shadow-lg shadow-yellow-500/20 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {submitting ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <FileCheck2 size={20} />
                  )}
                  {submitting ? "Đang gửi hồ sơ..." : "Gửi hồ sơ"}
                </button>
              </form>
            ) : (
              <div className="rounded-lg border border-border bg-white p-8 text-center shadow-sm">
                <CheckCircle2 size={44} className="mx-auto text-secondary" />
                <h2 className="mt-4 text-2xl font-extrabold text-primary">
                  Hồ sơ đã được ghi nhận
                </h2>
                <p className="mx-auto mt-2 max-w-xl leading-7 text-muted">
                  Bạn có thể theo dõi trạng thái xét duyệt trong card Hồ sơ của tôi.
                </p>
              </div>
            )}
          </div>

          <aside className="space-y-5">
            <MyRequestCard request={latestRequest} loading={loading} />

            <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <h3 className="text-lg font-extrabold text-primary">
                Quy trình xét duyệt
              </h3>
              <div className="mt-4 space-y-4">
                {[
                  "Gửi hồ sơ đăng ký",
                  "Admin kiểm tra thông tin",
                  "Duyệt hồ sơ và cấp quyền",
                ].map((item, index) => (
                  <div key={item} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondarySoft text-sm font-extrabold text-secondary">
                      {index + 1}
                    </div>
                    <p className="pt-1 text-sm font-bold text-slate-600">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <Footer />
      </main>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold text-primary">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="min-h-12 w-full rounded-lg border border-border px-4 text-primary outline-none transition placeholder:text-muted/60 focus:border-secondary focus:ring-4 focus:ring-secondary/10"
      />
    </label>
  );
}

function ImageField({
  label,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold text-primary">
        {label}
      </span>
      <div className="overflow-hidden rounded-lg border border-dashed border-secondary/40 bg-secondarySoft/25">
        {value ? (
          <div className="relative">
            <img
              src={value}
              alt={label}
              className="h-48 w-full object-cover"
            />
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-sm font-extrabold text-red-600 shadow-sm transition hover:bg-red-50"
            >
              Xóa ảnh
            </button>
          </div>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-secondary shadow-sm">
              <Upload size={24} />
            </div>
            <div>
              <p className="font-extrabold text-primary">Chọn ảnh</p>
              <p className="mt-1 text-sm text-muted">PNG, JPG hoặc JPEG</p>
            </div>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={onChange}
          className="sr-only"
        />
      </div>
    </label>
  );
}

function MyRequestCard({
  request,
  loading,
}: {
  request: PrivateOwnerRequest | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 text-muted">
          <Loader2 size={20} className="animate-spin" />
          <p className="font-bold">Đang tải hồ sơ của tôi...</p>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
            <AlertCircle size={21} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-primary">
              Hồ sơ của tôi
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted">
              Bạn chưa gửi hồ sơ đăng ký Chủ xe tư nhân.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const statusView = getStatusView(request.status);
  const StatusIcon = statusView.icon;

  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-extrabold text-primary">Hồ sơ của tôi</h3>
          <p className="mt-1 text-sm text-muted">{request.fullName}</p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${statusView.badgeClass}`}
        >
          {statusView.label}
        </span>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-lg bg-secondarySoft/30 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${statusView.iconClass}`}
        >
          <StatusIcon size={21} />
        </div>
        <div>
          <p className="font-bold text-primary">{statusView.message}</p>
          {request.status === "REJECTED" && request.adminNote && (
            <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3">
              <p className="text-xs font-extrabold uppercase text-red-500">
                Lý do từ chối
              </p>
              <p className="mt-1 text-sm font-semibold text-red-700">
                {request.adminNote}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
