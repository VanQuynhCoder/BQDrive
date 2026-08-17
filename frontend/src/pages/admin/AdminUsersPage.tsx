import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  ArrowUpDown,
  CalendarDays,
  Mail,
  Phone,
  Search,
  UserRound,
  X,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import AdminUserActions from "../../components/admin/AdminUserActions";
import {
  adminService,
  type AdminUser,
} from "../../services/admin.service";
import { uploadService } from "../../services/upload.service";
import { normalizeImageUrl } from "../../utils/image.util";

type UserAction = "block" | "unblock" | "delete" | "identity-approve" | "identity-reject";

type UserStatusFilter =
  | "ALL"
  | "ACTIVE"
  | "BLOCKED"
  | "IDENTITY_COMPLETE"
  | "IDENTITY_INCOMPLETE"
  | "IDENTITY_PENDING"
  | "IDENTITY_VERIFIED"
  | "IDENTITY_REJECTED";

type UserSort = "NEWEST" | "OLDEST" | "NAME_ASC";

const userStatusOptions: Array<{
  value: UserStatusFilter;
  label: string;
  summaryLabel: string;
}> = [
  { value: "ALL", label: "Tất cả", summaryLabel: "Tổng người dùng" },
  { value: "ACTIVE", label: "Hoạt động", summaryLabel: "Đang hoạt động" },
  { value: "BLOCKED", label: "Đã khóa", summaryLabel: "Tài khoản đã khóa" },
  {
    value: "IDENTITY_COMPLETE",
    label: "Đủ giấy tờ",
    summaryLabel: "Đã đủ giấy tờ",
  },
  {
    value: "IDENTITY_INCOMPLETE",
    label: "Thiếu giấy tờ",
    summaryLabel: "Chưa đủ giấy tờ",
  },
  {
    value: "IDENTITY_PENDING",
    label: "Chờ xác minh",
    summaryLabel: "Đang chờ xác minh",
  },
  {
    value: "IDENTITY_VERIFIED",
    label: "Đã xác minh",
    summaryLabel: "Đã xác minh",
  },
  {
    value: "IDENTITY_REJECTED",
    label: "Bị từ chối",
    summaryLabel: "Hồ sơ bị từ chối",
  },
];

const userSortOptions: Array<{ value: UserSort; label: string }> = [
  { value: "NEWEST", label: "Mới nhất" },
  { value: "OLDEST", label: "Cũ nhất" },
  { value: "NAME_ASC", label: "Tên A-Z" },
];

function formatDate(date?: string) {
  if (!date) return "--";
  return new Date(date).toLocaleDateString("vi-VN");
}

function formatDateTime(date?: string) {
  if (!date) return "--";
  return new Date(date).toLocaleString("vi-VN");
}

function formatAddress(user: AdminUser) {
  return [
    user.address,
    user.ward,
    user.district,
    user.city || user.province,
  ]
    .filter(Boolean)
    .join(", ") || "Chưa cập nhật";
}

function getBlockedByLabel(user: AdminUser) {
  if (!user.blockedBy) return "--";
  if (typeof user.blockedBy === "string") return user.blockedBy;
  return user.blockedBy.name || user.blockedBy.email || "--";
}

function getIdentityVerificationStatus(user: AdminUser) {
  return user.identityVerificationStatus ||
    (user.identityProfileCompleted ? "PENDING" : "INCOMPLETE");
}

function getIdentityVerificationLabel(user: AdminUser) {
  const labels: Record<string, string> = {
    INCOMPLETE: "Chưa hoàn thiện",
    PENDING: "Chờ xác minh",
    VERIFIED: "Đã xác minh",
    REJECTED: "Bị từ chối",
  };

  return labels[getIdentityVerificationStatus(user)] || "Chưa hoàn thiện";
}

function getIdentityVerificationTone(user: AdminUser) {
  const status = getIdentityVerificationStatus(user);
  if (status === "VERIFIED") return "green" as const;
  if (status === "REJECTED") return "red" as const;
  if (status === "PENDING") return "yellow" as const;
  return "gray" as const;
}

function DetailField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-bold text-primary">
        {value || "--"}
      </dd>
    </div>
  );
}

