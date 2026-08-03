import { Car, Gauge, MapPin } from "lucide-react";

import AdminStatusBadge from "../admin/AdminStatusBadge";
import { getCarStatusMeta } from "../../utils/display.util";
import { isOwnerCarHidden } from "../../utils/ownerCarList.util";
import OwnerCarActions from "./OwnerCarActions";

type MobileCar = {
  _id: string;
  carCode?: string | null;
  name: string;
  licensePlate?: string;
  brandId?: { name?: string } | null;
  images?: string[];
  status?: string;
  currentOdometerKm?: number | null;
  isHidden?: boolean;
  hiddenByOwner?: boolean;
  hiddenByAdmin?: boolean;
};

type OwnerCarMobileCardProps = {
  car: MobileCar;
  priceText: string;
  areaText: string;
  visibilityLoading?: boolean;
  onView: () => void;
  onEdit: () => void;
  onManageLocation: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
  onResubmit: () => void;
};

function formatOdometer(value?: number | null) {
  return value === null || value === undefined
    ? "Chưa cập nhật"
    : `${new Intl.NumberFormat("vi-VN").format(value)} km`;
}

export default function OwnerCarMobileCard({
  car,
  priceText,
  areaText,
  visibilityLoading,
  onView,
  onEdit,
  onManageLocation,
  onToggleVisibility,
  onDelete,
  onResubmit,
}: OwnerCarMobileCardProps) {
  const status = getCarStatusMeta(car.status);
  const hidden = isOwnerCarHidden(car);

  return (
    <article className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="absolute right-3 top-3 z-20">
        <OwnerCarActions
          car={car}
          variant="mobile"
          visibilityLoading={visibilityLoading}
          onView={onView}
          onEdit={onEdit}
          onManageLocation={onManageLocation}
          onToggleVisibility={onToggleVisibility}
          onDelete={onDelete}
          onResubmit={onResubmit}
        />
      </div>

      <button
        type="button"
        onClick={onView}
        className="block w-full text-left focus:outline-none focus:ring-4 focus:ring-inset focus:ring-secondary/30"
        aria-label={`Xem chi tiết xe ${car.name}`}
      >
        <div className="relative flex aspect-[16/7] items-center justify-center overflow-hidden bg-slate-100">
          {car.images?.[0] ? (
            <img
              src={car.images[0]}
              alt={car.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Car size={34} className="text-slate-400" />
          )}
          <div className="absolute left-3 top-3 flex max-w-[calc(100%-4.5rem)] flex-wrap gap-2">
            <AdminStatusBadge tone={status.tone} label={status.label} />
            {hidden && <AdminStatusBadge tone="gray" label="Đang ẩn" />}
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-extrabold text-primary">
                {car.name}
              </h3>
              <p className="mt-1 truncate font-mono text-xs font-extrabold text-amber-700">
                Mã xe: {car.carCode || "Chưa được cấp"}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {car.licensePlate || "Chưa có biển số"} ·{" "}
                {car.brandId?.name || "Chưa có hãng"}
              </p>
            </div>
            <p className="shrink-0 text-right text-sm font-extrabold text-primary">
              {priceText}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex min-w-0 items-start gap-2 text-slate-600">
              <Gauge size={17} className="mt-0.5 shrink-0 text-secondary" />
              <span className="font-semibold">
                ODO: {formatOdometer(car.currentOdometerKm)}
              </span>
            </div>
            <div className="flex min-w-0 items-start gap-2 text-slate-600">
              <MapPin size={17} className="mt-0.5 shrink-0 text-secondary" />
              <span className="line-clamp-2 font-semibold">{areaText}</span>
            </div>
          </div>
        </div>
      </button>

    </article>
  );
}
