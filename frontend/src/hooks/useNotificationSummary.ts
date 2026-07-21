import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NOTIFICATION_REFRESH_EVENT,
  notificationService,
  type NotificationSummary,
} from "../services/notification.service";

const EMPTY_SUMMARY: NotificationSummary = {
  total: 0,
  items: [],
};

type UseNotificationSummaryOptions = {
  enabled?: boolean;
  pollingMs?: number;
};

export function useNotificationSummary({
  enabled = true,
  pollingMs = 45000,
}: UseNotificationSummaryOptions = {}) {
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSummary(EMPTY_SUMMARY);
      return;
    }

    try {
      setLoading(true);
      setSummary(await notificationService.getSummary());
    } catch {
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleRefresh = () => void refresh();
    const initialTimer = window.setTimeout(handleRefresh, 0);

    window.addEventListener(NOTIFICATION_REFRESH_EVENT, handleRefresh);

    const timer =
      pollingMs > 0 ? window.setInterval(handleRefresh, pollingMs) : undefined;

    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener(NOTIFICATION_REFRESH_EVENT, handleRefresh);
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [enabled, pollingMs, refresh]);

  const countsByKey = useMemo(() => {
    return summary.items.reduce<Record<string, number>>((map, item) => {
      map[item.key] = item.count;
      return map;
    }, {});
  }, [summary.items]);

  const getCount = useCallback(
    (keys: string | string[]) => {
      const targetKeys = Array.isArray(keys) ? keys : [keys];
      return targetKeys.reduce((sum, key) => sum + (countsByKey[key] || 0), 0);
    },
    [countsByKey],
  );

  return {
    summary,
    items: summary.items,
    total: summary.actionRequiredCount ?? summary.total,
    actionRequiredCount: summary.actionRequiredCount ?? summary.total,
    waitingCount: summary.waitingCount ?? 0,
    highPriorityCount: summary.highPriorityCount ?? 0,
    topTasks: summary.topTasks || [],
    loading,
    refresh,
    getCount,
  };
}




