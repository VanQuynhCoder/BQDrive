import { useEffect, useMemo, useState } from "react";
import { divIcon, type LatLngExpression, type LatLngTuple } from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  Crosshair,
  Loader2,
  MapPinned,
  MousePointer2,
  Navigation,
  X,
} from "lucide-react";

import { DEFAULT_MAP_TILE_LAYER_KEY, MAP_TILE_LAYERS } from "../../config/mapTiles";
import { mapService, type RouteResult } from "../../services/map.service";
import { defaultMarkerIcon } from "./leafletIcon";
import MapTileLayerControl from "./MapTileLayerControl";

type Coordinate = {
  lat: number;
  lng: number;
};

type RouteMapProps = {
  destLat?: number | string;
  destLng?: number | string;
  address?: string;
  title?: string;
  height?: number;
  showControls?: boolean;
  showAddress?: boolean;
};

const originMarkerIcon = divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:9999px;background:#0f172a;border:4px solid #eab308;box-shadow:0 6px 18px rgba(15,23,42,.3);"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function toCoordinate(value?: number | string) {
  if (value === undefined || value === null || value === "") return undefined;

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : undefined;
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;

  return `${Math.round((meters / 1000) * 10) / 10} km`;
}

function formatDuration(seconds: number, fallback?: string) {
  if (fallback) return fallback;

  const totalMinutes = Math.max(Math.round(seconds / 60), 1);
  if (totalMinutes < 60) return `${totalMinutes} phút`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

function getRoutePositions(route?: RouteResult | null): LatLngTuple[] {
  return (
    route?.geometry?.coordinates
      ?.map((coordinate) => [coordinate[1], coordinate[0]] as LatLngTuple)
      .filter((coordinate) => {
        const [lat, lng] = coordinate;
        return Number.isFinite(lat) && Number.isFinite(lng);
      }) || []
  );
}

function RouteMapBounds({
  destination,
  origin,
  routePositions,
}: {
  destination: Coordinate;
  origin?: Coordinate | null;
  routePositions: LatLngTuple[];
}) {
  const map = useMap();

  useEffect(() => {
    if (routePositions.length > 1) {
      map.fitBounds(routePositions, { padding: [32, 32] });
      return;
    }

    if (origin) {
      map.fitBounds(
        [
          [origin.lat, origin.lng],
          [destination.lat, destination.lng],
        ],
        { padding: [32, 32] },
      );
      return;
    }

    map.setView([destination.lat, destination.lng], 15);
  }, [destination.lat, destination.lng, map, origin, routePositions]);

  return null;
}

function ManualOriginPicker({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (coordinate: Coordinate) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;

      onPick({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function MapResizeOnOpen() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 50);

    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

function getRouteErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: unknown } } }).response
      ?.data?.message === "string"
  ) {
    return String(
      (error as { response?: { data?: { message?: unknown } } }).response?.data
        ?.message,
    );
  }

  return "Không tìm được tuyến đường phù hợp.";
}

