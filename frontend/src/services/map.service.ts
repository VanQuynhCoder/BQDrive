import api from "./api";

export type GeocodeResult = {
  formattedAddress: string;
  lat: number;
  lng: number;
  province?: string;
  district?: string;
  ward?: string;
  raw?: unknown;
};

export type ReverseGeocodeResult = {
  displayName: string;
  lat: number;
  lng: number;
  raw?: unknown;
};

export type RouteResult = {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationText: string;
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  steps: Array<{
    name: string;
    distance: number;
    duration: number;
    maneuverType: string;
    instruction?: string;
  }>;
};

export const mapService = {
  geocodeAddress: async (address: string) => {
    const res = await api.get("/maps/geocode", {
      params: { address },
    });

    return res.data as {
      success: boolean;
      message: string;
      data?: GeocodeResult;
    };
  },

  reverseGeocode: async (lat: number, lng: number) => {
    const res = await api.get("/maps/reverse-geocode", {
      params: { lat, lng },
    });

    return res.data as {
      success: boolean;
      message: string;
      data?: ReverseGeocodeResult;
    };
  },

  getRoute: async (params: {
    originLat: number;
    originLng: number;
    destLat: number;
    destLng: number;
    profile?: "driving";
  }) => {
    const res = await api.get("/maps/route", { params });

    return res.data as {
      success: boolean;
      message: string;
      data?: RouteResult;
    };
  },
};
