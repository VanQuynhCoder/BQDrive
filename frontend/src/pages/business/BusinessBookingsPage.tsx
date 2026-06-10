import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  UserX,
  XCircle,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  businessService,
  type BusinessBooking,
} from "../../services/business.service";
import { paymentService } from "../../services/payment.service";

type BookingAction = "confirm" | "reject" | "handover" | "complete" | "no-show";

function formatDateTime(value?: string) {
  if (!value) return "--";

  return new Date(value).toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getStatusBadge(status?: string) {
  const map: Record<string, { label: string; tone: "green" | "red" | "yellow" | "blue" | "gray" }> = {
    PENDING: { label: "Chờ xác nhận", tone: "yellow" },
    CONFIRMED: { label: "Đã xác nhận", tone: "blue" },
    IN_PROGRESS: { label: "Đang thuê", tone: "blue" },
    COMPLETED: { label: "Hoàn tất", tone: "green" },
    CANCELLED: { label: "Đã hủy", tone: "gray" },
    REJECTED: { label: "Từ chối", tone: "red" },
    NO_SHOW: { label: "Không nhận xe", tone: "red" },
  };

  return map[status || ""] || { label: status || "--", tone: "gray" };
}

function getPaymentBadge(booking: BusinessBooking) {
  const paidAmount = booking.paidAmount || 0;
  const remainingAmount = booking.remainingAmount || 0;

  if (remainingAmount <= 0 && paidAmount > 0) {
    return { label: "Đã thanh toán", tone: "green" as const };
  }

  if (paidAmount > 0) {
    return { label: "Đã đặt cọc", tone: "blue" as const };
  }

  return { label: "Chưa thanh toán", tone: "yellow" as const };
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

export default function BusinessBookingsPage() {
  const [bookings, setBookings] = useState<BusinessBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [action, setAction] = useState<{
    type: BookingAction;
    booking: BusinessBooking;
  } | null>(null);
  const [noShowReason, setNoShowReason] = useState("");

  const fetchBookings = async () => {
    setLoading(true);
    try {
      setBookings(await businessService.getMyBookings());
    } catch {
      toast.error("Không thể tải danh sách booking");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    businessService
      .getMyBookings()
      .then((data) => {
        if (active) setBookings(data);
      })
      .catch(() => {
        toast.error("Không thể tải danh sách booking");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const openAction = (type: BookingAction, booking: BusinessBooking) => {
    setNoShowReason("");
    setAction({ type, booking });
  };

  const closeAction = () => {
    if (submitting) return;
    setNoShowReason("");
    setAction(null);
  };

  const confirmAction = async () => {
    if (!action) return;

    setSubmitting(true);
    try {
      if (action.type === "confirm") {
        await businessService.confirmBooking(action.booking._id);
        toast.success("Đã xác nhận booking");
      }

      if (action.type === "reject") {
        await businessService.rejectBooking(action.booking._id);
        toast.success("Da tu choi booking");
      }

      if (action.type === "handover") {
        if (!action.booking.payment?._id) {
          throw new Error("Booking chua co payment tien mat");
        }

        await paymentService.updatePaymentStatus(action.booking.payment._id, {
          status: "PAID",
        });
        toast.success("Da giao xe va ghi nhan tien mat");
      }

      if (action.type === "complete") {
        await businessService.completeBooking(action.booking._id);
        toast.success("Đã hoàn tất booking");
      }

      if (action.type === "no-show") {
        await businessService.noShowBooking(
          action.booking._id,
          noShowReason.trim() || undefined,
        );
        toast.success("Đã đánh dấu No Show, tiền cọc không hoàn lại");
      }

      closeAction();
      await fetchBookings();
    } catch (error) {
      toast.error(getErrorMessage(error, "Thao tác booking thất bại"));
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle =
    action?.type === "confirm"
      ? "Xác nhận booking"
      : action?.type === "reject"
        ? "Tu choi booking"
        : action?.type === "handover"
          ? "Giao xe / Da nhan tien"
      : action?.type === "complete"
        ? "Hoàn tất booking"
        : "Đánh dấu không nhận xe";

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">
          Lịch thuê xe
        </p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">
          Quản lý booking
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Xác nhận booking mới, hoàn tất chuyến thuê, hoặc đánh dấu No Show khi
          khách không đến nhận xe.
        </p>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Mã booking</th>
                <th className="px-5 py-4">Khách hàng</th>
                <th className="px-5 py-4">Xe</th>
                <th className="px-5 py-4">Ngày nhận xe</th>
                <th className="px-5 py-4">Ngày trả xe</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Thanh toán</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    Đang tải danh sách booking...
                  </td>
                </tr>
              )}

              {!loading &&
                bookings.map((booking) => {
                  const status = getStatusBadge(booking.status);
                  const payment = getPaymentBadge(booking);
                  const cashPayment =
                    booking.payment?.method === "CASH" ? booking.payment : null;
                  const canHandoverCash =
                    booking.status === "CONFIRMED" &&
                    cashPayment?.status === "PENDING";

                  return (
                    <tr key={booking._id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-extrabold text-primary">
                        #{booking._id.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-extrabold text-primary">
                          {booking.userId?.name || "--"}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {booking.userId?.email || "--"}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {booking.carId?.name || "--"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {formatDateTime(booking.startDate)}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {formatDateTime(booking.endDate)}
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge
                          tone={status.tone}
                          label={status.label}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge
                          tone={payment.tone}
                          label={payment.label}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {booking.status === "PENDING" && (
                            <button
                              type="button"
                              onClick={() => openAction("confirm", booking)}
                              className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 font-bold text-blue-700 transition hover:bg-blue-100"
                            >
                              <Clock3 size={16} />
                              Xác nhận
                            </button>
                          )}

                          {booking.status === "PENDING" && (
                            <button
                              type="button"
                              onClick={() => openAction("reject", booking)}
                              className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700 transition hover:bg-red-100"
                            >
                              <XCircle size={16} />
                              Tu choi
                            </button>
                          )}

                          {canHandoverCash && (
                            <button
                              type="button"
                              onClick={() => openAction("handover", booking)}
                              className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              <CheckCircle2 size={16} />
                              Giao xe / Da nhan tien
                            </button>
                          )}

                          {booking.status === "IN_PROGRESS" && (
                            <button
                              type="button"
                              onClick={() => openAction("complete", booking)}
                              className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              <CheckCircle2 size={16} />
                              Hoan tat
                            </button>
                          )}

                          {booking.status === "CONFIRMED" && !canHandoverCash && (
                            <>
                              <button
                                type="button"
                                onClick={() => openAction("complete", booking)}
                                className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-700 transition hover:bg-emerald-100"
                              >
                                <CheckCircle2 size={16} />
                                Hoàn tất
                              </button>
                              <button
                                type="button"
                                onClick={() => openAction("no-show", booking)}
                                className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700 transition hover:bg-red-100"
                              >
                                <UserX size={16} />
                                Không nhận xe
                              </button>
                            </>
                          )}

                          {booking.status !== "PENDING" &&
                            booking.status !== "CONFIRMED" &&
                            booking.status !== "IN_PROGRESS" && (
                              <span className="text-sm font-semibold text-slate-400">
                                --
                              </span>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && bookings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    Chưa có booking nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AdminModal
        open={!!action}
        title={modalTitle}
        description={
          action
            ? `Booking #${action.booking._id.slice(-8).toUpperCase()} - ${
                action.booking.carId?.name || "Xe"
              }`
            : undefined
        }
        confirmText={
          action?.type === "confirm"
            ? "Xác nhận booking"
            : action?.type === "reject"
              ? "Tu choi"
              : action?.type === "handover"
                ? "Giao xe / Da nhan tien"
            : action?.type === "complete"
              ? "Hoàn tất"
              : "Không nhận xe"
        }
        danger={action?.type === "no-show" || action?.type === "reject"}
        loading={submitting}
        onClose={closeAction}
        onConfirm={confirmAction}
      >
        {action?.type === "no-show" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
              Nếu booking đã đặt cọc, khách sẽ mất cọc và trạng thái chuyển sang
              NO_SHOW.
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                Ghi chú No Show
              </span>
              <textarea
                value={noShowReason}
                onChange={(event) => setNoShowReason(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-secondary"
                placeholder="Khách không đến nhận xe đúng thời gian..."
              />
            </label>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
              <CalendarDays size={20} className="text-secondary" />
              {formatDateTime(action?.booking.startDate)} -{" "}
              {formatDateTime(action?.booking.endDate)}
            </div>
          </div>
        )}

        {submitting && (
          <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500">
            <Loader2 size={16} className="animate-spin text-secondary" />
            Đang xử lý booking...
          </div>
        )}
      </AdminModal>
    </div>
  );
}
