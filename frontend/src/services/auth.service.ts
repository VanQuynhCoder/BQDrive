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

export const authService = {
  login: async (data: LoginData) => {
    const res = await api.post("/auth/login", data);

    const token = res.data.data.token;
    const user = normalizeUser(res.data.data.user);

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("role", user.role);

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

  googleLogin: async (data: { credential?: string; accessToken?: string }) => {
    const res = await api.post("/auth/google-login", data);

    const token = res.data.data.token;
    const user = normalizeUser(res.data.data.user);

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("role", user.role);

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

    const parsedUser = normalizeUser(JSON.parse(user));
    localStorage.setItem("user", JSON.stringify(parsedUser));
    localStorage.setItem("role", parsedUser.role);

    return parsedUser;
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
