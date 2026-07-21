import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Car,
  Loader2,
  MapPin,
  Navigation,
  Save,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import OwnerCarsMap from "../../components/maps/OwnerCarsMap";
import {
  ownerCarLocationService,
  type OwnerMapCar,
  type UpdateCarLocationPayload,
} from "../../services/ownerCarLocation.service";
import { getCarStatusMeta } from "../../utils/display.util";

type OwnerCarLocationPageProps = {
  title: string;
  subtitle: string;
  emptyText: string;
};

type PendingLocation = {
  car: OwnerMapCar;
  oldLat?: number;
  oldLng?: number;
  oldAddress: string;
  newLat: number;
  newLng: number;
  address: string;
  searchedAddress?: string;
  addressWarning?: string;
  shouldSaveAddress: boolean;
  note: string;
};

function hasCoordinate(car: OwnerMapCar) {
  return Number.isFinite(Number(car.pickupLat)) && Number.isFinite(Number(car.pickupLng));
}

function getAddress(car: OwnerMapCar) {
  return car.pickupFormattedAddress || car.pickupAddress || "";
}

function formatCoordinate(lat?: number, lng?: number) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return "Chưa có tọa độ";
  }

  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
}

function formatDate(value?: string) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return date.toLocaleString("vi-VN");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") return response.data.message;
  }

  return fallback;
}