type IdentityDocumentField =
  | "cccdFrontImage"
  | "cccdBackImage"
  | "driverLicenseImage";

type IdentityDocumentUrls = Partial<Record<IdentityDocumentField, string>>;

type IdentityDocumentPreview = {
  label: string;
  url: string;
};

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    USER: "Người dùng",
    ADMIN: "Quản trị viên",
  };

  return labels[role] || role;
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

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("ALL");
  const [sort, setSort] = useState<UserSort>("NEWEST");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [action, setAction] = useState<{
    type: UserAction;
    user: AdminUser;
  } | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailDocumentsLoading, setDetailDocumentsLoading] = useState(false);
  const [identityDocumentUrls, setIdentityDocumentUrls] =
    useState<IdentityDocumentUrls>({});
  const [identityDocumentPreview, setIdentityDocumentPreview] =
    useState<IdentityDocumentPreview | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await adminService.getUsers();
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

  useEffect(() => {
    if (!detailUserId) return;

    let active = true;
    setDetailLoading(true);
    setDetailError("");
    setDetailUser(null);

    adminService
      .getUserDetail(detailUserId)
      .then((user) => {
        if (active) setDetailUser(user);
      })
      .catch((error) => {
        if (active) {
          setDetailError(
            getErrorMessage(error, "Không thể tải thông tin người dùng"),
          );
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [detailUserId]);

  useEffect(() => {
    let active = true;
    const loadedUrls: string[] = [];

    setIdentityDocumentUrls({});

    if (!detailUser) {
      setDetailDocumentsLoading(false);
      return () => {
        active = false;
      };
    }

    const documents: Array<[IdentityDocumentField, string | undefined]> = [
      ["cccdFrontImage", detailUser.cccdFrontImage],
      ["cccdBackImage", detailUser.cccdBackImage],
      ["driverLicenseImage", detailUser.driverLicenseImage],
    ];

    setDetailDocumentsLoading(true);
    Promise.all(
      documents.map(async ([field, path]) => {
        if (!path) return [field, ""] as const;

        try {
          const url = await uploadService.loadIdentityDocument(path);
          loadedUrls.push(url);
          return [field, url] as const;
        } catch {
          return [field, ""] as const;
        }
      }),
    )
      .then((entries) => {
        if (active) setIdentityDocumentUrls(Object.fromEntries(entries));
      })
      .finally(() => {
        if (active) setDetailDocumentsLoading(false);
      });

    return () => {
      active = false;
      loadedUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [detailUser]);

  const openDetail = (user: AdminUser) => {
    setDetailUserId(user._id);
  };

  const closeDetail = () => {
    setDetailUserId(null);
    setDetailUser(null);
    setDetailError("");
    setIdentityDocumentUrls({});
    setIdentityDocumentPreview(null);
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

    if (
      (action.type === "block" ||
        action.type === "delete" ||
        action.type === "identity-reject") &&
      !reason.trim()
    ) {
      toast.error("Vui lòng nhập lý do");
      return;
    }

    setSubmitting(true);
    try {
      if (action?.type === "block") {
        await adminService.blockUser(action?.user._id, reason.trim());
        toast.success("Đã khóa tài khoản");
      }

      if (action?.type === "unblock") {
        await adminService.unblockUser(action?.user._id);
        toast.success("Đã mở khóa tài khoản");
      }

      if (action?.type === "delete") {
        await adminService.deleteUser(action?.user._id, reason.trim());
        toast.success("Đã xóa tài khoản");
      }

      if (action.type === "identity-approve") {
        const user = await adminService.approveUserIdentity(action.user._id);
        setDetailUser((current) => current?._id === user._id ? user : current);
        toast.success("Đã xác minh hồ sơ định danh");
      }

      if (action.type === "identity-reject") {
        const user = await adminService.rejectUserIdentity(action.user._id, reason.trim());
        setDetailUser((current) => current?._id === user._id ? user : current);
        toast.success("Đã từ chối hồ sơ định danh");
      }

      closeAction();
      await fetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error, "Thao tác thất bại"));
    } finally {
      setSubmitting(false);
    }
  };

  const userCounts: Record<UserStatusFilter, number> = {
    ALL: users.length,
    ACTIVE: users.filter((user) => !user.isBlocked).length,
    BLOCKED: users.filter((user) => user.isBlocked).length,
    IDENTITY_COMPLETE: users.filter((user) => user.identityProfileCompleted)
      .length,
    IDENTITY_INCOMPLETE: users.filter((user) => !user.identityProfileCompleted)
      .length,
    IDENTITY_PENDING: users.filter(
      (user) => getIdentityVerificationStatus(user) === "PENDING",
    ).length,
    IDENTITY_VERIFIED: users.filter(
      (user) => getIdentityVerificationStatus(user) === "VERIFIED",
    ).length,
    IDENTITY_REJECTED: users.filter(
      (user) => getIdentityVerificationStatus(user) === "REJECTED",
    ).length,
  };
  const normalizedKeyword = keyword.trim().toLocaleLowerCase("vi-VN");
  const visibleUsers = users
    .filter((user) => {
      const matchesKeyword =
        !normalizedKeyword ||
        [user.name, user.email, user.phone]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase("vi-VN").includes(normalizedKeyword),
          );
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && !user.isBlocked) ||
        (statusFilter === "BLOCKED" && user.isBlocked) ||
        (statusFilter === "IDENTITY_COMPLETE" &&
          user.identityProfileCompleted === true) ||
        (statusFilter === "IDENTITY_INCOMPLETE" &&
          user.identityProfileCompleted !== true) ||
        (statusFilter === "IDENTITY_PENDING" &&
          getIdentityVerificationStatus(user) === "PENDING") ||
        (statusFilter === "IDENTITY_VERIFIED" &&
          getIdentityVerificationStatus(user) === "VERIFIED") ||
        (statusFilter === "IDENTITY_REJECTED" &&
          getIdentityVerificationStatus(user) === "REJECTED");

      return matchesKeyword && matchesStatus;
    })
    .sort((left, right) => {
      if (sort === "NAME_ASC") {
        return left.name.localeCompare(right.name, "vi");
      }

      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return sort === "OLDEST" ? leftTime - rightTime : rightTime - leftTime;
    });

  const modalTitle =
    action?.type === "block"
      ? "Khóa tài khoản"
      : action?.type === "delete"
        ? "Xóa tài khoản"
        : action?.type === "identity-approve"
          ? "Duyệt hồ sơ định danh"
          : action?.type === "identity-reject"
            ? "Từ chối hồ sơ định danh"
            : "Mở khóa tài khoản";
  const detailAvatarUrl = normalizeImageUrl(detailUser?.avatar);
  const identityDocumentItems: Array<{
    field: IdentityDocumentField;
    label: string;
    path?: string;
  }> = [
    {
      field: "cccdFrontImage",
      label: "CCCD mặt trước",
      path: detailUser?.cccdFrontImage,
    },
    {
      field: "cccdBackImage",
      label: "CCCD mặt sau",
      path: detailUser?.cccdBackImage,
    },
    {
      field: "driverLicenseImage",
      label: "Giấy phép lái xe",
      path: detailUser?.driverLicenseImage,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-secondary">
            Người dùng hệ thống
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary">
            Quản lý người dùng
          </h2>
          <p className="mt-2 max-w-2xl text-slate-500">
            Theo dõi hồ sơ, xem thông tin chi tiết và quản lý trạng thái tài
            khoản trong hệ thống.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {userStatusOptions.map((option) => {
            const active = statusFilter === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                aria-pressed={active}
                className={`min-h-20 rounded-lg border px-4 py-3 text-left transition ${
                  active
                    ? "border-secondary bg-secondarySoft shadow-sm ring-2 ring-secondary/20"
                    : "border-slate-200 bg-white hover:border-secondary/60 hover:bg-slate-50"
                }`}
              >
                <span className="block text-xs font-extrabold uppercase text-slate-500">
                  {option.summaryLabel}
                </span>
                <span className="mt-1 block text-2xl font-black text-primary">
                  {userCounts[option.value]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(260px,1fr)_220px_220px]">
          <label className="relative block">
            <span className="sr-only">
              Tìm theo tên, email hoặc số điện thoại
            </span>
            <Search
              size={19}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
            />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-11 text-sm font-semibold text-primary outline-none transition placeholder:text-slate-400 focus:border-secondary focus:ring-4 focus:ring-secondary/10"
              placeholder="Tìm theo tên, email hoặc số điện thoại..."
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword("")}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-primary"
                aria-label="Xóa nội dung tìm kiếm"
                title="Xóa tìm kiếm"
              >
                <X size={17} />
              </button>
            )}
          </label>

          <label className="block">
            <span className="sr-only">Lọc trạng thái người dùng</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as UserStatusFilter)
              }
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
            >
              {userStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({userCounts[option.value]})
                </option>
              ))}
            </select>
          </label>

          <label className="relative block">
            <span className="sr-only">Sắp xếp danh sách người dùng</span>
            <ArrowUpDown
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as UserSort)}
              className="min-h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-sm font-extrabold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
            >
              {userSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="rounded-t-lg bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
            <tr>
              <th className="w-[44%] px-3 py-4 sm:w-[40%] lg:w-[30%] lg:px-4">
                Người dùng
              </th>
              <th className="hidden w-[18%] px-3 py-4 md:table-cell lg:px-4">
                Hồ sơ giấy tờ
              </th>
              <th className="hidden w-[13%] px-3 py-4 lg:table-cell lg:px-4">
                Vai trò
              </th>
              <th className="w-[36%] px-3 py-4 sm:w-[28%] md:w-[20%] lg:w-[16%] lg:px-4">
                Trạng thái
              </th>
              <th className="hidden w-[14%] px-3 py-4 xl:table-cell xl:px-4">
                Ngày tạo
              </th>
              <th className="w-12 px-2 py-4 text-center">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                  Đang tải danh sách user...
                </td>
              </tr>
            )}

            {!loading &&
              visibleUsers.map((user) => (
                <tr
                  key={user._id}
                  onClick={() => openDetail(user)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDetail(user);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  title="Nhấn để xem chi tiết người dùng"
                  className="group cursor-pointer align-top transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <td className="px-3 py-4 lg:px-4">
                    <p className="break-words font-extrabold text-primary">
                      {user.name}
                    </p>
                    <p className="mt-1 break-all text-xs font-semibold text-slate-500">
                      {user.email}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {user.phone || "Chưa có số điện thoại"}
                    </p>
                    <p className="mt-1 hidden text-xs font-semibold text-slate-400 lg:block xl:hidden">
                      Tạo ngày {formatDate(user.createdAt)}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-400 lg:hidden">
                      <span>{getRoleLabel(user.role)}</span>
                      <span className="xl:hidden">
                        Tạo ngày {formatDate(user.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-400 md:hidden">
                      Hồ sơ định danh: {getIdentityVerificationLabel(user)}
                    </p>
                  </td>

                  <td className="hidden px-3 py-4 md:table-cell lg:px-4">
                    <AdminStatusBadge
                      tone={getIdentityVerificationTone(user)}
                      label={getIdentityVerificationLabel(user)}
                    />
                  </td>

                  <td className="hidden px-3 py-4 lg:table-cell lg:px-4">
                    <AdminStatusBadge tone="blue" label={getRoleLabel(user.role)} />
                  </td>

                  <td className="px-3 py-4 lg:px-4">
                    <AdminStatusBadge
                      tone={user.isBlocked ? "red" : "green"}
                      label={user.isBlocked ? "Đã khóa" : "Hoạt động"}
                    />
                  </td>

                  <td className="hidden px-3 py-4 text-slate-600 xl:table-cell xl:px-4">
                    {formatDate(user.createdAt)}
                  </td>

                  <td className="px-2 py-3 text-center">
                    <AdminUserActions
                      userName={user.name}
                      isBlocked={user.isBlocked}
                      variant="desktop"
                      onView={() => openDetail(user)}
                      onToggleBlock={() =>
                        openAction(user.isBlocked ? "unblock" : "block", user)
                      }
                      onDelete={() => openAction("delete", user)}
                    />
                  </td>
                </tr>
              ))}

            {!loading && visibleUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                  Không có user phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="space-y-4 lg:hidden">
        {loading && (
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500">
            Đang tải danh sách người dùng...
          </div>
        )}

        {!loading &&
          visibleUsers.map((user) => {
            const avatarUrl = normalizeImageUrl(user.avatar);

            return (
              <article
                key={user._id}
                className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
              >
                <div className="absolute right-3 top-3 z-20">
                  <AdminUserActions
                    userName={user.name}
                    isBlocked={user.isBlocked}
                    variant="mobile"
                    onView={() => openDetail(user)}
                    onToggleBlock={() =>
                      openAction(user.isBlocked ? "unblock" : "block", user)
                    }
                    onDelete={() => openAction("delete", user)}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => openDetail(user)}
                  className="block w-full text-left focus:outline-none focus:ring-4 focus:ring-inset focus:ring-secondary/30"
                  aria-label={`Xem chi tiết người dùng ${user.name}`}
                >
                  <div className="flex items-center gap-4 bg-primary p-4 pr-16 text-white">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={`Ảnh đại diện ${user.name}`}
                        className="h-16 w-16 shrink-0 rounded-full border-2 border-white/20 bg-white object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-secondary">
                        <UserRound size={28} />
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-extrabold">
                        {user.name}
                      </h3>
                      <p className="mt-1 truncate text-xs font-semibold text-white/65">
                        Mã: {user._id}
                      </p>
                      <div className="mt-2">
                        <AdminStatusBadge
                          tone={user.isBlocked ? "red" : "green"}
                          label={user.isBlocked ? "Đã khóa" : "Hoạt động"}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex min-w-0 items-start gap-2 text-slate-600">
                      <Mail size={17} className="mt-0.5 shrink-0 text-secondary" />
                      <span className="break-all text-sm font-semibold">
                        {user.email}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex min-w-0 items-start gap-2 text-slate-600">
                        <Phone size={17} className="mt-0.5 shrink-0 text-secondary" />
                        <span className="text-sm font-semibold">
                          {user.phone || "Chưa có số điện thoại"}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-start gap-2 text-slate-600">
                        <CalendarDays
                          size={17}
                          className="mt-0.5 shrink-0 text-secondary"
                        />
                        <span className="text-sm font-semibold">
                          Tạo ngày {formatDate(user.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <AdminStatusBadge
                        tone="blue"
                        label={getRoleLabel(user.role)}
                      />
                      <AdminStatusBadge
                        tone={getIdentityVerificationTone(user)}
                        label={getIdentityVerificationLabel(user)}
                      />
                    </div>
                  </div>
                </button>
              </article>
            );
          })}

        {!loading && visibleUsers.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500">
            Không tìm thấy người dùng phù hợp.
          </div>
        )}
      </section>

      <AdminModal
        open={!!detailUserId}
        title="Thông tin người dùng"
        description={
          detailUser
            ? `${detailUser.name} · ${detailUser.email}`
            : "Hồ sơ tài khoản và giấy tờ xác minh"
        }
        cancelText="Đóng"
        onClose={closeDetail}
      >
        {detailLoading && (
          <div className="py-12 text-center font-semibold text-slate-500">
            Đang tải thông tin người dùng...
          </div>
        )}

        {!detailLoading && detailError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {detailError}
          </div>
        )}

        {!detailLoading && detailUser && (
          <div className="space-y-6">
            <section className="flex flex-col gap-4 rounded-lg bg-primary p-5 text-white sm:flex-row sm:items-center">
              {detailAvatarUrl ? (
                <img
                  src={detailAvatarUrl}
                  alt={`Ảnh đại diện ${detailUser.name}`}
                  className="h-20 w-20 shrink-0 rounded-full border-2 border-white/20 bg-white object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-secondary">
                  <UserRound size={34} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold uppercase tracking-wider text-white/60">
                  Mã người dùng: {detailUser._id}
                </p>
                <h3 className="mt-1 break-words text-2xl font-extrabold">
                  {detailUser.name}
                </h3>
                <p className="mt-1 break-all text-sm font-semibold text-white/75">
                  {detailUser.email}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AdminStatusBadge
                    tone={detailUser.isBlocked ? "red" : "green"}
                    label={detailUser.isBlocked ? "Đã khóa" : "Đang hoạt động"}
                  />
                  <AdminStatusBadge
                    tone={detailUser.isVerified ? "green" : "yellow"}
                    label={
                      detailUser.isVerified
                        ? "Email đã xác minh"
                        : "Email chưa xác minh"
                    }
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-base font-extrabold text-primary">
                Thông tin tài khoản
              </h3>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <DetailField label="Họ và tên" value={detailUser.name} />
                <DetailField label="Vai trò" value={getRoleLabel(detailUser.role)} />
                <DetailField label="Email" value={detailUser.email} />
                <DetailField label="Số điện thoại" value={detailUser.phone} />
                <DetailField
                  label="Ngày tạo tài khoản"
                  value={formatDateTime(detailUser.createdAt)}
                />
                <DetailField
                  label="Cập nhật gần nhất"
                  value={formatDateTime(detailUser.updatedAt)}
                />
              </dl>
            </section>

            <section>
              <h3 className="text-base font-extrabold text-primary">
                Địa chỉ và giới thiệu
              </h3>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <DetailField label="Địa chỉ chi tiết" value={detailUser.address} />
                <DetailField label="Phường/Xã" value={detailUser.ward} />
                <DetailField label="Quận/Huyện" value={detailUser.district} />
                <DetailField
                  label="Tỉnh/Thành phố"
                  value={detailUser.city || detailUser.province}
                />
                <div className="sm:col-span-2">
                  <DetailField label="Địa chỉ đầy đủ" value={formatAddress(detailUser)} />
                </div>
                <div className="sm:col-span-2">
                  <DetailField label="Giới thiệu" value={detailUser.bio} />
                </div>
              </dl>
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-extrabold text-primary">
                  CCCD và giấy phép lái xe
                </h3>
                <AdminStatusBadge
                  tone={getIdentityVerificationTone(detailUser)}
                  label={getIdentityVerificationLabel(detailUser)}
                />
              </div>

              {getIdentityVerificationStatus(detailUser) === "REJECTED" && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  Lý do từ chối: {detailUser.identityVerificationReason || "--"}
                </p>
              )}

              {getIdentityVerificationStatus(detailUser) === "PENDING" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openAction("identity-approve", detailUser)}
                    className="min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-extrabold text-white transition hover:bg-emerald-700"
                  >
                    Duyệt hồ sơ
                  </button>
                  <button
                    type="button"
                    onClick={() => openAction("identity-reject", detailUser)}
                    className="min-h-10 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-extrabold text-red-700 transition hover:bg-red-100"
                  >
                    Từ chối
                  </button>
                </div>
              )}

              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <DetailField label="Số CCCD" value={detailUser.cccdNumber} />
                <DetailField
                  label="Số GPLX"
                  value={detailUser.driverLicenseNumber}
                />
                <DetailField
                  label="Hạng GPLX"
                  value={detailUser.driverLicenseClass}
                />
              </dl>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {identityDocumentItems.map((document) => {
                  const previewUrl = identityDocumentUrls[document.field];

                  return (
                    <div
                      key={document.field}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                    >
                      <p className="border-b border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-primary">
                        {document.label}
                      </p>

                      {previewUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setIdentityDocumentPreview({
                              label: document.label,
                              url: previewUrl,
                            })
                          }
                          className="group block w-full text-left"
                          aria-label={`Xem phóng to ${document.label}`}
                        >
                          <img
                            src={previewUrl}
                            alt={document.label}
                            className="h-40 w-full object-cover blur-sm transition duration-200 group-hover:scale-[1.02] group-hover:blur-[1px]"
                          />
                          <span className="block border-t border-slate-200 bg-white px-3 py-2 text-center text-xs font-extrabold text-secondaryDark">
                            Ảnh được làm mờ · Nhấn để xem rõ
                          </span>
                        </button>
                      ) : (
                        <div className="flex h-40 items-center justify-center px-4 text-center text-sm font-semibold text-slate-400">
                          {detailDocumentsLoading && document.path
                            ? "Đang tải ảnh..."
                            : document.path
                              ? "Không thể tải ảnh"
                              : "Chưa cập nhật"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-400">
                Ảnh giấy tờ là dữ liệu riêng tư, chỉ chính người dùng và quản trị viên
                được phép truy cập.
              </p>
            </section>

            <section>
              <h3 className="text-base font-extrabold text-primary">
                Trạng thái quản trị
              </h3>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <DetailField
                  label="Trạng thái"
                  value={detailUser.isBlocked ? "Đã khóa" : "Đang hoạt động"}
                />
                <DetailField
                  label="Thời gian khóa"
                  value={formatDateTime(detailUser.blockedAt)}
                />
                <DetailField
                  label="Người thực hiện khóa"
                  value={getBlockedByLabel(detailUser)}
                />
                <DetailField label="Lý do khóa" value={detailUser.blockedReason} />
              </dl>
            </section>
          </div>
        )}
      </AdminModal>

      <AdminModal
        open={!!identityDocumentPreview}
        title={identityDocumentPreview?.label || "Ảnh giấy tờ"}
        description="Ảnh giấy tờ chỉ hiển thị cho quản trị viên phục vụ xác minh hồ sơ."
        cancelText="Đóng"
        onClose={() => setIdentityDocumentPreview(null)}
      >
        {identityDocumentPreview && (
          <img
            src={identityDocumentPreview.url}
            alt={identityDocumentPreview.label}
            className="mx-auto max-h-[68vh] w-auto max-w-full rounded-lg object-contain"
          />
        )}
      </AdminModal>

      <AdminModal
        open={!!action}
        title={modalTitle}
        description={
          action
            ? `Tài khoản: ${action?.user.name} (${action?.user.email})`
            : undefined
        }
        confirmText={
          action?.type === "unblock"
            ? "Mở khóa"
            : action?.type === "delete"
              ? "Xóa tài khoản"
              : action?.type === "identity-approve"
                ? "Duyệt hồ sơ"
                : action?.type === "identity-reject"
                  ? "Từ chối hồ sơ"
                  : "Khóa tài khoản"
        }
        danger={action?.type === "delete" || action?.type === "identity-reject"}
        loading={submitting}
        onClose={closeAction}
        onConfirm={confirmAction}
      >
        {action?.type === "identity-approve" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {normalizeImageUrl(action.user.avatar) ? (
                <img
                  src={normalizeImageUrl(action.user.avatar)}
                  alt={`Ảnh đại diện ${action.user.name}`}
                  className="h-14 w-14 rounded-full border-2 border-white bg-white object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-secondary">
                  <UserRound size={24} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-primary">{action.user.name}</p>
                <p className="truncate text-sm font-semibold text-slate-500">{action.user.email}</p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-amber-700">
                Xác nhận thông tin hồ sơ
              </p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <DetailField label="Trạng thái" value={getIdentityVerificationLabel(action.user)} />
                <DetailField label="Số CCCD" value={action.user.cccdNumber} />
                <DetailField label="Số GPLX" value={action.user.driverLicenseNumber} />
                <DetailField label="Hạng GPLX" value={action.user.driverLicenseClass} />
                <DetailField
                  label="CCCD trước / sau"
                  value={
                    action.user.cccdFrontImage && action.user.cccdBackImage
                      ? "Đã tải đủ"
                      : "Thiếu ảnh"
                  }
                />
                <DetailField
                  label="Ảnh GPLX"
                  value={action.user.driverLicenseImage ? "Đã tải" : "Thiếu ảnh"}
                />
              </dl>
            </div>
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-800">
              Sau khi duyệt, người dùng có thể tạo booking mới. Hệ thống sẽ gửi thông báo xác minh thành công đến tài khoản này.
            </p>
          </div>
        )}

        {(action?.type === "block" ||
          action?.type === "delete" ||
          action?.type === "identity-reject") && (
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              {action?.type === "identity-reject" ? "Lý do từ chối *" : "Lý do"}
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-secondary"
              placeholder={
                action?.type === "identity-reject"
                  ? "Nhập lý do để người dùng cập nhật lại giấy tờ..."
                  : "Nhập lý do thao tác..."
              }
            />
          </label>
        )}
      </AdminModal>
    </div>
  );
}








