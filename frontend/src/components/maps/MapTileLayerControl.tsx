import {
  DEFAULT_MAP_TILE_LAYER_KEY,
  MAP_TILE_LAYERS,
  type MapTileLayerKey,
} from "../../config/mapTiles";

type MapTileLayerControlProps = {
  value: MapTileLayerKey;
  onChange: (value: MapTileLayerKey) => void;
};

export default function MapTileLayerControl({
  value,
  onChange,
}: MapTileLayerControlProps) {
  return (
    <div className="absolute right-3 top-3 z-[500] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <label className="flex items-center gap-2 text-xs font-extrabold text-primary">
        <span>Kiểu bản đồ</span>
        <select
          value={value}
          onChange={(event) =>
            onChange((event.target.value || DEFAULT_MAP_TILE_LAYER_KEY) as MapTileLayerKey)
          }
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-primary outline-none focus:border-secondary"
        >
          {Object.entries(MAP_TILE_LAYERS).map(([key, layer]) => (
            <option key={key} value={key}>
              {layer.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