export default function OwnerCarLocationPage({
  title,
  subtitle,
  emptyText,
}: OwnerCarLocationPageProps) {
  const [cars, setCars] = useState<OwnerMapCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [pendingLocation, setPendingLocation] =
    useState<PendingLocation | null>(null);
  const [draftLocation, setDraftLocation] = useState<{
    carId: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [resetToken, setResetToken] = useState(0);

  const selectedCar = useMemo(
    () => cars.find((car) => car._id === selectedCarId) || null,
    [cars, selectedCarId],
  );

  const loadCars = async () => {
    setLoading(true);
    try {
      const data = await ownerCarLocationService.getCarsMap();
      setCars(data);
      setSelectedCarId((current) => current || data[0]?._id || null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Không tải được danh sách xe"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCars();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const openLocationConfirm = (
    car: OwnerMapCar,
    location: { lat: number; lng: number },
    searchedAddress?: string,
    addressWarning?: string,
  ) => {
    const currentAddress = getAddress(car);
    const fallbackWarning =
      "Không xác định được địa chỉ mới, bạn có thể chỉnh lại địa chỉ sau.";

    setSelectedCarId(car._id);
    setDraftLocation({
      carId: car._id,
      lat: location.lat,
      lng: location.lng,
    });
    setPendingLocation({
      car,
      oldLat: car.pickupLat,
      oldLng: car.pickupLng,
      oldAddress: currentAddress,
      newLat: location.lat,
      newLng: location.lng,
      address: searchedAddress || currentAddress,
      searchedAddress,
      addressWarning: addressWarning || (!searchedAddress ? fallbackWarning : undefined),
      shouldSaveAddress: Boolean(searchedAddress),
      note: car.pickupNote || "",
    });
  };

  const closePendingLocation = () => {
    setPendingLocation(null);
    setDraftLocation(null);
    setResetToken((value) => value + 1);
  };

  const savePendingLocation = async () => {
    if (!pendingLocation) return;

    setSaving(true);
    try {
      const address = pendingLocation.address.trim();
      const shouldSaveAddress =
        Boolean(address) &&
        (pendingLocation.shouldSaveAddress ||
          address !== pendingLocation.oldAddress.trim());
      const payload: UpdateCarLocationPayload = {
        pickupLat: pendingLocation.newLat,
        pickupLng: pendingLocation.newLng,
        pickupNote: pendingLocation.note.trim(),
      };

      if (shouldSaveAddress) {
        payload.pickupAddress = address;
        payload.pickupFormattedAddress = address;
      }

      const updatedCar = await ownerCarLocationService.updateCarLocation(
        pendingLocation.car._id,
        payload,
      );

      setCars((current) =>
        current.map((car) =>
          car._id === updatedCar._id ? { ...car, ...updatedCar } : car,
        ),
      );
      setPendingLocation(null);
      setDraftLocation(null);
      setSelectedCarId(updatedCar._id);
      toast.success("Đã cập nhật vị trí xe.");
    } catch (error) {
      setResetToken((value) => value + 1);
      toast.error(getErrorMessage(error, "Cập nhật vị trí xe thất bại"));
    } finally {
      setSaving(false);
    }
  };

  const locatedCars = cars.filter(hasCoordinate).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase text-secondary">
            Bản đồ xe
          </p>
          <h2 className="mt-1 text-3xl font-extrabold text-primary">{title}</h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
            {subtitle}
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
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-slate-200 bg-white">
          <Loader2 className="animate-spin text-secondary" size={32} />
        </div>
      ) : cars.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Car className="mx-auto text-secondary" size={42} />
          <p className="mt-4 text-lg font-extrabold text-primary">{emptyText}</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <section className="space-y-3">
            {cars.map((car) => {
              const active = selectedCarId === car._id;
              const address = getAddress(car);
              const status = getCarStatusMeta(car.status);

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
                  <div className="flex gap-3">
                    <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                      {car.images?.[0] ? (
                        <img
                          src={car.images[0]}
                          alt={car.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Car size={24} className="text-slate-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
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

                      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-slate-600">
                        {address || "Chưa cập nhật địa chỉ nhận xe"}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {hasCoordinate(car) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                            <MapPin size={13} />
                            Đã có vị trí
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                            <AlertTriangle size={13} />
                            Chưa có vị trí bản đồ
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                          <Navigation size={13} />
                          {hasCoordinate(car) ? "Xem trên bản đồ" : "Chọn vị trí"}
                        </span>
                      </div>

                      {car.status === "RENTED" && (
                        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                          Xe đang có chuyến thuê, hãy cân nhắc khi cập nhật vị trí.
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          <section className="space-y-3">
            <OwnerCarsMap
              cars={cars}
              selectedCarId={selectedCarId}
              draftLocation={draftLocation}
              resetToken={resetToken}
              onSelectCar={(car) => setSelectedCarId(car._id)}
              onLocationDraft={openLocationConfirm}
              draggable
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
                  Cập nhật gần nhất: {formatDate(selectedCar.lastLocationUpdatedAt)}
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      <AdminModal
        open={!!pendingLocation}
        title="Lưu vị trí mới"
        description="Bạn có muốn lưu vị trí mới cho xe này không?"
        confirmText="Lưu vị trí mới"
        loading={saving}
        onClose={closePendingLocation}
        onConfirm={savePendingLocation}
      >
        {pendingLocation && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-lg font-extrabold text-primary">
                {pendingLocation.car.name}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {pendingLocation.car.licensePlate || "Chưa có biển số"}
              </p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Tọa độ cũ
                  </p>
                  <p className="mt-1 font-extrabold text-primary">
                    {formatCoordinate(
                      pendingLocation.oldLat,
                      pendingLocation.oldLng,
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Tọa độ mới
                  </p>
                  <p className="mt-1 font-extrabold text-primary">
                    {formatCoordinate(
                      pendingLocation.newLat,
                      pendingLocation.newLng,
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Địa chỉ cũ
                  </p>
                  <p className="mt-1 font-semibold leading-5 text-primary">
                    {pendingLocation.oldAddress || "Chưa cập nhật địa chỉ"}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Địa chỉ mới
                  </p>
                  <p className="mt-1 font-semibold leading-5 text-primary">
                    {pendingLocation.searchedAddress ||
                      pendingLocation.address ||
                      "Chưa cập nhật địa chỉ"}
                  </p>
                </div>
              </div>
            </div>

            {pendingLocation.addressWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                {pendingLocation.addressWarning}
              </div>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-extrabold text-slate-700">
                Địa chỉ nhận xe
              </span>
              <textarea
                value={pendingLocation.address}
                onChange={(event) =>
                  setPendingLocation((current) =>
                    current
                      ? {
                          ...current,
                          address: event.target.value,
                          shouldSaveAddress:
                            current.shouldSaveAddress ||
                            event.target.value.trim() !== current.oldAddress.trim(),
                        }
                      : current,
                  )
                }
                className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                placeholder="Nhập hoặc kiểm tra lại địa chỉ nhận xe"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-extrabold text-slate-700">
                Ghi chú nhận xe
              </span>
              <input
                value={pendingLocation.note}
                onChange={(event) =>
                  setPendingLocation((current) =>
                    current ? { ...current, note: event.target.value } : current,
                  )
                }
                className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                placeholder="Ví dụ: nhận xe tại cổng chính, tầng hầm B1..."
              />
            </label>

            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
              <Save size={16} className="text-secondary" />
              Xe APPROVED chỉ đổi vị trí qua màn hình này vẫn giữ trạng thái đã duyệt.
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  );
}
