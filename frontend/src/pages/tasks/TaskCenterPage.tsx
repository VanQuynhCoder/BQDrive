import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarCheck,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  CreditCard,
  FileWarning,
  Loader2,
  RefreshCw,
  RotateCcw,
  Star,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import Footer from "../../components/Footer";
import Header from "../../components/Header";
import {
  notificationService,
  type ActionCenterResponse,
  type ActionCenterTask,
  type TaskContext,
  type TaskGroup,
  type TaskPriority,
} from "../../services/notification.service";

type TaskCenterPageProps = {
  context: TaskContext;
  title: string;
  subtitle: string;
  eyebrow?: string;
  embedded?: boolean;
};

type ActiveTab = "ACTION_REQUIRED" | "WAITING" | "ALL";
type PriorityFilter = "ALL" | TaskPriority;

const EMPTY_DATA: ActionCenterResponse = {
  summary: {
    actionRequiredCount: 0,
    waitingCount: 0,
    highPriorityCount: 0,
    totalCount: 0,
  },
  tasks: [],
};

const typeIcons: Record<string, LucideIcon> = {
  BOOKING_PAYMENT_REQUIRED: CreditCard,
  REMAINING_PAYMENT_REQUIRED: Wallet,
  EXTRA_CHARGE_PAYMENT_REQUIRED: FileWarning,
  REFUND_RECIPIENT_INFO_REQUIRED: Wallet,
  REFUND_CONFIRMATION_REQUIRED: RefreshCw,
  WAITING_REFUND_FROM_OWNER: RefreshCw,
  RETURN_DUE_SOON: Clock3,
  RETURN_OVERDUE: AlertTriangle,
  REVIEW_REQUIRED: Star,
  BOOKING_APPROVAL_REQUIRED: CalendarCheck,
  HANDOVER_REQUIRED: Car,
  RECEIVE_RETURN_REQUIRED: RotateCcw,
  RETURN_INSPECTION_REQUIRED: ClipboardCheck,
  COMPLETE_BOOKING_REQUIRED: CheckCircle2,
  CASH_PAYMENT_CONFIRMATION_REQUIRED: CreditCard,
  WAITING_EXTRA_CHARGE_PAYMENT: FileWarning,
  WAITING_REMAINING_PAYMENT: CreditCard,
  OWNER_REFUND_REQUIRED: RefreshCw,
  OWNER_REFUND_WAITING_INFO: Clock3,
  OWNER_REFUND_WAITING_RENTER: RefreshCw,
  WAITING_OWNER_APPROVAL: BellRing,
  WAITING_OWNER_INSPECTION: ClipboardCheck,
  ACTIVE_TRIP: Clock3,
  CAR_REJECTED_NEEDS_UPDATE: AlertTriangle,
  CAR_APPROVAL_REQUIRED: Car,
  BUSINESS_APPROVAL_REQUIRED: ClipboardCheck,
  REVIEW_REPORT_REQUIRED: FileWarning,
};

const priorityLabels: Record<TaskPriority, string> = {
  HIGH: "Khẩn cấp",
  MEDIUM: "Cần xử lý",
  LOW: "Có thể làm sau",
};

function formatCurrency(value?: number) {
  if (!value) return "";

  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getPriorityStyle(priority: TaskPriority, group: TaskGroup) {
  if (group === "WAITING") {
    return {
      card: "border-slate-200 bg-white",
      icon: "bg-slate-100 text-slate-700",
      badge: "bg-slate-100 text-slate-700",
      action: "bg-slate-100 text-primary hover:bg-secondarySoft",
    };
  }

  if (priority === "HIGH") {
    return {
      card: "border-red-200 bg-red-50/60",
      icon: "bg-red-100 text-red-700",
      badge: "bg-red-600 text-white",
      action: "bg-primary text-secondary hover:bg-primaryDark",
    };
  }

  if (priority === "MEDIUM") {
    return {
      card: "border-secondary/50 bg-secondarySoft/40",
      icon: "bg-secondary text-primary",
      badge: "bg-secondary text-primary",
      action: "bg-secondary text-primary hover:brightness-95",
    };
  }

  return {
    card: "border-emerald-200 bg-emerald-50/70",
    icon: "bg-emerald-100 text-emerald-700",
    badge: "bg-emerald-600 text-white",
    action: "bg-primary text-secondary hover:bg-primaryDark",
  };
}

function getAmount(task: ActionCenterTask) {
  return (
    task.metadata?.pendingExtraChargeAmount ||
    task.metadata?.refundAmount ||
    task.metadata?.remainingAmount ||
    0
  );
}

function formatDistance(value?: number) {
  if (typeof value !== "number") return "";

  return `${value.toLocaleString("vi-VN", {
    maximumFractionDigits: 2,
  })} km`;
}

function getDeliveryInfo(task: ActionCenterTask) {
  if (task.metadata?.deliveryType !== "DELIVERY_TO_CUSTOMER") return null;

  return {
    label: String(task.metadata.deliveryLabel || "Giao xe tận nơi"),
    address: String(task.metadata.deliveryAddress || "Chưa có địa chỉ giao xe"),
    distance: formatDistance(task.metadata.deliveryDistanceKm),
    duration: String(task.metadata.deliveryDurationText || ""),
    fee: formatCurrency(Number(task.metadata.deliveryFee || 0)),
  };
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <p className="text-xs font-extrabold uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words font-extrabold text-primary">{value}</p>
    </div>
  );
}

