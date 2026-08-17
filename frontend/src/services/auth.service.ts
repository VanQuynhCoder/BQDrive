// Shared authentication API: session and account flows for ADMIN and USER.
import api from "./api";

export type LoginData = {
  email: string;
  password: string;
};

export type RegisterData = {
  name: string;
  email: string;
  password: string;
  phone?: string;
};

export type SendOtpData = {
  email: string;
};

export type VerifyOtpData = {
  email: string;
  otp: string;
};

export type ResetPasswordData = {
  email: string;
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
};

export type CurrentUserProfile = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  bio?: string;
  cccdNumber?: string;
  cccdFrontImage?: string;
  cccdBackImage?: string;
  driverLicenseNumber?: string;
  driverLicenseImage?: string;
  driverLicenseClass?: "B" | "B1" | "B2";
  identityProfileCompleted?: boolean;
  identityVerificationStatus?: "INCOMPLETE" | "PENDING" | "VERIFIED" | "REJECTED";
  identityVerificationReason?: string;
  identitySubmittedAt?: string;
  identityReviewedAt?: string;
  role: string;
  hasLocalPassword?: boolean;
  createdAt?: string;
};

export type UpdateUserProfileData = {
  name: string;
  phone?: string;
  avatar?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  bio?: string;
  cccdNumber?: string;
  cccdFrontImage?: string;
  cccdBackImage?: string;
  driverLicenseNumber?: string;
  driverLicenseImage?: string;
  driverLicenseClass?: "B" | "B1" | "B2";
};

export type ChangePasswordData = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

function normalizeUserRole(role?: string) {
  const normalizedRole = role?.toUpperCase();

  if (normalizedRole === "ADMIN") {
    return "ADMIN";
  }

  return "USER";
}
function normalizeUser<T extends { role?: string }>(user: T): T & { role: string } {
  return {
    ...user,
    role: normalizeUserRole(user.role),
  };
}

function toSessionUser<T extends { role?: string }>(user: T) {
  const {
    cccdNumber,
    cccdFrontImage,
    cccdBackImage,
    driverLicenseNumber,
    driverLicenseImage,
    ...safeUser
  } = user as T & Record<string, unknown>;

  return safeUser;
}

function persistUser<T extends { role?: string }>(
  user: T,
  emitUpdate = true,
): T & { role: string } {
  const normalizedUser = normalizeUser(toSessionUser(user) as T);
  localStorage.setItem("user", JSON.stringify(normalizedUser));
  localStorage.setItem("role", normalizedUser.role);
  if (emitUpdate) {
    window.dispatchEvent(new Event("bqdrive:user-updated"));
  }
  return normalizedUser;
}

export const authService = {
  login: async (data: LoginData) => {
    const res = await api.post("/auth/login", data);

    const token = res.data.data.token;
    const user = normalizeUser(res.data.data.user);

    localStorage.setItem("token", token);
    persistUser(user);

    return {
      token,
      user,
    };
  },

  register: async (data: RegisterData) => {
    const res = await api.post("/auth/register", data);
    return res.data.data.user;
  },

  sendOtp: async (data: SendOtpData) => {
    const res = await api.post("/auth/send-otp", data);
    return res.data;
  },

  verifyOtp: async (data: VerifyOtpData) => {
    const res = await api.post("/auth/verify-otp", data);
    return res.data;
  },

  forgotPassword: async (email: string) => {
    const res = await api.post("/auth/forgot-password", { email });
    return res.data;
  },

  verifyResetOtp: async (email: string, otp: string) => {
    const res = await api.post("/auth/verify-reset-otp", { email, otp });
    return res.data;
  },

  resetPassword: async (data: ResetPasswordData) => {
    const res = await api.post("/auth/reset-password", data);
    return res.data;
  },

getProfile: async () => {
  const res = await api.get("/auth/profile");

  return {
    user: normalizeUser(res.data.data.user) as CurrentUserProfile,
  };
},

  updateUserProfile: async (data: UpdateUserProfileData) => {
    const res = await api.patch("/auth/profile", data);
    const updatedUser = normalizeUser(res.data.data.user) as CurrentUserProfile;
    persistUser(updatedUser);
    return updatedUser;
  },

  changePassword: async (data: ChangePasswordData) => {
    const res = await api.patch("/auth/change-password", data);
    return res.data;
  },

  googleLogin: async (data: { credential?: string; accessToken?: string }) => {
    const res = await api.post("/auth/google-login", data);

    const token = res.data.data.token;
    const user = normalizeUser(res.data.data.user);

    localStorage.setItem("token", token);
    persistUser(user);

    return {
      token,
      user,
    };
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
  },

  getCurrentUser: () => {
    const user = localStorage.getItem("user");

    if (!user) return null;

    return persistUser(JSON.parse(user), false);
  },

  getToken: () => {
    return localStorage.getItem("token");
  },

  isLoggedIn: () => {
    return !!localStorage.getItem("token");
  },

  getRole: () => {
    const role = normalizeUserRole(localStorage.getItem("role") || undefined);
    localStorage.setItem("role", role);
    return role;
  },
};


