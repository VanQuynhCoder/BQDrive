import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
import { Lock, Search, Trash2, Unlock } from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  adminService,
  type AdminUser,
  type UserRole,
} from "../../services/admin.service";

type UserAction = "block" | "unblock" | "delete";

const roleOptions: Array<{ label: string; value: "" | UserRole }> = [
  { label: "Tất cả", value: "" },
  { label: "Khách hàng", value: "CUSTOMER" },
  { label: "Doanh nghiệp", value: "BUSINESS" },
  { label: "Chủ xe tư nhân", value: "PRIVATE_OWNER" },
];

function formatDate(date?: string) {
  if (!date) return "--";
  return new Date(date).toLocaleDateString("vi-VN");
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    CUSTOMER: "Khách hàng",
    BUSINESS: "Doanh nghiệp",
    PRIVATE_OWNER: "Chủ xe tư nhân",
  };

  return labels[role] || role;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"" | UserRole>("");
  const [keyword, setKeyword] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [action, setAction] = useState<{
    type: UserAction;
    user: AdminUser;
  } | null>(null);

  const fetchUsers = async (nextRole = role, nextKeyword = keyword) => {
    setLoading(true);
    try {
      const data = await adminService.getUsers({
        role: nextRole || undefined,
        keyword: nextKeyword || undefined,
      });
      setUsers(data);
    } catch {
      toast.error("Không thể tải danh sách user");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    adminService
      .getUsers()
      .then((data) => {
        if (active) setUsers(data);
      })
      .catch(() => {
        toast.error("Không thể tải danh sách user");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    void fetchUsers();
  };

  const handleRoleChange = (nextRole: "" | UserRole) => {
    setRole(nextRole);
    void fetchUsers(nextRole, keyword);
  };

  const openAction = (type: UserAction, user: AdminUser) => {
    setReason("");
    setAction({ type, user });
  };

  const closeAction = () => {
    setAction(null);
    setReason("");
  };

  const confirmAction = async () => {
    if (!action) return;

    if ((action.type === "block" || action.type === "delete") && !reason.trim()) {
      toast.error("Vui lòng nhập lý do");
      return;
    }

    setSubmitting(true);
    try {
      if (action.type === "block") {
        await adminService.blockUser(action.user._id, reason.trim());
        toast.success("Đã khóa tài khoản");
      }

      if (action.type === "unblock") {
        await adminService.unblockUser(action.user._id);
        toast.success("Đã mở khóa tài khoản");
      }

      if (action.type === "delete") {
        await adminService.deleteUser(action.user._id, reason.trim());
        toast.success("Đã xóa tài khoản");
      }

      closeAction();
      await fetchUsers();
    } catch {
      toast.error("Thao tác thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle =
    action?.type === "block"
      ? "Khóa tài khoản"
      : action?.type === "delete"
        ? "Xóa tài khoản"
        : "Mở khóa tài khoản";

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-secondary">
            Quản trị người dùng
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary">
            Quản lý User
          </h2>
          <p className="mt-2 text-slate-500">
            Tìm kiếm, khóa, mở khóa hoặc xóa mềm tài khoản trong hệ thống.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <form
          onSubmit={handleSearch}
          className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-4 focus-within:border-secondary">
            <Search size={18} className="text-secondary" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="min-w-0 flex-1 outline-none"
              placeholder="Tìm theo tên, email hoặc số điện thoại"
            />
          </div>

          <button className="min-h-11 rounded-lg bg-primary px-6 py-2 font-extrabold text-white transition hover:bg-primaryDark">
            Tìm kiếm
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {roleOptions.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleRoleChange(item.value)}
              className={`rounded-lg px-4 py-2 text-sm font-extrabold transition ${
                role === item.value
                  ? "bg-secondary text-primary"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Họ tên</th>
                <th className="px-5 py-4">Email</th>
                <th className="px-5 py-4">Số điện thoại</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Ngày tạo</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    Đang tải danh sách user...
                  </td>
                </tr>
              )}

              {!loading &&
                users.map((user) => (
                  <tr key={user._id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-extrabold text-primary">
                      {user.name}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{user.email}</td>
                    <td className="px-5 py-4 text-slate-600">
                      {user.phone || "--"}
                    </td>
                    <td className="px-5 py-4">
                      <AdminStatusBadge tone="blue" label={getRoleLabel(user.role)} />
                    </td>
                    <td className="px-5 py-4">
                      <AdminStatusBadge
                        tone={user.isBlocked ? "red" : "green"}
                        label={user.isBlocked ? "Đã khóa" : "Hoạt động"}
                      />
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {user.isBlocked ? (
                          <button
                            type="button"
                            onClick={() => openAction("unblock", user)}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-700 hover:bg-emerald-100"
                          >
                            <Unlock size={16} />
                            Mở khóa
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openAction("block", user)}
                            className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-700 hover:bg-amber-100"
                          >
                            <Lock size={16} />
                            Khóa
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openAction("delete", user)}
                          className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700 hover:bg-red-100"
                        >
                          <Trash2 size={16} />
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    Không có user phù hợp.
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
            ? `Tài khoản: ${action.user.name} (${action.user.email})`
            : undefined
        }
        confirmText={
          action?.type === "unblock"
            ? "Mở khóa"
            : action?.type === "delete"
              ? "Xóa tài khoản"
              : "Khóa tài khoản"
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
              placeholder="Nhập lý do thao tác..."
            />
          </label>
        )}
      </AdminModal>
    </div>
  );
}
