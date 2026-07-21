export type AdminStatusBadgeTone = "green" | "red" | "yellow" | "blue" | "gray";

type AdminStatusBadgeProps = {
  tone?: AdminStatusBadgeTone;
  label: string;
};

const toneClass: Record<AdminStatusBadgeTone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  yellow: "bg-yellow-50 text-amber-700 ring-yellow-200",
  blue: "bg-primary text-secondary ring-primary",
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
};

export default function AdminStatusBadge({
  tone = "gray",
  label,
}: AdminStatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}
