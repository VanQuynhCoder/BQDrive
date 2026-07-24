import api from "./api";

export const NOTIFICATION_REFRESH_EVENT = "bqdrive:notifications-refresh";
export const NOTIFICATION_CENTER_REFRESH_EVENT =
  "bqdrive:notification-center-refresh";

export type NotificationSeverity = "info" | "warning" | "danger" | "success";
export type TaskGroup = "ACTION_REQUIRED" | "WAITING";
export type TaskPriority = "HIGH" | "MEDIUM" | "LOW";
export type TaskContext = "admin" | "business" | "customer" | "consignment";

export type ActionCenterTask = {
  id: string;
  type: string;
  summaryKey: string;
  context: TaskContext;
  group: TaskGroup;
  priority: TaskPriority;
  title: string;
  description: string;
  detail?: string;
  entityType: "BOOKING" | "CAR" | "BUSINESS" | "REVIEW";
  entityId: string;
  bookingId?: string;
  carId?: string;
  actionKey: string;
  actionLabel: string;
  actionUrl: string;
  dueAt?: string | null;
  isOverdue?: boolean;
  createdAt?: string | null;
  metadata?: {
    bookingCode?: string;
    carName?: string;
    licensePlate?: string;
    carImage?: string;
    startDate?: string;
    endDate?: string;
    totalPrice?: number;
    paidAmount?: number;
    remainingAmount?: number;
    deliveryType?: string;
    deliveryLabel?: string;
    deliveryAddress?: string;
    deliveryDistanceKm?: number;
    deliveryDurationText?: string;
    deliveryFee?: number;
    pendingExtraChargeAmount?: number;
    pendingExtraChargeCount?: number;
    renterName?: string;
    renterEmail?: string;
    ownerName?: string;
    businessName?: string;
    phone?: string;
    [key: string]: unknown;
  };
};

export type NotificationSummaryItem = {
  key: string;
  label: string;
  count: number;
  path: string;
  severity: NotificationSeverity;
};

export type NotificationSummary = {
  total: number;
  actionRequiredCount?: number;
  waitingCount?: number;
  highPriorityCount?: number;
  items: NotificationSummaryItem[];
  topTasks?: ActionCenterTask[];
};

export type ActionCenterResponse = {
  summary: {
    actionRequiredCount: number;
    waitingCount: number;
    highPriorityCount: number;
    totalCount: number;
  };
  tasks: ActionCenterTask[];
};

export type PersistentNotification = {
  _id: string;
  recipientId: string;
  recipientRole: "ADMIN" | "BUSINESS" | "USER";
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId?: string;
  bookingId?: string;
  carId?: string;
  actionKey?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  updatedAt?: string;
};

export type NotificationListResponse = {
  items: PersistentNotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  unreadCount: number;
};

export type NotificationQuery = {
  page?: number;
  limit?: number;
  isRead?: boolean;
  type?: string;
};

type ApiData<T> = {
  data: T;
};

function unwrap<T>(response: { data: ApiData<T> }) {
  return response.data.data;
}

export function notifyNotificationSummaryChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATION_REFRESH_EVENT));
  }
}

export function notifyNotificationCenterChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATION_CENTER_REFRESH_EVENT));
  }
}

export const notificationService = {
  getSummary: async () => {
    const res = await api.get("/notifications/summary");
    return unwrap<NotificationSummary>(res);
  },
  getTasks: async (context?: TaskContext) => {
    const res = await api.get("/tasks", {
      params: context ? { context } : undefined,
    });
    return unwrap<ActionCenterResponse>(res);
  },
  getNotifications: async (params?: NotificationQuery) => {
    const res = await api.get("/notifications", { params });
    return unwrap<NotificationListResponse>(res);
  },
  getUnreadCount: async () => {
    const res = await api.get("/notifications/unread-count");
    return unwrap<{ unreadCount: number }>(res);
  },
  markRead: async (notificationId: string) => {
    const res = await api.patch(`/notifications/${notificationId}/read`);
    const data = unwrap<{ notification: PersistentNotification }>(res);
    notifyNotificationCenterChanged();
    return data.notification;
  },
  markAllRead: async () => {
    const res = await api.patch("/notifications/read-all");
    const data = unwrap<{ modifiedCount: number }>(res);
    notifyNotificationCenterChanged();
    return data;
  },
  deleteNotification: async (notificationId: string) => {
    const res = await api.delete(`/notifications/${notificationId}`);
    const data = unwrap<{ notificationId: string }>(res);
    notifyNotificationCenterChanged();
    return data;
  },
};


