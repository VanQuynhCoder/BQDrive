export const MAP_TILE_LAYERS = {
  street: {
    name: "Bản đồ thường",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    name: "Vệ tinh",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  },
} as const;

export type MapTileLayerKey = keyof typeof MAP_TILE_LAYERS;

export const DEFAULT_MAP_TILE_LAYER_KEY: MapTileLayerKey = "street";
export const DEFAULT_MAP_TILE_LAYER =
  MAP_TILE_LAYERS[DEFAULT_MAP_TILE_LAYER_KEY];
