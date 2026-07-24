import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Building2,
  Car,
  Loader2,
  MapPin,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import OwnerCarsMap from "../../components/maps/OwnerCarsMap";
import { adminService } from "../../services/admin.service";
import type { OwnerMapCar } from "../../services/ownerCarLocation.service";
import { getCarStatusMeta, getOwnerTypeLabel } from "../../utils/display.util";

function hasCoordinate(car: OwnerMapCar) {
  return Number.isFinite(Number(car.pickupLat)) && Number.isFinite(Number(car.pickupLng));
}

function getAddress(car: OwnerMapCar) {
  return car.pickupFormattedAddress || car.pickupAddress || "";
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") return response.data.message;
  }

  return "Không tải được bản đồ xe";
}

export default function AdminCarMapPage() {
  const [cars, setCars] = useState<OwnerMapCar[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedCar = useMemo(
    () => cars.find((car) => car._id === selectedCarId) || null,
    [cars, selectedCarId],
  );
  const locatedCars = cars.filter(hasCoordinate).length;

  useEffect(() => {
    let mounted = true;

    const loadCars = async () => {
      setLoading(true);
      try {
        const data = await adminService.getCarsMap();
        if (!mounted) return;
        setCars(data);
        setSelectedCarId(data.find(hasCoordinate)?._id || data[0]?._id || null);
      } catch (error) {
        if (mounted) toast.error(getErrorMessage(error));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadCars();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase text-secondary">
            Bản đồ xe
          </p>
          <h2 className="mt-1 text-3xl font-extrabold text-primary">
            Vị trí xe trong hệ thống
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
            Admin chỉ xem vị trí và thông tin chủ sở hữu xe. Không thể kéo marker
            hoặc cập nhật vị trí xe từ màn hình này.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-bold uppercase text-slate-400">Tổng xe</p>
            <p className="mt-1 text-2xl font-extrabold text-primary">
              {cars.length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-bold uppercase text-slate-400">
              Có vị trí
            </p>
            <p className="mt-1 text-2xl font-extrabold text-primary">
              {locatedCars}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-white">
          <Loader2 className="animate-spin text-secondary" size={32} />
        </div>
      ) : cars.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Car className="mx-auto text-secondary" size={42} />
          <p className="mt-4 text-lg font-extrabold text-primary">
            Chưa có xe trong hệ thống.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <section className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
            {cars.map((car) => {
              const active = selectedCarId === car._id;
              const status = getCarStatusMeta(car.status);
              const OwnerIcon =
                car.ownerType === "BUSINESS" ? Building2 : UserRound;

              return (
                <button
                  key={car._id}
                  type="button"
                  onClick={() => setSelectedCarId(car._id)}
                  className={`w-full rounded-lg border bg-white p-4 text-left transition ${
                    active
                      ? "border-secondary shadow-lg shadow-secondary/10"
                      : "border-slate-200 hover:border-secondary/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-extrabold text-primary">
                        {car.name}
                      </h3>
                      <p className="mt-1 text-sm font-bold text-slate-500">
                        {car.licensePlate || "Chưa có biển số"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-xs font-extrabold ring-1 ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
                      <OwnerIcon size={14} />
                      {getOwnerTypeLabel(car.ownerType)}
                    </p>
                    <p className="mt-1 font-extrabold text-primary">
                      {car.ownerName || "--"}
                    </p>
                    <p className="mt-1 break-all text-xs font-semibold text-slate-600">
                      {car.ownerEmail || "--"}
                    </p>
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-slate-600">
                    {getAddress(car) || "Chưa cập nhật địa chỉ nhận xe"}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {hasCoordinate(car) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                        <MapPin size={13} />
                        Đã có vị trí
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                        <MapPin size={13} />
                        Chưa có vị trí
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </section>

          <section className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 shrink-0" size={18} />
                <span>
                  Chế độ chỉ xem: admin không thể kéo marker, click bản đồ hoặc
                  sửa vị trí xe.
                </span>
              </div>
            </div>

            <OwnerCarsMap
              cars={cars}
              selectedCarId={selectedCarId}
              onSelectCar={(car) => setSelectedCarId(car._id)}
              onLocationDraft={() => undefined}
              draggable={false}
              readOnly
              height={660}
            />

            {selectedCar && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-600">
                <p>
                  Xe đang chọn:{" "}
                  <span className="font-extrabold text-primary">
                    {selectedCar.name}
                  </span>
                </p>
                <p className="mt-1">
                  Chủ sở hữu:{" "}
                  <span className="font-extrabold text-primary">
                    {selectedCar.ownerName || "--"}
                  </span>
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
