import axios from "axios";

import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserRoleEnum } from "../../constants/model.const";

type NominatimAddress = {
  state?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  city_district?: string;
  district?: string;
  suburb?: string;
  quarter?: string;
  neighbourhood?: string;
};

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
  error?: string;
};

type GeocodeData = {
  formattedAddress: string;
  lat: number;
  lng: number;
  province: string;
  district: string;
  ward: string;
  raw: NominatimResult;
};

type OsrmRouteStep = {
  name?: string;
  distance?: number;
  duration?: number;
  maneuver?: {
    type?: string;
    modifier?: string;
  };
};

type OsrmRoute = {
  distance?: number;
  duration?: number;
  geometry?: {
    type: "LineString";
    coordinates: number[][];
  };
  legs?: Array<{
    steps?: OsrmRouteStep[];
  }>;
};

type OsrmResponse = {
  code?: string;
  routes?: OsrmRoute[];
};

const geocodeCache = new Map<string, { data: GeocodeData; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1";

function normalizeCacheKey(address: string) {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}

function pickProvince(address?: NominatimAddress) {
  return address?.state || address?.city || "";
}

function pickDistrict(address?: NominatimAddress) {
  return (
    address?.city_district ||
    address?.district ||
    address?.county ||
    address?.town ||
    ""
  );
}

function pickWard(address?: NominatimAddress) {
  return (
    address?.suburb ||
    address?.quarter ||
    address?.neighbourhood ||
    address?.village ||
    ""
  );
}

function normalizeNominatimResult(result: NominatimResult): GeocodeData | null {
  const lat = Number(result.lat);
  const lng = Number(result.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    formattedAddress: result.display_name || "",
    lat,
    lng,
    province: pickProvince(result.address),
    district: pickDistrict(result.address),
    ward: pickWard(result.address),
    raw: result,
  };
}

function parseCoordinate(
  value: unknown,
  min: number,
  max: number,
) {
  const coordinate = Number(value);

  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    return null;
  }

  return coordinate;
}

