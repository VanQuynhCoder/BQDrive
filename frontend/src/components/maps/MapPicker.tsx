import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { DEFAULT_MAP_TILE_LAYER_KEY, MAP_TILE_LAYERS } from "../../config/mapTiles";
import { defaultMarkerIcon } from "./leafletIcon";
import MapTileLayerControl from "./MapTileLayerControl";

const DEFAULT_CENTER: [number, number] = [10.762622, 106.660172];

type Location = {
  lat: number;
  lng: number;
};

type MapPickerProps = {
  lat?: number | string;
  lng?: number | string;
  onLocationChange: (location: Location) => void;
  height?: number;
};

function toCoordinate(value?: number | string) {
  if (value === undefined || value === null || value === "") return undefined;

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : undefined;
}

function getPosition(lat?: number | string, lng?: number | string) {
  const latitude = toCoordinate(lat);
  const longitude = toCoordinate(lng);

  if (latitude === undefined || longitude === undefined) return null;
  return { lat: latitude, lng: longitude };
}

function MapClickHandler({
  onPick,
}: {
  onPick: (location: Location) => void;
}) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

function RecenterMap({ position }: { position: Location | null }) {
  const map = useMap();

  useEffect(() => {
    if (!position) return;
    map.setView([position.lat, position.lng], Math.max(map.getZoom(), 15));
  }, [map, position]);

  return null;
}

export default function MapPicker({
  lat,
  lng,
  onLocationChange,
  height = 280,
}: MapPickerProps) {
  const [tileLayerKey, setTileLayerKey] = useState(DEFAULT_MAP_TILE_LAYER_KEY);
  const position = getPosition(lat, lng);
  const center: [number, number] = position
    ? [position.lat, position.lng]
    : DEFAULT_CENTER;
  const tileLayer = MAP_TILE_LAYERS[tileLayerKey];

  return (
    <div className="relative isolate z-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <MapTileLayerControl value={tileLayerKey} onChange={setTileLayerKey} />
      <MapContainer
        center={center}
        zoom={position ? 15 : 12}
        scrollWheelZoom
        style={{ height, width: "100%" }}
      >
        <TileLayer
          key={tileLayerKey}
          attribution={tileLayer.attribution}
          url={tileLayer.url}
        />
        <MapClickHandler onPick={onLocationChange} />
        <RecenterMap position={position} />
        {position && (
          <Marker
            position={[position.lat, position.lng]}
            icon={defaultMarkerIcon}
          />
        )}
      </MapContainer>

      <div className="border-t border-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">
        {position
          ? `Tọa độ: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`
          : "Click trên bản đồ để chọn vị trí."}
      </div>
    </div>
  );
}
