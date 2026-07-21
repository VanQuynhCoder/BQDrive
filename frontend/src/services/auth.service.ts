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
};

export type ChangePasswordData = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

function normalizeUserRole(role?: string) {
  const normalizedRole = role?.toUpperCase();

  if (normalizedRole === "ADMIN" || normalizedRole === "BUSINESS") {
    return normalizedRole;
  }

  return "USER";
}

function normalizeUser<T extends { role?: string }>(user: T): T & { role: string } {
  return {
    ...user,
    role: normalizeUserRole(user.role),
  };
}

function persistUser<T extends { role?: string }>(
  user: T,
  emitUpdate = true,
): T & { role: string } {
  const normalizedUser = normalizeUser(user);
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
      business: res.data.data.business,
    };
  },

  updateUserProfile: async (data: UpdateUserProfileData) => {
    const res = await api.patch("/auth/profile", data);
    return persistUser(res.data.data.user) as CurrentUserProfile;
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




