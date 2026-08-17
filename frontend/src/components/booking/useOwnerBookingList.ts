// Hook quản lý danh sách booking của người dùng có xe ký gửi.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { BOOKING_STATUSES, type BookingStatus } from "../../constants/status.constants";
import { ownerBookingService } from "../../services/ownerBooking.service";
import type {
  OwnerBookingDetail,
  OwnerBookingAction,
  OwnerBookingGroup,
  OwnerBookingListResponse,
  OwnerBookingSort,
} from "../../types/ownerBooking";

const GROUPS: OwnerBookingGroup[] = ["ALL", "ACTION_REQUIRED", "UPCOMING", "ACTIVE", "COMPLETED", "CLOSED"];
const SORTS: OwnerBookingSort[] = ["newest", "oldest", "pickup_asc", "pickup_desc"];
const ACTIONS: OwnerBookingAction[] = [
  "approve",
  "reject",
  "no-show",
  "cancel",
  "handover",
  "return",
  "inspection",
  "extra-charge",
  "confirm-remaining",
];

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown; data?: unknown } } }).response;
    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") return response.data.message;
  }
  return fallback;
}

export function useOwnerBookingList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const querySearch = searchParams.get("search") || "";
  const rawStatus = searchParams.get("status") || "";
  const rawGroup = searchParams.get("group") || "ALL";
  const rawSort = searchParams.get("sort") || "newest";
  const rawPage = Number(searchParams.get("page"));
  const status = BOOKING_STATUSES.includes(rawStatus as BookingStatus) ? (rawStatus as BookingStatus) : "";
  const group = GROUPS.includes(rawGroup as OwnerBookingGroup) ? (rawGroup as OwnerBookingGroup) : "ALL";
  const sort = SORTS.includes(rawSort as OwnerBookingSort) ? (rawSort as OwnerBookingSort) : "newest";
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const bookingId = searchParams.get("bookingId") || "";
  const rawAction = searchParams.get("action") || "";
  const action = ACTIONS.includes(rawAction as OwnerBookingAction)
    ? (rawAction as OwnerBookingAction)
    : null;
  const [searchInput, setSearchInput] = useState(querySearch);
  const [result, setResult] = useState<OwnerBookingListResponse>({
    bookings: [],
    groupCounts: {
      ALL: 0,
      ACTION_REQUIRED: 0,
      UPCOMING: 0,
      ACTIVE: 0,
      COMPLETED: 0,
      CLOSED: 0,
    },
    pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [detail, setDetail] = useState<OwnerBookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailRetryKey, setDetailRetryKey] = useState(0);

  const updateQuery = useCallback((updates: Record<string, string | null>, replace = false) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === "ALL" || (key === "sort" && value === "newest") || (key === "page" && value === "1")) next.delete(key);
        else next.set(key, value);
      });
      return next;
    }, { replace });
  }, [setSearchParams]);

  useEffect(() => {
    queueMicrotask(() => setSearchInput(querySearch));
  }, [querySearch]);

  useEffect(() => {
    if (rawAction && !action) updateQuery({ action: null }, true);
  }, [action, rawAction, updateQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = searchInput.trim();
      if (normalized !== querySearch) updateQuery({ search: normalized || null, page: null });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [querySearch, searchInput, updateQuery]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
    });
    ownerBookingService.getBookings({ search: querySearch, status, group, sort, page, limit: 10 })
      .then((data) => {
        if (!active) return;
        setResult(data);
        if (data.pagination.totalPages > 0 && page > data.pagination.totalPages) updateQuery({ page: String(data.pagination.totalPages) }, true);
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError, "Không thể tải danh sách booking."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [group, page, querySearch, retryKey, sort, status, updateQuery]);

  useEffect(() => {
    let active = true;
    if (!bookingId) {
      queueMicrotask(() => {
        if (!active) return;
        setDetail(null);
        setDetailError("");
      });
      return () => { active = false; };
    }
    queueMicrotask(() => {
      if (!active) return;
      setDetail(null);
      setDetailLoading(true);
      setDetailError("");
    });
    ownerBookingService.getBookingDetail(bookingId)
      .then((data) => { if (active) setDetail(data); })
      .catch((requestError: unknown) => {
        if (active) setDetailError(getErrorMessage(requestError, "Không thể mở chi tiết booking này."));
      })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [bookingId, detailRetryKey]);

  return useMemo(() => ({
    result, loading, error, searchInput, setSearchInput, status, group, sort, page, bookingId, action,
    detail, detailLoading, detailError,
    setStatus: (value: BookingStatus | "") => updateQuery({ status: value || null, group: null, page: null }),
    setGroup: (value: OwnerBookingGroup) => updateQuery({ group: value, status: null, page: null }),
    setSort: (value: OwnerBookingSort) => updateQuery({ sort: value, page: null }),
    setPage: (value: number) => updateQuery({ page: String(value) }),
    reset: () => {
      setSearchInput("");
      updateQuery({ search: null, status: null, group: null, sort: null, page: null });
    },
    retry: () => setRetryKey((value) => value + 1),
    refresh: () => {
      setRetryKey((value) => value + 1);
      setDetailRetryKey((value) => value + 1);
    },
    openDetail: (id: string) => updateQuery({ bookingId: id, action: null }),
    openAction: (id: string, value: OwnerBookingAction) =>
      updateQuery({ bookingId: id, action: value }),
    closeAction: () => updateQuery({ action: null }),
    closeDetail: () => updateQuery({ bookingId: null, action: null }),
  }), [action, bookingId, detail, detailError, detailLoading, error, group, loading, page, result, searchInput, sort, status, updateQuery]);
}
