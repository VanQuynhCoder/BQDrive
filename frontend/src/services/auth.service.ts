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

export const authService = {
  login: async (data: LoginData) => {
    const res = await api.post("/auth/login", data);

    const token = res.data.data.token;
    const user = res.data.data.user;

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

  googleLogin: async (credential: string) => {
    const res = await api.post("/auth/google-login", {
      credential,
    });

    const token = res.data.data.token;
    const user = res.data.data.user;

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

    return JSON.parse(user);
  },

  getToken: () => {
    return localStorage.getItem("token");
  },

  isLoggedIn: () => {
    return !!localStorage.getItem("token");
  },

  getRole: () => {
    return localStorage.getItem("role");
  },
};