import api from "./api";

export type OwnerMapCar = {
  _id: string;
  name: string;
  brandName?: string;
  licensePlate?: string;
  pickupAddress?: string;
  pickupFormattedAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupNote?: string;
  status: string;
  car_status?: string;
  approval_status?: string;
  ownerType?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  ownerAddress?: string;
  images?: string[];
  lastLocationUpdatedAt?: string;
  locationUpdateCount?: number;
};

export type UpdateCarLocationPayload = {
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  pickupFormattedAddress?: string;
  pickupNote?: string;
};

export const ownerCarLocationService = {
  getCarsMap: async () => {
    const res = await api.get("/owner/cars/map");
    return res.data.data.cars as OwnerMapCar[];
  },

  updateCarLocation: async (
    carId: string,
    payload: UpdateCarLocationPayload,
  ) => {
    const res = await api.patch(`/owner/cars/${carId}/location`, payload);
    return res.data.data.car as OwnerMapCar;
  },
};