function TaskCard({ task }: { task: ActionCenterTask }) {
  const navigate = useNavigate();
  const Icon = typeIcons[task.type] || BellRing;
  const style = getPriorityStyle(task.priority, task.group);
  const dueAt = formatDateTime(task.dueAt);
  const amount = formatCurrency(Number(getAmount(task) || 0));
  const bookingCode = task.metadata?.bookingCode;
  const carName = task.metadata?.carName;
  const licensePlate = task.metadata?.licensePlate;
  const deliveryInfo = getDeliveryInfo(task);

  return (
    <article
      className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${style.card}`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${style.icon}`}
        >
          <Icon size={23} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${style.badge}`}
            >
              {task.group === "WAITING" ? "Theo dõi" : priorityLabels[task.priority]}
            </span>
            {task.isOverdue && (
              <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-extrabold text-white">
                Quá hạn
              </span>
            )}
          </div>

          <h2 className="mt-3 text-xl font-extrabold text-primary">
            {task.title}
          </h2>
          <p className="mt-1 text-sm font-bold text-slate-600">
            {task.description}
          </p>

          <div className="mt-4 grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
            {bookingCode && <InfoBox label="Mã booking" value={`#${bookingCode}`} />}
            {carName && <InfoBox label="Xe" value={String(carName)} />}
            {licensePlate && <InfoBox label="Biển số" value={String(licensePlate)} />}
            {dueAt && (
              <InfoBox
                label={task.isOverdue ? "Quá hạn" : "Thời hạn"}
                value={dueAt}
              />
            )}
            {amount && <InfoBox label="Số tiền" value={amount} />}
          </div>

          {deliveryInfo && (
            <div className="mt-4 rounded-xl border border-secondary/40 bg-white px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                    <Truck size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold uppercase text-secondary">
                      Phương thức nhận xe
                    </p>
                    <p className="mt-1 font-extrabold text-primary">
                      {deliveryInfo.label}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">
                      {deliveryInfo.address}
                    </p>
                  </div>
                </div>

                <div className="grid shrink-0 gap-2 text-sm sm:grid-cols-3 lg:min-w-[360px]">
                  {deliveryInfo.distance && (
                    <InfoBox label="Khoảng cách" value={deliveryInfo.distance} />
                  )}
                  {deliveryInfo.duration && (
                    <InfoBox label="Thời gian" value={deliveryInfo.duration} />
                  )}
                  {deliveryInfo.fee && (
                    <InfoBox label="Phí giao xe" value={deliveryInfo.fee} />
                  )}
                </div>
              </div>
            </div>
          )}

          {task.detail && (
            <p className="mt-4 rounded-xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
              {task.detail}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate(task.actionUrl)}
          className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 font-extrabold transition ${style.action}`}
        >
          {task.actionLabel || "Xem chi tiết"}
          <ArrowRight size={18} />
        </button>
      </div>
    </article>
  );
}

function SummaryCard({
  label,
  value,
  className,
  valueClassName = "",
}: {
  label: string;
  value: number;
  className: string;
  valueClassName?: string;
}) {
  return (
    <div className={`rounded-xl border border-primary/10 p-5 ${className}`}>
      <p className="text-sm font-bold uppercase opacity-70">{label}</p>
      <p className={`mt-2 text-4xl font-extrabold ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    BOOKING_PAYMENT_REQUIRED: "Thanh toán booking",
    REMAINING_PAYMENT_REQUIRED: "Thanh toán phần còn lại",
    EXTRA_CHARGE_PAYMENT_REQUIRED: "Phí phát sinh",
    REFUND_RECIPIENT_INFO_REQUIRED: "Thông tin nhận tiền hoàn",
    REFUND_CONFIRMATION_REQUIRED: "Xác nhận hoàn tiền",
    WAITING_REFUND_FROM_OWNER: "Chờ chủ xe hoàn tiền",
    RETURN_DUE_SOON: "Sắp đến hạn trả xe",
    RETURN_OVERDUE: "Quá hạn trả xe",
    REVIEW_REQUIRED: "Đánh giá chuyến thuê",
    BOOKING_APPROVAL_REQUIRED: "Xác nhận booking",
    HANDOVER_REQUIRED: "Bàn giao xe",
    RECEIVE_RETURN_REQUIRED: "Tiếp nhận xe trả",
    RETURN_INSPECTION_REQUIRED: "Kiểm tra xe",
    COMPLETE_BOOKING_REQUIRED: "Hoàn tất booking",
    CASH_PAYMENT_CONFIRMATION_REQUIRED: "Xác nhận tiền mặt",
    WAITING_EXTRA_CHARGE_PAYMENT: "Chờ phí phát sinh",
    WAITING_REMAINING_PAYMENT: "Chờ thanh toán còn lại",
    WAITING_OWNER_APPROVAL: "Chờ chủ xe duyệt",
    WAITING_OWNER_INSPECTION: "Chờ kiểm tra xe",
    ACTIVE_TRIP: "Chuyến thuê đang diễn ra",
    CAR_REJECTED_NEEDS_UPDATE: "Xe bị từ chối",
    CAR_APPROVAL_REQUIRED: "Duyệt xe",
    BUSINESS_APPROVAL_REQUIRED: "Duyệt doanh nghiệp",
    REVIEW_REPORT_REQUIRED: "Đánh giá bị báo cáo",
    OWNER_REFUND_REQUIRED: "Hoàn tiền",
    OWNER_REFUND_WAITING_INFO: "Chờ thông tin nhận tiền",
    OWNER_REFUND_WAITING_RENTER: "Chờ khách xác nhận hoàn tiền",
  };

  return labels[type] || "Việc cần làm";
}

