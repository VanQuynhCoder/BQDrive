import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
import {
  CalendarDays,
  CheckCircle2,
  Edit3,
  Loader2,
  Plus,
  Power,
  Trash2,
  XCircle,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  adminService,
  type AdminHoliday,
  type HolidayPayload,
} from "../../services/admin.service";

type HolidayForm = {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  note: string;
};

const emptyForm: HolidayForm = {
  name: "",
  startDate: "",
  endDate: "",
  isActive: true,
  note: "",
};

function toInputDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function formatDate(value?: string) {
  if (!value) return "--";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getDurationLabel(holiday: AdminHoliday) {
  const start = new Date(holiday.startDate || holiday.date || "");
  const end = new Date(holiday.endDate || holiday.startDate || holiday.date || "");

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "--";
  }

  const diffDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );

  return `${diffDays.toLocaleString("vi-VN")} ngày`;
}

export default function AdminHolidaysPage() {
  const [holidays, setHolidays] = useState<AdminHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<AdminHoliday | null>(
    null,
  );
  const [deleteHoliday, setDeleteHoliday] = useState<AdminHoliday | null>(null);
  const [form, setForm] = useState<HolidayForm>(emptyForm);

  const stats = useMemo(() => {
    const active = holidays.filter((holiday) => holiday.isActive).length;

    return {
      total: holidays.length,
      active,
      inactive: holidays.length - active,
    };
  }, [holidays]);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const data = await adminService.getHolidays();
      setHolidays(data);
    } catch {
      toast.error("Không thể tải danh sách ngày lễ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    adminService
      .getHolidays()
      .then((data) => {
        if (active) setHolidays(data);
      })
      .catch(() => {
        toast.error("Không thể tải danh sách ngày lễ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const openCreateForm = () => {
    setEditingHoliday(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEditForm = (holiday: AdminHoliday) => {
    setEditingHoliday(holiday);
    setForm({
      name: holiday.name || "",
      startDate: toInputDate(holiday.startDate || holiday.date),
      endDate: toInputDate(holiday.endDate || holiday.startDate || holiday.date),
      isActive: holiday.isActive,
      note: holiday.note || "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setFormOpen(false);
    setEditingHoliday(null);
    setForm(emptyForm);
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên ngày lễ");
      return false;
    }

    if (!form.startDate || !form.endDate) {
      toast.error("Vui lòng chọn ngày bắt đầu và ngày kết thúc");
      return false;
    }

    if (new Date(form.endDate).getTime() < new Date(form.startDate).getTime()) {
      toast.error("Ngày kết thúc không được trước ngày bắt đầu");
      return false;
    }

    return true;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!validateForm()) return;

    const payload: HolidayPayload = {
      name: form.name.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      isActive: form.isActive,
      note: form.note.trim(),
    };

    setSubmitting(true);
    try {
      if (editingHoliday) {
        await adminService.updateHoliday(editingHoliday._id, payload);
        toast.success("Đã cập nhật ngày lễ");
      } else {
        await adminService.createHoliday(payload);
        toast.success("Đã thêm ngày lễ");
      }

      closeForm();
      await fetchHolidays();
    } catch {
      toast.error("Lưu ngày lễ thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (holiday: AdminHoliday) => {
    setSubmitting(true);
    try {
      await adminService.toggleHoliday(holiday._id);
      toast.success(holiday.isActive ? "Đã tắt ngày lễ" : "Đã bật ngày lễ");
      await fetchHolidays();
    } catch {
      toast.error("Cập nhật trạng thái ngày lễ thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteHoliday) return;

    setSubmitting(true);
    try {
      await adminService.deleteHoliday(deleteHoliday._id);
      toast.success("Đã xóa ngày lễ");
      setDeleteHoliday(null);
      await fetchHolidays();
    } catch {
      toast.error("Xóa ngày lễ thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-secondary">
            Cấu hình giá thuê
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary">
            Quản lý ngày lễ
          </h2>
          <p className="mt-2 max-w-3xl text-slate-500">
            Admin cấu hình lịch ngày lễ Việt Nam để hệ thống tự áp dụng giá
            ngày lễ khi khách đặt xe. Ngày lễ đang bật sẽ được ưu tiên cao hơn
            cuối tuần và ngày thường.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary transition hover:bg-secondaryLight"
        >
          <Plus size={18} />
          Thêm ngày lễ
        </button>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">Tổng cấu hình</p>
          <p className="mt-2 text-3xl font-extrabold text-primary">
            {loading ? "..." : stats.total.toLocaleString("vi-VN")}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">Đang áp dụng</p>
          <p className="mt-2 text-3xl font-extrabold text-primary">
            {loading ? "..." : stats.active.toLocaleString("vi-VN")}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">Đang tắt</p>
          <p className="mt-2 text-3xl font-extrabold text-primary">
            {loading ? "..." : stats.inactive.toLocaleString("vi-VN")}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-primary">
              Danh sách ngày lễ
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Hỗ trợ ngày lễ một ngày hoặc kéo dài nhiều ngày.
            </p>
          </div>
          <AdminStatusBadge
            tone="blue"
            label={`${stats.active.toLocaleString("vi-VN")} ngày lễ đang bật`}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Tên ngày lễ</th>
                <th className="px-5 py-4">Ngày bắt đầu</th>
                <th className="px-5 py-4">Ngày kết thúc</th>
                <th className="px-5 py-4">Thời lượng</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Ghi chú</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={18} className="animate-spin" />
                      Đang tải danh sách ngày lễ...
                    </span>
                  </td>
                </tr>
              )}

              {!loading &&
                holidays.map((holiday) => (
                  <tr key={holiday._id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondarySoft text-primary">
                          <CalendarDays size={18} />
                        </div>
                        <div>
                          <p className="font-extrabold text-primary">
                            {holiday.name}
                          </p>
                          <p className="mt-0.5 text-xs font-bold text-slate-400">
                            {holiday.type || "HOLIDAY"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-700">
                      {formatDate(holiday.startDate || holiday.date)}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-700">
                      {formatDate(holiday.endDate || holiday.startDate || holiday.date)}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {getDurationLabel(holiday)}
                    </td>
                    <td className="px-5 py-4">
                      <AdminStatusBadge
                        tone={holiday.isActive ? "green" : "gray"}
                        label={holiday.isActive ? "Đang bật" : "Đang tắt"}
                      />
                    </td>
                    <td className="max-w-[220px] px-5 py-4 text-slate-600">
                      <p className="line-clamp-2">{holiday.note || "--"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggle(holiday)}
                          disabled={submitting}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                        >
                          <Power size={16} />
                          {holiday.isActive ? "Tắt" : "Bật"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditForm(holiday)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700 transition hover:bg-slate-200"
                        >
                          <Edit3 size={16} />
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteHoliday(holiday)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-extrabold text-slate-800 transition hover:bg-slate-200"
                        >
                          <Trash2 size={16} />
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && holidays.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-secondarySoft text-primary">
                        <CalendarDays size={24} />
                      </div>
                      <h4 className="mt-4 text-lg font-extrabold text-primary">
                        Chưa có ngày lễ nào
                      </h4>
                      <p className="mt-2 text-sm text-slate-500">
                        Thêm ngày lễ để hệ thống áp dụng mức giá ngày lễ khi
                        khách đặt xe.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AdminModal
        open={formOpen}
        title={editingHoliday ? "Cập nhật ngày lễ" : "Thêm ngày lễ"}
        description="Ngày lễ đang bật sẽ được dùng để tính giá thuê theo mức giá ngày lễ."
        confirmText={editingHoliday ? "Cập nhật" : "Thêm ngày lễ"}
        loading={submitting}
        onClose={closeForm}
        onConfirm={() => {
          const formElement = document.getElementById("holiday-form");
          formElement?.dispatchEvent(
            new Event("submit", { cancelable: true, bubbles: true }),
          );
        }}
      >
        <form id="holiday-form" onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">
              Tên ngày lễ
            </span>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              className="min-h-11 w-full rounded-lg border border-slate-200 px-4 outline-none focus:border-secondary"
              placeholder="Tết Dương lịch, Tết Nguyên đán..."
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">
                Ngày bắt đầu
              </span>
              <input
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    startDate: event.target.value,
                    endDate: prev.endDate || event.target.value,
                  }))
                }
                className="min-h-11 w-full rounded-lg border border-slate-200 px-4 outline-none focus:border-secondary"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">
                Ngày kết thúc
              </span>
              <input
                type="date"
                value={form.endDate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, endDate: event.target.value }))
                }
                className="min-h-11 w-full rounded-lg border border-slate-200 px-4 outline-none focus:border-secondary"
              />
            </label>
          </div>

          <div>
            <label className="inline-flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 font-bold text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    isActive: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-yellow-500"
              />
              Đang bật
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">
              Ghi chú
            </span>
            <textarea
              value={form.note}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, note: event.target.value }))
              }
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-secondary"
              placeholder="Ghi chú nội bộ cho admin..."
            />
          </label>

          <div className="rounded-lg border border-secondary/30 bg-secondarySoft p-4 text-sm font-semibold text-primary">
            <div className="flex items-start gap-2">
              {form.isActive ? (
                <CheckCircle2 size={18} className="mt-0.5 text-primary" />
              ) : (
                <XCircle size={18} className="mt-0.5 text-primary" />
              )}
              <p>
                Hệ thống sẽ áp dụng giá ngày lễ cho mọi ngày nằm trong khoảng
                này nếu trạng thái đang bật.
              </p>
            </div>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        open={!!deleteHoliday}
        title="Xóa ngày lễ"
        description={
          deleteHoliday
            ? `Bạn chắc chắn muốn xóa ${deleteHoliday.name}?`
            : undefined
        }
        confirmText="Xóa ngày lễ"
        danger
        loading={submitting}
        onClose={() => setDeleteHoliday(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}