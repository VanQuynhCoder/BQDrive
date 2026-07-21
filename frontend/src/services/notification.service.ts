import api from "./api";

export const NOTIFICATION_REFRESH_EVENT = "bqdrive:notifications-refresh";

export type NotificationSeverity = "info" | "warning" | "danger" | "success";

export type NotificationSummaryItem = {
  key: string;
  label: string;
  count: number;
  path: string;
  severity: NotificationSeverity;
};

export type NotificationSummary = {
  total: number;
  items: NotificationSummaryItem[];
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

export const notificationService = {
  getSummary: async () => {
    const res = await api.get("/notifications/summary");
    return unwrap<NotificationSummary>(res);
  },
};


