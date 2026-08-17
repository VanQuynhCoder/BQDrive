import api from "./api";

export type SupportConversationStatus = "OPEN" | "CLOSED";

export type SupportSender = {
  _id: string;
  name: string;
  avatar?: string | null;
  role: "USER" | "ADMIN";
};

export type SupportMessage = {
  _id: string;
  conversationId: string;
  sender: SupportSender;
  content: string;
  createdAt: string;
  updatedAt?: string;
};

export type UserSupportConversation = {
  _id: string;
  status: SupportConversationStatus;
  lastMessageAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminSupportConversation = UserSupportConversation & {
  user: {
    _id: string;
    name: string;
    avatar?: string | null;
    email: string;
  };
};

export const supportService = {
  getMyConversation: async (limit = 100) => {
    const response = await api.get("/support/my-conversation", {
      params: { limit },
    });
    return response.data.data as {
      conversation: UserSupportConversation | null;
      messages: SupportMessage[];
    };
  },

  getAdminConversations: async () => {
    const response = await api.get("/support/admin/conversations");
    return (response.data.data.conversations || []) as AdminSupportConversation[];
  },

  getAdminMessages: async (conversationId: string, limit = 100) => {
    const response = await api.get(
      `/support/admin/conversations/${conversationId}/messages`,
      { params: { limit } },
    );
    return (response.data.data.messages || []) as SupportMessage[];
  },

  updateStatus: async (
    conversationId: string,
    status: SupportConversationStatus,
  ) => {
    const response = await api.patch(
      `/support/admin/conversations/${conversationId}/status`,
      { status },
    );
    return response.data.data.conversation as AdminSupportConversation;
  },
};
