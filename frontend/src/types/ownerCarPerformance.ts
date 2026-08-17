//  Kiểu dữ liệu thống kê hiệu quả hoạt động của xe ký gửi.
export type OwnerCarPerformanceRange =
  | "today"
  | "7d"
  | "this_month"
  | "all";

export type OwnerCarPerformanceReview = {
  _id: string;
  rating: number;
  criteria: {
    vehicleQuality?: number;
    cleanliness?: number;
    descriptionAccuracy?: number;
    handoverService?: number;
    ownerAttitude?: number;
    punctuality?: number;
  };
  comment: string;
  reviewerName: string;
  createdAt?: string;
};

export type OwnerCarPerformanceResponse = {
  car: {
    _id: string;
    carCode?: string | null;
    name: string;
    licensePlate: string;
    image?: string | null;
  };
  range: {
    value: OwnerCarPerformanceRange;
    startDate?: string | null;
    endDate: string;
  };
  operations: {
    totalBookings: number;
    completedTrips: number;
    activeTrips: number;
    upcomingBookings: number;
    cancelledBookings: number;
    rejectedBookings: number;
    noShowBookings: number;
  };
  finance: {
    rentalRevenue: number;
    extraChargeCollected: number;
    refundedAmount: number;
    netCollected: number;
    pendingCollection: number;
    pendingBookingAmount: number;
    pendingExtraChargeAmount: number;
  };
  reviews: {
    reviewCount: number;
    averageRating: number | null;
    lowRatingCount: number;
    recentReviews: OwnerCarPerformanceReview[];
  };
};
