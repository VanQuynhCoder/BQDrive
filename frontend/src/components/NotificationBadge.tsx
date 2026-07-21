type NotificationBadgeProps = {
  count: number;
  className?: string;
  title?: string;
};

export default function NotificationBadge({
  count = 0,
  className = "",
  title,
}: NotificationBadgeProps) {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-extrabold leading-none text-white shadow-sm ${className}`}
      title={title}
      aria-label={title || `${count} thông báo`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}




