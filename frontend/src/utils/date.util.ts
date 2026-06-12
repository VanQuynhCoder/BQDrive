const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const VIETNAM_OFFSET = "+07:00";

export function buildVietnamDateTime(date: string, time: string) {
  return `${date}T${time}:00${VIETNAM_OFFSET}`;
}

export function getVietnamTodayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatVietnamDateTime(
  value?: string,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString("vi-VN", {
    timeZone: VIETNAM_TIME_ZONE,
    ...options,
  });
}
