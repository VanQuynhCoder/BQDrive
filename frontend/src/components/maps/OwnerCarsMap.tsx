import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LeafletEvent } from "leaflet";

import { DEFAULT_MAP_TILE_LAYER_KEY, MAP_TILE_LAYERS } from "../../config/mapTiles";
import type { OwnerMapCar } from "../../services/ownerCarLocation.service";
import { mapService } from "../../services/map.service";
import MapTileLayerControl from "./MapTileLayerControl";

const DEFAULT_CENTER: [number, number] = [10.762622, 106.660172];

type Location = {
  lat: number;
  lng: number;
};

type OwnerCarsMapProps = {
  cars: OwnerMapCar[];
  selectedCarId?: string | null;
  draftLocation?: {
    carId: string;
    lat: number;
    lng: number;
  } | null;
  resetToken?: number;
  onSelectCar: (car: OwnerMapCar) => void;
  onLocationDraft: (
    car: OwnerMapCar,
    location: Location,
    address?: string,
    addressWarning?: string,
  ) => void;
  height?: number;
  draggable?: boolean;
};

function hasCoordinate(car: OwnerMapCar) {
  return Number.isFinite(Number(car.pickupLat)) && Number.isFinite(Number(car.pickupLng));
}

function getCarPosition(
  car: OwnerMapCar,
  draftLocation?: OwnerCarsMapProps["draftLocation"],
): [number, number] | null {
  if (draftLocation?.carId === car._id) {
    return [draftLocation.lat, draftLocation.lng];
  }

  if (!hasCoordinate(car)) return null;
  return [Number(car.pickupLat), Number(car.pickupLng)];
}

function getStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    REJECTED: "Từ chối",
    RENTED: "Đang được thuê",
    HIDDEN: "Đã ẩn",
  };

  return labels[status || ""] || status || "--";
}

const carMarkerIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width: 42px;
      height: 42px;
      border-radius: 999px;
      background: #22c55e;
      border: 3px solid #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.28);
    ">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18.7 10 17 6H7l-1.7 4-1.8 1.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2"/>
        <circle cx="7" cy="17" r="2"/>
        <circle cx="17" cy="17" r="2"/>
        <path d="M5 11h14"/>
      </svg>
    </div>
  `,
  iconSize: [42, 42],
  iconAnchor: [21, 42],
  popupAnchor: [0, -42],
});

function MapFocus({
  selectedCar,
  draftLocation,
}: {
  selectedCar?: OwnerMapCar | null;
  draftLocation?: OwnerCarsMapProps["draftLocation"];
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedCar) return;
    const position = getCarPosition(selectedCar, draftLocation);
    map.setView(position || DEFAULT_CENTER, position ? 15 : 12);
  }, [draftLocation, map, selectedCar]);

  return null;
}

function MapClickForMissingLocation({
  selectedCar,
  onLocationDraft,
}: {
  selectedCar?: OwnerMapCar | null;
  onLocationDraft: (
    car: OwnerMapCar,
    location: Location,
    address?: string,
    addressWarning?: string,
  ) => void;
}) {
  useMapEvents({
    click(event) {
      if (!selectedCar || hasCoordinate(selectedCar)) return;
      onLocationDraft(selectedCar, {
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function getGeocodeResult(response: Awaited<ReturnType<typeof mapService.geocodeAddress>>) {
  if (!response.success || !response.data) return null;
  if (Array.isArray(response.data)) return response.data[0] || null;

  return response.data;
}

async function getReverseGeocodedAddress(lat: number, lng: number) {
  const response = await mapService.reverseGeocode(lat, lng);

  if (!response.success || !response.data?.displayName) {
    throw new Error(response.message || "Không xác định được địa chỉ mới.");
  }

  return response.data.displayName;
}

function MarkerPopupContent({
  car,
  onSearchLocation,
}: {
  car: OwnerMapCar;
  onSearchLocation: (car: OwnerMapCar, address: string) => Promise<void>;
}) {
  const [addressInput, setAddressInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const address = addressInput.trim();

    if (address.length < 3) {
      setError("Vui lòng nhập địa chỉ cần tìm.");
      return;
    }

    setSearching(true);
    setError("");

    try {
      await onSearchLocation(car, address);
      setAddressInput("");
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Không tìm thấy vị trí phù hợp.",
      );
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="w-[260px] text-sm">
      <p className="font-extrabold text-slate-950">{car.name}</p>
      <p className="mt-1 font-semibold text-slate-600">
        {car.licensePlate || "Chưa có biển số"}
      </p>
      <div className="mt-3 rounded-lg bg-slate-50 p-2">
        <p className="text-xs font-bold uppercase text-slate-400">
          Địa chỉ hiện tại
        </p>
        <p className="mt-1 font-semibold leading-5 text-slate-700">
          {car.pickupFormattedAddress ||
            car.pickupAddress ||
            "Chưa cập nhật địa chỉ nhận xe"}
        </p>
      </div>
      <p className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-extrabold text-emerald-800">
        {getStatusLabel(car.status)}
      </p>

      <form className="mt-3 space-y-2" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">
            Nhập địa chỉ mới
          </span>
          <input
            value={addressInput}
            onChange={(event) => setAddressInput(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
            placeholder="VD: 268 Lý Thường Kiệt, Quận 10"
          />
        </label>
        {error && (
          <p className="rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={searching}
          className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-extrabold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {searching ? "Đang tìm..." : "Tìm và cập nhật vị trí"}
        </button>
      </form>
    </div>
  );
}

export default function OwnerCarsMap({
  cars,
  selectedCarId,
  draftLocation,
  resetToken = 0,
  onSelectCar,
  onLocationDraft,
  height = 620,
  draggable = true,
}: OwnerCarsMapProps) {
  const [tileLayerKey, setTileLayerKey] = useState(DEFAULT_MAP_TILE_LAYER_KEY);
  const selectedCar = useMemo(
    () => cars.find((car) => car._id === selectedCarId) || null,
    [cars, selectedCarId],
  );
  const markerCars = cars.filter(
    (car) => hasCoordinate(car) || draftLocation?.carId === car._id,
  );
  const firstPosition = markerCars.length
    ? getCarPosition(markerCars[0], draftLocation)
    : null;
  const tileLayer = MAP_TILE_LAYERS[tileLayerKey];

  const handleSearchLocation = async (car: OwnerMapCar, address: string) => {
    const response = await mapService.geocodeAddress(address);
    const result = getGeocodeResult(response);

    if (!result) {
      throw new Error(
        response.message || "Không tìm thấy vị trí phù hợp với địa chỉ đã nhập.",
      );
    }

    onLocationDraft(
      car,
      { lat: result.lat, lng: result.lng },
      result.formattedAddress || address,
    );
  };

  return (
    <div className="relative isolate z-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <MapTileLayerControl value={tileLayerKey} onChange={setTileLayerKey} />
      <MapContainer
        center={firstPosition || DEFAULT_CENTER}
        zoom={firstPosition ? 13 : 12}
        scrollWheelZoom
        style={{ height, width: "100%" }}
      >
        <TileLayer
          key={tileLayerKey}
          attribution={tileLayer.attribution}
          url={tileLayer.url}
        />
        <MapFocus selectedCar={selectedCar} draftLocation={draftLocation} />
        <MapClickForMissingLocation
          selectedCar={selectedCar}
          onLocationDraft={onLocationDraft}
        />

        {markerCars.map((car) => {
          const position = getCarPosition(car, draftLocation);
          if (!position) return null;

          return (
            <Marker
              key={`${car._id}-${car.pickupLat}-${car.pickupLng}-${resetToken}`}
              position={position}
              icon={carMarkerIcon}
              draggable={draggable}
              eventHandlers={{
                click: () => onSelectCar(car),
                dragend: async (event: LeafletEvent) => {
                  const marker = event.target as L.Marker;
                  const next = marker.getLatLng();
                  let address: string | undefined;
                  let addressWarning: string | undefined;

                  try {
                    address = await getReverseGeocodedAddress(next.lat, next.lng);
                  } catch {
                    addressWarning =
                      "Không xác định được địa chỉ mới, bạn có thể chỉnh lại địa chỉ sau.";
                  }

                  onLocationDraft(
                    car,
                    { lat: next.lat, lng: next.lng },
                    address,
                    addressWarning,
                  );
                },
              }}
            >
              <Popup>
                <MarkerPopupContent
                  car={car}
                  onSearchLocation={handleSearchLocation}
                />
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {selectedCar && !hasCoordinate(selectedCar) && (
        <div className="absolute bottom-4 left-4 right-4 z-[500] rounded-lg border border-secondary/40 bg-white px-4 py-3 text-sm font-semibold text-primary shadow-xl md:left-auto md:max-w-md">
          Xe này chưa có vị trí bản đồ. Click vào bản đồ để chọn vị trí nhận xe.
        </div>
      )}
    </div>
  );
}
