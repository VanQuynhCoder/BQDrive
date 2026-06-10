import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, Eye, XCircle } from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  adminService,
  type PrivateOwnerRequest,
} from "../../services/admin.service";

type RequestAction = "approve" | "reject";

const statusFilters = [
  { label: "Tất cả", value: "" },
  { label: "Chờ duyệt", value: "PENDING" },
  { label: "Đã duyệt", value: "APPROVED" },
  { label: "Từ chối", value: "REJECTED" },
];

function getStatus(status: string) {
  if (status === "APPROVED") return { tone: "green" as const, label: "Đã duyệt" };
  if (status === "REJECTED") return { tone: "red" as const, label: "Từ chối" };
  return { tone: "yellow" as const, label: "Chờ duyệt" };
}

export default function AdminPrivateOwnerRequestsPage() {
  const [requests, setRequests] = useState<PrivateOwnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<PrivateOwnerRequest | null>(null);
  const [action, setAction] = useState<{
    type: RequestAction;
    request: PrivateOwnerRequest;
  } | null>(null);

  const fetchRequests = async (nextStatus = status) => {
    setLoading(true);
    try {
      const data = await adminService.getPrivateOwnerRequests({
        status: nextStatus || undefined,
      });
      setRequests(data);
    } catch {
      toast.error("Không thể tải hồ sơ chủ xe tư nhân");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    adminService
      .getPrivateOwnerRequests()
      .then((data) => {
        if (active) setRequests(data);
      })
      .catch(() => {
        toast.error("Không thể tải hồ sơ chủ xe tư nhân");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleStatusChange = (nextStatus: string) => {
    setStatus(nextStatus);
    void fetchRequests(nextStatus);
  };

  const openAction = (type: RequestAction, request: PrivateOwnerRequest) => {
    setNote("");
    setAction({ type, request });
  };

  const closeAction = () => {
    setNote("");
    setAction(null);
  };

  const confirmAction = async () => {
    if (!action) return;

    if (action.type === "reject" && !note.trim()) {
      toast.error("Vui lòng nhập lý do từ chối");
      return;
    }

    setSubmitting(true);
    try {
      if (action.type === "approve") {
        await adminService.approvePrivateOwner(action.request._id, note.trim());
        toast.success("Đã duyệt hồ sơ chủ xe tư nhân");
      }

      if (action.type === "reject") {
        await adminService.rejectPrivateOwner(action.request._id, note.trim());
        toast.success("Đã từ chối hồ sơ");
      }

      closeAction();
      await fetchRequests();
    } catch {
      toast.error("Thao tác thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-secondary">
            Xác minh hồ sơ
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary">
            Yêu cầu Chủ xe tư nhân
          </h2>
          <p className="mt-2 text-slate-500">
            Duyệt hoặc từ chối hồ sơ đăng ký chủ xe tư nhân.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {statusFilters.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleStatusChange(item.value)}
              className={`rounded-lg px-4 py-2 text-sm font-extrabold transition ${
                status === item.value
                  ? "bg-secondary text-primary"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Họ tên</th>
                <th className="px-5 py-4">Email</th>
                <th className="px-5 py-4">CCCD</th>
                <th className="px-5 py-4">Số điện thoại</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Đang tải hồ sơ...
                  </td>
                </tr>
              )}

              {!loading &&
                requests.map((request) => {
                  const statusInfo = getStatus(request.status);

                  return (
                    <tr key={request._id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {request.fullName}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {request.userId?.email || "--"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {request.identityNumber}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {request.phone}
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge
                          tone={statusInfo.tone}
                          label={statusInfo.label}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDetail(request)}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700 hover:bg-slate-200"
                          >
                            <Eye size={16} />
                            Xem chi tiết
                          </button>

                          {request.status === "PENDING" && (
                            <>
                              <button
                                type="button"
                                onClick={() => openAction("approve", request)}
                                className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-700 hover:bg-emerald-100"
                              >
                                <CheckCircle2 size={16} />
                                Duyệt
                              </button>
                              <button
                                type="button"
                                onClick={() => openAction("reject", request)}
                                className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700 hover:bg-red-100"
                              >
                                <XCircle size={16} />
                                Từ chối
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Không có hồ sơ phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AdminModal
        open={!!detail}
        title="Chi tiết hồ sơ chủ xe"
        confirmText="Đóng"
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="Họ tên" value={detail.fullName} />
              <InfoRow label="Email" value={detail.userId?.email || "--"} />
              <InfoRow label="CCCD" value={detail.identityNumber} />
              <InfoRow label="Số điện thoại" value={detail.phone} />
              <InfoRow label="Địa chỉ" value={detail.address || "--"} />
              <InfoRow label="Lý do" value={detail.reason || "--"} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {detail.frontImage && (
                <img
                  src={detail.frontImage}
                  alt="CCCD mặt trước"
                  className="h-44 w-full rounded-lg border border-slate-200 object-cover"
                />
              )}
              {detail.backImage && (
                <img
                  src={detail.backImage}
                  alt="CCCD mặt sau"
                  className="h-44 w-full rounded-lg border border-slate-200 object-cover"
                />
              )}
            </div>
          </div>
        )}
      </AdminModal>

      <AdminModal
        open={!!action}
        title={action?.type === "approve" ? "Duyệt hồ sơ" : "Từ chối hồ sơ"}
        description={action ? `Hồ sơ: ${action.request.fullName}` : undefined}
        confirmText={action?.type === "approve" ? "Duyệt" : "Từ chối"}
        danger={action?.type === "reject"}
        loading={submitting}
        onClose={closeAction}
        onConfirm={confirmAction}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">
            {action?.type === "approve" ? "Ghi chú admin" : "Lý do từ chối"}
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-secondary"
            placeholder={
              action?.type === "approve"
                ? "Có thể để trống"
                : "Nhập lý do từ chối..."
            }
          />
        </label>
      </AdminModal>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-primary">{value}</p>
    </div>
  );
}
