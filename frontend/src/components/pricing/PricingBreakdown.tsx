import type {
  PricingBreakdownItem,
  PricingDateType,
  PricingSnapshot,
} from "../../types/pricing";
import {
  formatCurrency,
  hasPricingNumber,
} from "../../utils/pricing.util";

type PricingBreakdownProps = {
  snapshot?: PricingSnapshot | null;
  showPolicySummary?: boolean;
  className?: string;
  embedded?: boolean;
};

const priceTypeLabels: Record<PricingDateType, string> = {
  WEEKDAY: "Ngày thường",
  WEEKEND: "Cuối tuần",
  HOLIDAY: "Ngày lễ",
};

function formatDateOrTime(item: PricingBreakdownItem) {
  const dateOnlyMatch = item.dateOrTime.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;
  }

  const value = new Date(item.dateOrTime);
  if (Number.isNaN(value.getTime())) return item.dateOrTime;

  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function SurchargeValue({ value }: { value?: number }) {
  if (!hasPricingNumber(value)) {
    return <span>Chưa cập nhật</span>;
  }

  return value === 0 ? (
    <span>Không phụ thu</span>
  ) : (
    <span>+{formatCurrency(value)}</span>
  );
}

export default function PricingBreakdown({
  snapshot,
  showPolicySummary = true,
  className = "",
  embedded = false,
}: PricingBreakdownProps) {
  if (!snapshot) return null;

  const unit = snapshot.rentalMode === "HOURLY" ? "giờ" : "ngày";
  const breakdown = Array.isArray(snapshot.breakdown)
    ? snapshot.breakdown
    : [];
  const subtotal = snapshot.subtotal ?? snapshot.rentalSubtotal;

  return (
    <section
      className={`text-primary ${
        embedded
          ? "border-t border-border pt-4"
          : "rounded-lg border border-border bg-white p-4"
      } ${className}`}
    >
      <div>
        <p className="text-xs font-bold uppercase text-secondary">
          Chi tiết giá thuê
        </p>
        <h3 className="mt-1 text-lg font-extrabold">
          {snapshot.rentalMode === "HOURLY"
            ? "Thuê theo giờ"
            : "Thuê theo ngày"}
        </h3>
      </div>

      {showPolicySummary && (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-soft p-3">
            <dt className="text-muted">Giá cơ bản</dt>
            <dd className="mt-1 font-extrabold">
              {hasPricingNumber(snapshot.basePricePerUnit)
                ? `${formatCurrency(snapshot.basePricePerUnit)}/${unit}`
                : "Chưa cập nhật"}
            </dd>
          </div>
          <div className="rounded-lg bg-soft p-3">
            <dt className="text-muted">Phụ thu cuối tuần</dt>
            <dd className="mt-1 font-extrabold">
              <SurchargeValue value={snapshot.weekendSurchargePerUnit} />
            </dd>
          </div>
          <div className="rounded-lg bg-soft p-3">
            <dt className="text-muted">Phụ thu ngày lễ</dt>
            <dd className="mt-1 font-extrabold">
              <SurchargeValue value={snapshot.holidaySurchargePerUnit} />
            </dd>
          </div>
        </dl>
      )}

      {breakdown.length > 0 ? (
        <div className="mt-4 space-y-2">
          {breakdown.map((item, index) => (
            <div
              key={`${item.dateOrTime}-${item.priceType}-${index}`}
              className={
                embedded
                  ? "border-b border-border py-3 last:border-b-0"
                  : "rounded-lg border border-border px-3 py-3"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-extrabold">{formatDateOrTime(item)}</p>
                  <p className="text-xs font-semibold text-muted">
                    {priceTypeLabels[item.priceType] || item.priceType}
                  </p>
                </div>
                <p className="font-extrabold text-secondary">
                  {formatCurrency(item.price)}
                </p>
              </div>
              <p className="mt-2 text-sm text-muted">
                {formatCurrency(item.basePrice)}
                {item.surchargeAmount > 0
                  ? ` + ${formatCurrency(item.surchargeAmount)}`
                  : " + Không phụ thu"}
                {" = "}
                {formatCurrency(item.finalPrice)}
                {item.unitCount !== 1
                  ? ` × ${new Intl.NumberFormat("vi-VN").format(item.unitCount)} ${unit}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-soft p-3 text-sm font-semibold text-muted">
          Chưa có chi tiết bảng giá cho dữ liệu này.
        </p>
      )}

      {hasPricingNumber(subtotal) && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="font-extrabold">Tổng tiền thuê</span>
          <span className="text-xl font-extrabold text-secondary">
            {formatCurrency(subtotal)}
          </span>
        </div>
      )}
    </section>
  );
}
