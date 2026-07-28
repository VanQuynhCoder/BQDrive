export type WelcomeBackUser = {
  name?: string;
  fullName?: string;
  email?: string;
  avatar?: string;
  role?: string;
};

export type WelcomeBackPayload = {
  displayName: string;
  avatar?: string;
  role?: string;
};

const WELCOME_BACK_STORAGE_KEY = "bqdrive:welcome-back";

function getDisplayName(user: WelcomeBackUser) {
  const name = user.name?.trim();
  if (name) return name;

  const fullName = user.fullName?.trim();
  if (fullName) return fullName;

  const emailName = user.email?.split("@")[0]?.trim();
  return emailName || "bạn";
}

export function queueWelcomeBack(user: WelcomeBackUser) {
  const payload: WelcomeBackPayload = {
    displayName: getDisplayName(user),
    avatar: user.avatar?.trim() || undefined,
    role: user.role?.trim().toUpperCase() || undefined,
  };

  try {
    sessionStorage.setItem(
      WELCOME_BACK_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Login must still complete if browser storage is unavailable.
  }
}

export function consumeWelcomeBack() {
  try {
    const serializedPayload = sessionStorage.getItem(
      WELCOME_BACK_STORAGE_KEY,
    );
    if (!serializedPayload) return null;

    sessionStorage.removeItem(WELCOME_BACK_STORAGE_KEY);
    return JSON.parse(serializedPayload) as WelcomeBackPayload;
  } catch {
    return null;
  }
}
