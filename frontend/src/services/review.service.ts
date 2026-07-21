import api from "./api";

export type ReviewCriteria = {
  vehicleQuality?: number;
  cleanliness?: number;
  descriptionAccuracy?: number;
  handoverService?: number;
  ownerAttitude?: number;
  punctuality?: number;
};

export type ReviewOwnerReply = {
  content?: string;
  repliedAt?: string;
  updatedAt?: string;
};

export type ReviewReport = {
  reason?: string;
  reportedAt?: string;
};

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
  renterAvatar?: string;
  reviewerName?: string;
  reviewerAvatar?: string;
  rating: number;
  criteria?: ReviewCriteria;
  comment?: string;
  images?: string[];
  ownerReply?: ReviewOwnerReply | null;
  status?: "VISIBLE" | "REPORTED" | "HIDDEN" | string;
  report?: ReviewReport | null;
  helpfulCount?: number;
  verifiedRental?: boolean;
  canEdit?: boolean;
  isEdited?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CarReviewSummary = {
  averageRating: number;
  reviewCount: number;
  page?: number;
  limit?: number;
  distribution?: Record<string, number>;
  reviews: ReviewItem[];
};

export type OwnerReviewStatistics = {
  totalReviews: number;
  averageRating: number;
  fiveStarCount: number;
  lowRatingCount: number;
  unrepliedCount: number;
  distribution: Record<string, number>;
};

export type ReviewPayload = {
  bookingId?: string;
  rating: number;
  criteria?: ReviewCriteria;
  comment?: string;
  images?: string[];
};

export const reviewService = {
  createReview: async (data: ReviewPayload & { bookingId: string }) => {
    const res = await api.post("/reviews", data);
    return res.data.data.review as ReviewItem;
  },

  updateReview: async (reviewId: string, data: ReviewPayload) => {
    const res = await api.patch(`/reviews/${reviewId}`, data);
    return res.data.data.review as ReviewItem;
  },

  getBookingReview: async (bookingId: string) => {
    const res = await api.get(`/reviews/booking/${bookingId}`);
    return (res.data.data.review || null) as ReviewItem | null;
  },

  getCarReviews: async (
    carId: string,
    params: {
      page?: number;
      limit?: number;
      rating?: number;
      sort?: "newest" | "oldest" | "highest" | "lowest";
      hasImages?: boolean;
      hasComment?: boolean;
      hasReply?: boolean;
    } = {},
  ) => {
    const res = await api.get(`/cars/${carId}/reviews`, { params });
    return res.data.data as CarReviewSummary;
  },

  getOwnerReviews: async () => {
    const res = await api.get("/owner/reviews");
    return (res.data.data.reviews || []) as ReviewItem[];
  },

  getOwnerReviewStatistics: async () => {
    const res = await api.get("/owner/reviews/statistics");
    return res.data.data as OwnerReviewStatistics;
  },

  replyReview: async (reviewId: string, content: string) => {
    const res = await api.post(`/owner/reviews/${reviewId}/reply`, { content });
    return res.data.data.review as ReviewItem;
  },

  reportReview: async (reviewId: string, reason: string) => {
    const res = await api.post(`/owner/reviews/${reviewId}/report`, { reason });
    return res.data.data.review as ReviewItem;
  },
};
