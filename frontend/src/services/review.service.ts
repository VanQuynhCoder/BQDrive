import api from "./api";

export type ReviewItem = {
  id: string;
  _id?: string;
  bookingId?: string;
  bookingCode?: string;
  carId?: string;
  carName?: string;
  carImage?: string;
  licensePlate?: string;
  renterName?: string;
  renterEmail?: string;
  reviewerName?: string;
  rating: number;
  comment?: string;
  createdAt?: string;
};

export type CarReviewSummary = {
  averageRating: number;
  reviewCount: number;
  reviews: ReviewItem[];
};

export const reviewService = {
  createReview: async (data: {
    bookingId: string;
    rating: number;
    comment?: string;
  }) => {
    const res = await api.post("/reviews", data);
    return res.data.data.review as ReviewItem;
  },

  getBookingReview: async (bookingId: string) => {
    const res = await api.get(`/reviews/booking/${bookingId}`);
    return (res.data.data.review || null) as ReviewItem | null;
  },

  getCarReviews: async (carId: string, params: { page?: number; limit?: number } = {}) => {
    const res = await api.get(`/cars/${carId}/reviews`, { params });
    return res.data.data as CarReviewSummary;
  },

  getOwnerReviews: async () => {
    const res = await api.get("/owner/reviews");
    return (res.data.data.reviews || []) as ReviewItem[];
  },
};
