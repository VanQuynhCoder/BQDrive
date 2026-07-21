import { useState } from "react";
import { MapPin } from "lucide-react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

import { DEFAULT_MAP_TILE_LAYER_KEY, MAP_TILE_LAYERS } from "../../config/mapTiles";
import { defaultMarkerIcon } from "./leafletIcon";
import MapTileLayerControl from "./MapTileLayerControl";

type MapPreviewProps = {
  lat?: number | string;
  lng?: number | string;
  address?: string;
  height?: number;
};

function toCoordinate(value?: number | string) {
  if (value === undefined || value === null || value === "") return undefined;

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : undefined;
}

export default function MapPreview({
  lat,
  lng,
  address,
  height = 260,
}: MapPreviewProps) {
  const [tileLayerKey, setTileLayerKey] = useState(DEFAULT_MAP_TILE_LAYER_KEY);
  const latitude = toCoordinate(lat);
  const longitude = toCoordinate(lng);

  if (latitude === undefined || longitude === undefined) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm font-bold text-slate-500"
        style={{ minHeight: height }}
      >
        Chưa cập nhật vị trí bản đồ.
      </div>
    );
  }

  const position: [number, number] = [latitude, longitude];
  const tileLayer = MAP_TILE_LAYERS[tileLayerKey];

  return (
    <div className="relative isolate z-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <MapTileLayerControl value={tileLayerKey} onChange={setTileLayerKey} />
      <MapContainer
        center={position}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height, width: "100%" }}
      >
        <TileLayer
          key={tileLayerKey}
          attribution={tileLayer.attribution}
          url={tileLayer.url}
        />
        <Marker position={position} icon={defaultMarkerIcon} />
      </MapContainer>

      {address && (
        <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-primary">
          <MapPin size={17} className="mt-0.5 shrink-0 text-secondary" />
          <span>{address}</span>
        </div>
      )}
    </div>
  );
}