export default function RouteMap({
  destLat,
  destLng,
  address,
  title = "Chỉ đường đến điểm nhận xe",
  height = 320,
  showControls = true,
  showAddress = true,
}: RouteMapProps) {
  const [tileLayerKey, setTileLayerKey] = useState(DEFAULT_MAP_TILE_LAYER_KEY);
  const latitude = toCoordinate(destLat);
  const longitude = toCoordinate(destLng);
  const [origin, setOrigin] = useState<Coordinate | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [message, setMessage] = useState("");
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const routePositions = useMemo(() => getRoutePositions(route), [route]);
  const tileLayer = MAP_TILE_LAYERS[tileLayerKey];

  if (latitude === undefined || longitude === undefined) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-bold leading-6 text-slate-500">
        Xe chưa cập nhật vị trí bản đồ, không thể tìm đường.
      </div>
    );
  }

  const destination = { lat: latitude, lng: longitude };
  const destinationPosition: LatLngExpression = [destination.lat, destination.lng];
  const originPosition: LatLngExpression | null = origin
    ? [origin.lat, origin.lng]
    : null;

  const updateOrigin = (coordinate: Coordinate) => {
    setOrigin(coordinate);
    setRoute(null);
    setMessage("");
  };

  const openLargePicker = () => {
    setManualMode(true);
    setIsPickerOpen(true);
    setMessage("");
  };

  const closeLargePicker = () => {
    setManualMode(false);
    setIsPickerOpen(false);
  };

  const pickOriginFromLargeMap = (coordinate: Coordinate) => {
    updateOrigin(coordinate);
    setManualMode(false);
    setIsPickerOpen(false);
    setMessage("Đã chọn điểm bắt đầu. Bấm Tìm đường để xem lộ trình.");
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Trình duyệt không hỗ trợ lấy vị trí hiện tại.");
      return;
    }

    setLoadingLocation(true);
    setMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateOrigin({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setManualMode(false);
        setLoadingLocation(false);
      },
      (error) => {
        setMessage(
          error.code === error.PERMISSION_DENIED
            ? "Bạn đã từ chối quyền truy cập vị trí. Vui lòng bật quyền vị trí hoặc chọn điểm bắt đầu thủ công."
            : "Không lấy được vị trí hiện tại. Vui lòng thử lại hoặc chọn điểm bắt đầu trên bản đồ.",
        );
        setLoadingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  };

  const handleFindRoute = async () => {
    if (!origin) {
      setMessage("Vui lòng dùng vị trí hiện tại hoặc chọn điểm bắt đầu trên bản đồ.");
      return;
    }

    setLoadingRoute(true);
    setMessage("");

    try {
      const response = await mapService.getRoute({
        originLat: origin.lat,
        originLng: origin.lng,
        destLat: destination.lat,
        destLng: destination.lng,
      });

      if (!response.success || !response.data) {
        setRoute(null);
        setMessage(response.message || "Không tìm được tuyến đường phù hợp.");
        return;
      }

      setRoute(response.data);
    } catch (error: unknown) {
      setRoute(null);
      setMessage(getRouteErrorMessage(error));
    } finally {
      setLoadingRoute(false);
    }
  };

  const osmDirectionsUrl = origin
    ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.lat}%2C${origin.lng}%3B${destination.lat}%2C${destination.lng}`
    : `https://www.openstreetmap.org/?mlat=${destination.lat}&mlon=${destination.lng}#map=16/${destination.lat}/${destination.lng}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {showControls && (
        <div className="border-b border-slate-100 p-4">
          <div>
            <div className="min-w-0">
              <p className="text-base font-extrabold leading-snug text-primary">
                {title}
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                Dùng vị trí hiện tại hoặc chọn điểm bắt đầu trên bản đồ.
              </p>
              {showAddress && (
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  {address || "Điểm nhận xe đã được ghim trên bản đồ."}
                </p>
              )}
              {manualMode && (
                <p className="mt-2 rounded-xl border border-secondary/40 bg-secondarySoft px-3 py-2 text-xs font-extrabold text-primary">
                  Click lên bản đồ để chọn điểm bắt đầu.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={loadingLocation}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-extrabold text-secondary transition hover:bg-primaryDark disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loadingLocation ? (
                <Loader2 size={17} className="shrink-0 animate-spin" />
              ) : (
                <Crosshair size={17} className="shrink-0" />
              )}
              <span className="truncate">Dùng vị trí hiện tại</span>
            </button>

            <button
              type="button"
              onClick={openLargePicker}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold transition ${
                manualMode || isPickerOpen
                  ? "bg-secondary text-primary ring-2 ring-secondary/30 hover:bg-secondaryLight"
                  : "bg-slate-100 text-primary hover:bg-slate-200"
              }`}
            >
              <MousePointer2 size={17} className="shrink-0" />
              <span className="truncate">Chọn trên bản đồ</span>
            </button>

            <button
              type="button"
              onClick={handleFindRoute}
              disabled={loadingRoute}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-3 text-sm font-extrabold text-primary transition hover:bg-secondaryLight disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loadingRoute ? (
                <Loader2 size={17} className="shrink-0 animate-spin" />
              ) : (
                <Navigation size={17} className="shrink-0" />
              )}
              <span className="truncate">Tìm đường</span>
            </button>
          </div>
        </div>
      )}

      <div className="relative isolate z-0">
        <MapTileLayerControl value={tileLayerKey} onChange={setTileLayerKey} />
        <MapContainer
          center={destinationPosition}
          zoom={15}
          scrollWheelZoom={false}
          style={{ height, width: "100%" }}
        >
          <TileLayer
            key={tileLayerKey}
            attribution={tileLayer.attribution}
            url={tileLayer.url}
          />
          <ManualOriginPicker enabled={false} onPick={updateOrigin} />
          <RouteMapBounds
            destination={destination}
            origin={origin}
            routePositions={routePositions}
          />
          <Marker position={destinationPosition} icon={defaultMarkerIcon} />
          {originPosition && <Marker position={originPosition} icon={originMarkerIcon} />}
          {routePositions.length > 1 && (
            <Polyline
              positions={routePositions}
              pathOptions={{ color: "#eab308", weight: 6, opacity: 0.9 }}
            />
          )}
        </MapContainer>
      </div>

      {showControls && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4">
          {route && (
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-bold uppercase text-slate-400">
                  Khoảng cách
                </p>
                <p className="mt-1 text-lg font-extrabold text-primary">
                  {formatDistance(route.distanceMeters)}
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-bold uppercase text-slate-400">
                  Thời gian
                </p>
                <p className="mt-1 text-lg font-extrabold text-primary">
                  {formatDuration(route.durationSeconds, route.durationText)}
                </p>
              </div>
              <a
                href={osmDirectionsUrl}
                target="_blank"
                rel="noreferrer"
                className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-secondary transition hover:bg-primaryDark"
              >
                <MapPinned size={17} className="shrink-0" />
                <span>Mở bằng OpenStreetMap</span>
              </a>
            </div>
          )}

          {!route && (
            <p className="text-sm font-semibold leading-6 text-slate-500">
              Chọn vị trí bắt đầu để tìm đường đến điểm nhận xe.
            </p>
          )}

          {message && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-bold leading-6 text-slate-700">
              {message}
            </div>
          )}
        </div>
      )}

      {showControls && isPickerOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4">
              <div>
                <p className="text-lg font-extrabold text-primary">
                  Chọn điểm bắt đầu trên bản đồ
                </p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  Click vào vị trí của bạn, hệ thống sẽ dùng điểm đó để tìm đường đến nơi nhận xe.
                </p>
              </div>
              <button
                type="button"
                onClick={closeLargePicker}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-primary"
                aria-label="Đóng bản đồ chọn vị trí"
              >
                <X size={20} />
              </button>
            </div>

            <div className="relative isolate z-0 min-h-[420px] flex-1 bg-slate-100">
              <MapTileLayerControl value={tileLayerKey} onChange={setTileLayerKey} />
              <MapContainer
                center={originPosition || destinationPosition}
                zoom={originPosition ? 14 : 15}
                scrollWheelZoom
                style={{ height: "min(72vh, 640px)", width: "100%" }}
              >
                <MapResizeOnOpen />
                <TileLayer
                  key={tileLayerKey}
                  attribution={tileLayer.attribution}
                  url={tileLayer.url}
                />
                <ManualOriginPicker enabled onPick={pickOriginFromLargeMap} />
                <RouteMapBounds
                  destination={destination}
                  origin={origin}
                  routePositions={routePositions}
                />
                <Marker position={destinationPosition} icon={defaultMarkerIcon} />
                {originPosition && (
                  <Marker position={originPosition} icon={originMarkerIcon} />
                )}
                {routePositions.length > 1 && (
                  <Polyline
                    positions={routePositions}
                    pathOptions={{ color: "#eab308", weight: 6, opacity: 0.9 }}
                  />
                )}
              </MapContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
