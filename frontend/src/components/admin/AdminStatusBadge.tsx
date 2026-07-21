type AdminStatusBadgeProps = {
  tone?: "green" | "red" | "yellow" | "blue" | "gray";
  label: string;
};

const toneClass = {
  green: "bg-secondarySoft text-primary ring-secondary/40",
  red: "bg-slate-100 text-slate-800 ring-slate-300",
  yellow: "bg-secondarySoft text-primary ring-secondary/50",
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