function formatDurationText(seconds: number) {
  const totalMinutes = Math.max(Math.round(seconds / 60), 1);

  if (totalMinutes < 60) {
    return `${totalMinutes} phút`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

function buildStepInstruction(step: OsrmRouteStep) {
  const maneuverType = step.maneuver?.type || "";
  const modifier = step.maneuver?.modifier;
  const roadName = step.name ? ` vào ${step.name}` : "";

  if (maneuverType === "depart") return `Bắt đầu di chuyển${roadName}`;
  if (maneuverType === "arrive") return "Đến điểm nhận xe";
  if (maneuverType === "turn") {
    const direction =
      modifier === "left"
        ? "Rẽ trái"
        : modifier === "right"
          ? "Rẽ phải"
          : "Rẽ";

    return `${direction}${roadName}`;
  }

  return roadName ? `Tiếp tục${roadName}` : undefined;
}

class MapsRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/geocode",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.geocodeAddress),
    );

    this.router.get(
      "/reverse-geocode",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.reverseGeocode),
    );

    this.router.get("/route", this.route(this.getRoute));
  }

  async geocodeAddress(req: Request, res: Response) {
    const address = String(req.query.address || "").trim();

    if (!address || address.length < 3) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập địa chỉ cần tìm.");
    }

    const cacheKey = normalizeCacheKey(address);
    const cached = geocodeCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json({
        success: true,
        status: 200,
        code: "200",
        message: "success",
        data: cached.data,
      });
    }

    try {
      const response = await axios.get<NominatimResult[]>(NOMINATIM_URL, {
        params: {
          format: "json",
          q: address,
          countrycodes: "vn",
          limit: 1,
          addressdetails: 1,
        },
        headers: {
          "User-Agent": "BQDrive/1.0 OpenStreetMap geocoding",
          Accept: "application/json",
        },
        timeout: 8000,
      });

      const firstResult = response.data?.[0];
      const data = firstResult ? normalizeNominatimResult(firstResult) : null;

      if (!data) {
        return res.status(200).json({
          success: false,
          status: 200,
          code: "NO_GEOCODE_RESULT",
          message: "Không tìm thấy vị trí phù hợp với địa chỉ đã nhập.",
        });
      }

      geocodeCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return res.status(200).json({
        success: true,
        status: 200,
        code: "200",
        message: "success",
        data,
      });
    } catch (error) {
      return res.status(503).json({
        success: false,
        status: 503,
        code: "GEOCODE_UNAVAILABLE",
        message:
          "Không thể tìm địa chỉ lúc này. Vui lòng thử lại hoặc chọn thủ công trên bản đồ.",
      });
    }
  }

  async reverseGeocode(req: Request, res: Response) {
    const lat = parseCoordinate(req.query.lat, -90, 90);
    const lng = parseCoordinate(req.query.lng, -180, 180);

    if (lat === null || lng === null) {
      return res.status(400).json({
        success: false,
        status: 400,
        code: "INVALID_REVERSE_GEOCODE_COORDINATES",
        message: "Thiếu tọa độ để tìm địa chỉ.",
      });
    }

    try {
      const response = await axios.get<NominatimResult>(NOMINATIM_REVERSE_URL, {
        params: {
          format: "json",
          lat,
          lon: lng,
          addressdetails: 1,
        },
        headers: {
          "User-Agent": "BQDrive/1.0 OpenStreetMap reverse geocoding",
          Accept: "application/json",
        },
        timeout: 8000,
      });

      const displayName = response.data?.display_name?.trim();

      if (!displayName || response.data?.error) {
        return res.status(200).json({
          success: false,
          status: 200,
          code: "NO_REVERSE_GEOCODE_RESULT",
          message: "Không xác định được địa chỉ mới.",
        });
      }

      return res.status(200).json({
        success: true,
        status: 200,
        code: "200",
        message: "success",
        data: {
          displayName,
          lat,
          lng,
          raw: response.data,
        },
      });
    } catch (error) {
      return res.status(503).json({
        success: false,
        status: 503,
        code: "REVERSE_GEOCODE_UNAVAILABLE",
        message: "Không xác định được địa chỉ mới.",
      });
    }
  }

  async getRoute(req: Request, res: Response) {
    const originLat = parseCoordinate(req.query.originLat, -90, 90);
    const originLng = parseCoordinate(req.query.originLng, -180, 180);
    const destLat = parseCoordinate(req.query.destLat, -90, 90);
    const destLng = parseCoordinate(req.query.destLng, -180, 180);

    if (
      originLat === null ||
      originLng === null ||
      destLat === null ||
      destLng === null
    ) {
      return res.status(400).json({
        success: false,
        status: 400,
        code: "INVALID_ROUTE_COORDINATES",
        message: "Thiếu tọa độ để tìm đường.",
      });
    }

    const profile =
      typeof req.query.profile === "string" && req.query.profile.trim()
        ? req.query.profile.trim()
        : "driving";
    const supportedProfiles = new Set(["driving", "walking", "cycling"]);
    const safeProfile = supportedProfiles.has(profile) ? profile : "driving";
    const coordinates = `${originLng},${originLat};${destLng},${destLat}`;

    try {
      const response = await axios.get<OsrmResponse>(
        `${OSRM_ROUTE_URL}/${safeProfile}/${coordinates}`,
        {
          params: {
            overview: "full",
            geometries: "geojson",
            steps: true,
          },
          headers: {
            "User-Agent": "BQDrive/1.0 OSRM route preview",
            Accept: "application/json",
          },
          timeout: 8000,
        },
      );
      const route = response.data?.routes?.[0];

      if (
        response.data?.code !== "Ok" ||
        !route?.geometry ||
        !Array.isArray(route.geometry.coordinates)
      ) {
        return res.status(200).json({
          success: false,
          status: 200,
          code: "NO_ROUTE_FOUND",
          message: "Không tìm được tuyến đường phù hợp.",
        });
      }

      const distanceMeters = Number(route.distance || 0);
      const durationSeconds = Number(route.duration || 0);
      const steps = (route.legs || [])
        .flatMap((leg) => leg.steps || [])
        .map((step) => ({
          name: step.name || "",
          distance: Number(step.distance || 0),
          duration: Number(step.duration || 0),
          maneuverType: step.maneuver?.type || "",
          instruction: buildStepInstruction(step),
        }));

      return res.status(200).json({
        success: true,
        status: 200,
        code: "200",
        message: "success",
        data: {
          distanceMeters,
          distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
          durationSeconds,
          durationText: formatDurationText(durationSeconds),
          geometry: route.geometry,
          steps,
        },
      });
    } catch (error) {
      return res.status(503).json({
        success: false,
        status: 503,
        code: "ROUTE_SERVICE_UNAVAILABLE",
        message: "Không tìm được tuyến đường phù hợp.",
      });
    }
  }
}

export default new MapsRoute().router;