export default function TaskCenterPage({
  context,
  title,
  subtitle,
  eyebrow = "Việc cần làm",
  embedded = false,
}: TaskCenterPageProps) {
  const [data, setData] = useState<ActionCenterResponse>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ActiveTab>("ACTION_REQUIRED");
  const [priority, setPriority] = useState<PriorityFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await notificationService.getTasks(context));
    } catch {
      setData(EMPTY_DATA);
      setError("Không thể tải danh sách việc cần làm. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchTasks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchTasks]);

  const typeOptions = useMemo(
    () => Array.from(new Set(data.tasks.map((task) => task.type))).sort(),
    [data.tasks],
  );

  const filteredTasks = useMemo(
    () =>
      data.tasks.filter((task) => {
        if (tab !== "ALL" && task.group !== tab) return false;
        if (priority !== "ALL" && task.priority !== priority) return false;
        if (typeFilter !== "ALL" && task.type !== typeFilter) return false;
        return true;
      }),
    [data.tasks, priority, tab, typeFilter],
  );

  const content = (
    <main className={embedded ? "" : "mx-auto max-w-6xl px-4 py-10"}>
      <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-secondary">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-4xl font-extrabold text-primary">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-muted">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchTasks()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 font-extrabold text-primary transition hover:bg-secondarySoft/50"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
            Cập nhật
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="Cần bạn xử lý"
            value={data.summary.actionRequiredCount}
            className="bg-primary text-white"
            valueClassName="text-secondary"
          />
          <SummaryCard
            label="Đang chờ phản hồi"
            value={data.summary.waitingCount}
            className="bg-slate-50 text-primary"
          />
          <SummaryCard
            label="Khẩn cấp"
            value={data.summary.highPriorityCount}
            className="bg-red-50 text-red-700"
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ["ACTION_REQUIRED", "Cần xử lý"],
              ["WAITING", "Đang chờ phản hồi"],
              ["ALL", "Tất cả"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value as ActiveTab)}
                className={`rounded-lg px-4 py-2 text-sm font-extrabold transition ${
                  tab === value
                    ? "bg-primary text-secondary"
                    : "bg-slate-100 text-primary hover:bg-secondarySoft"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:w-[520px]">
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as PriorityFilter)}
              className="min-h-11 rounded-lg border border-border bg-white px-3 font-bold text-primary outline-none focus:border-secondary"
            >
              <option value="ALL">Tất cả mức ưu tiên</option>
              <option value="HIGH">Khẩn cấp</option>
              <option value="MEDIUM">Cần xử lý</option>
              <option value="LOW">Có thể làm sau</option>
            </select>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="min-h-11 rounded-lg border border-border bg-white px-3 font-bold text-primary outline-none focus:border-secondary"
            >
              <option value="ALL">Tất cả loại việc</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="mt-6">
        {loading ? (
          <div className="rounded-2xl border border-border bg-white p-10 text-center shadow-sm">
            <Loader2 size={34} className="mx-auto animate-spin text-secondary" />
            <p className="mt-3 font-extrabold text-primary">
              Đang tải việc cần làm...
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center shadow-sm">
            <AlertTriangle size={36} className="mx-auto text-red-600" />
            <p className="mt-3 font-extrabold text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => void fetchTasks()}
              className="mt-4 rounded-lg bg-primary px-5 py-2 font-extrabold text-secondary"
            >
              Thử lại
            </button>
          </div>
        ) : filteredTasks.length ? (
          <div className="space-y-4">
            {filteredTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-white p-10 text-center shadow-sm">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
            <h2 className="mt-3 text-2xl font-extrabold text-primary">
              Không có việc cần xử lý
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-muted">
              Khi có booking, thanh toán, trả xe, phí phát sinh hoặc đánh giá
              cần bạn xử lý, danh sách sẽ xuất hiện tại đây.
            </p>
          </div>
        )}
      </section>
    </main>
  );

  if (embedded) return content;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      {content}
      <Footer />
    </div>
  );
}
