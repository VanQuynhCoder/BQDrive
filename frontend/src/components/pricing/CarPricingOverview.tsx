import type { CarPricing } from "../../types/pricing";
import {
  formatCurrency,
  formatCurrencyWithUnit,
  hasPricingNumber,
} from "../../utils/pricing.util";

type CarPricingOverviewProps = {
  pricing?: CarPricing | null;
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  rentalUnit?: string;
  className?: string;
};

function SurchargeRow({
  label,
  value,
  unit,
}: {
  label: string;
  value?: number | null;
  unit: "ngày" | "giờ";
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-extrabold text-primary">
        {!hasPricingNumber(value)
          ? "Chưa cập nhật"
          : value === 0
            ? "Không phụ thu"
            : `+${formatCurrency(value)}/${unit}`}
      </dd>
    </div>
  );
}

function PricingGroup({
  title,
  unit,
  basePrice,
  weekendSurcharge,
  holidaySurcharge,
}: {
  title: string;
  unit: "ngày" | "giờ";
  basePrice?: number | null;
  weekendSurcharge?: number | null;
  holidaySurcharge?: number | null;
}) {
  const weekendEstimated =
    hasPricingNumber(basePrice) && hasPricingNumber(weekendSurcharge)
      ? basePrice + weekendSurcharge
      : null;
  const holidayEstimated =
    hasPricingNumber(basePrice) && hasPricingNumber(holidaySurcharge)
      ? basePrice + holidaySurcharge
      : null;

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <h4 className="text-sm font-extrabold uppercase text-secondary">
        {title}
      </h4>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted">Giá thuê cơ bản</dt>
          <dd className="text-right font-extrabold text-primary">
            {formatCurrencyWithUnit(basePrice, unit)}
          </dd>
        </div>
        <SurchargeRow
          label="Phụ thu cuối tuần"
          value={weekendSurcharge}
          unit={unit}
        />
        <SurchargeRow
          label="Phụ thu ngày lễ"
          value={holidaySurcharge}
          unit={unit}
        />
        <div className="border-t border-border pt-3">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted">Giá cuối tuần dự kiến</dt>
            <dd className="text-right font-extrabold text-primary">
              {formatCurrencyWithUnit(weekendEstimated, unit)}
            </dd>
          </div>
          <div className="mt-3 flex items-start justify-between gap-3">
            <dt className="text-muted">Giá ngày lễ dự kiến</dt>
            <dd className="text-right font-extrabold text-primary">
              {formatCurrencyWithUnit(holidayEstimated, unit)}
            </dd>
          </div>
        </div>
      </dl>
    </div>
  );
}

export default function CarPricingOverview({
  pricing,
  allowDailyRental,
  allowHourlyRental,
  rentalUnit,
  className = "",
}: CarPricingOverviewProps) {
  const showDaily =
    typeof allowDailyRental === "boolean"
      ? allowDailyRental
      : rentalUnit !== "HOUR";
  const showHourly =
    typeof allowHourlyRental === "boolean"
      ? allowHourlyRental
      : rentalUnit === "HOUR";

  return (
    <section className={className}>
      <div className="grid gap-4 lg:grid-cols-2">
        {showDaily && (
          <PricingGroup
            title="Giá thuê theo ngày"
            unit="ngày"
            basePrice={pricing?.basePricePerDay}
            weekendSurcharge={pricing?.weekendSurchargePerDay}
            holidaySurcharge={pricing?.holidaySurchargePerDay}
          />
        )}
        {showHourly && (
          <PricingGroup
            title="Giá thuê theo giờ"
            unit="giờ"
            basePrice={pricing?.basePricePerHour}
            weekendSurcharge={pricing?.weekendSurchargePerHour}
            holidaySurcharge={pricing?.holidaySurchargePerHour}
          />
        )}
      </div>
      {!showDaily && !showHourly && (
        <p className="rounded-lg bg-soft p-4 text-sm font-semibold text-muted">
          Xe chưa cập nhật hình thức thuê và bảng giá.
        </p>
      )}
    </section>
  );
}

