// Shared owner UI: car list toolbar for BUSINESS and USER consignment management.
import { ArrowUpDown, Search, X } from "lucide-react";

import {
  OWNER_CAR_SORT_OPTIONS,
  OWNER_CAR_STATUS_OPTIONS,
  type OwnerCarSort,
  type OwnerCarStatusCounts,
  type OwnerCarStatusFilter,
} from "../../utils/ownerCarList.util";

type OwnerCarListToolbarProps = {
  search: string;
  status: OwnerCarStatusFilter;
  sort: OwnerCarSort;
  counts: OwnerCarStatusCounts;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: OwnerCarStatusFilter) => void;
  onSortChange: (value: OwnerCarSort) => void;
};

export default function OwnerCarListToolbar({
  search,
  status,
  sort,
  counts,
  onSearchChange,
  onStatusChange,
  onSortChange,
}: OwnerCarListToolbarProps) {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {OWNER_CAR_STATUS_OPTIONS.map((option) => {
          const active = status === option.value;
          const summaryLabel =
            option.value === "ALL"
              ? "Tổng số xe"
              : option.value === "RENTED"
                ? "Đang thuê"
                : option.label;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onStatusChange(option.value)}
              aria-pressed={active}
              className={`min-h-20 rounded-lg border px-4 py-3 text-left transition ${
                active
                  ? "border-secondary bg-secondarySoft shadow-sm ring-2 ring-secondary/20"
                  : "border-slate-200 bg-white hover:border-secondary/60 hover:bg-slate-50"
              }`}
            >
              <span className="block text-xs font-extrabold uppercase text-slate-500">
                {summaryLabel}
              </span>
              <span className="mt-1 block text-2xl font-black text-primary">
                {counts[option.value]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(260px,1fr)_220px_250px]">
        <label className="relative block">
          <span className="sr-only">Tìm theo mã xe, tên xe hoặc biển số</span>
          <Search
            size={19}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Tìm theo mã xe, tên xe hoặc biển số..."
            className="min-h-11 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-11 text-sm font-semibold text-primary outline-none transition placeholder:text-slate-400 focus:border-secondary focus:ring-4 focus:ring-secondary/10"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-primary"
              aria-label="Xóa nội dung tìm kiếm"
              title="Xóa tìm kiếm"
            >
              <X size={17} />
            </button>
          )}
        </label>

        <label className="block">
          <span className="sr-only">Lọc trạng thái xe</span>
          <select
            value={status}
            onChange={(event) =>
              onStatusChange(event.target.value as OwnerCarStatusFilter)
            }
            className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
          >
            {OWNER_CAR_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({counts[option.value]})
              </option>
            ))}
          </select>
        </label>

        <label className="relative block">
          <span className="sr-only">Sắp xếp danh sách xe</span>
          <ArrowUpDown
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
          />
          <select
            value={sort}
            onChange={(event) =>
              onSortChange(event.target.value as OwnerCarSort)
            }
            className="min-h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-sm font-extrabold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
          >
            {OWNER_CAR_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
