import { CheckCircle2, UserRound, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";

import {
  consumeWelcomeBack,
  type WelcomeBackPayload,
} from "../utils/welcomeBack.util";

const DISPLAY_DURATION_MS = 4800;
const EXIT_DURATION_MS = 300;

const roleLabels: Record<string, string> = {
  ADMIN: "Quản trị viên",
  BUSINESS: "Đối tác doanh nghiệp",
  USER: "Khách hàng",
};

function getInitials(displayName: string) {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export default function WelcomeBackToast() {
  const location = useLocation();
  const [welcome, setWelcome] = useState<WelcomeBackPayload | null>(null);
  const [closing, setClosing] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const closeWelcome = useCallback(() => {
    if (!welcome || closing) return;
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(true);
    exitTimerRef.current = window.setTimeout(() => {
      setWelcome(null);
      setClosing(false);
      exitTimerRef.current = null;
    }, EXIT_DURATION_MS);
  }, [closing, welcome]);

  useEffect(() => {
    if (location.pathname === "/login") return;

    const activationTimer = window.setTimeout(() => {
      const pendingWelcome = consumeWelcomeBack();
      if (!pendingWelcome) return;

      clearTimers();
      setAvatarFailed(false);
      setClosing(false);
      setWelcome(pendingWelcome);
    }, 0);

    return () => window.clearTimeout(activationTimer);
  }, [clearTimers, location.pathname]);

  useEffect(() => {
    if (!welcome || closing) return;

    closeTimerRef.current = window.setTimeout(
      closeWelcome,
      DISPLAY_DURATION_MS,
    );

    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [closeWelcome, closing, welcome]);

  useEffect(() => clearTimers, [clearTimers]);

  const initials = useMemo(
    () => (welcome ? getInitials(welcome.displayName) : ""),
    [welcome],
  );
  const roleLabel = welcome?.role ? roleLabels[welcome.role] : undefined;

  if (!welcome) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className={`welcome-back-toast fixed left-3 right-3 top-20 z-[45] overflow-hidden rounded-2xl border border-yellow-300 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)] sm:left-auto sm:right-6 sm:top-24 sm:w-[min(380px,calc(100vw-48px))] ${
        closing ? "is-closing" : ""
      }`}
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-secondary" />

      <div className="flex items-start gap-3 py-4 pl-5 pr-4">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-yellow-300 bg-yellow-100">
          {welcome.avatar && !avatarFailed ? (
            <img
              src={welcome.avatar}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : initials ? (
            <span className="flex h-full w-full items-center justify-center text-sm font-extrabold text-primary">
              {initials}
            </span>
          ) : (
            <UserRound
              size={23}
              className="absolute inset-0 m-auto text-primary"
            />
          )}
          <CheckCircle2
            size={17}
            className="absolute bottom-0 right-0 rounded-full bg-white text-secondary"
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-base font-extrabold leading-6 text-primary">
                Xin chào, {welcome.displayName}!
                <span className="ml-1" aria-hidden="true">
                  👋
                </span>
              </h2>
              {roleLabel && (
                <span className="mt-1.5 inline-flex rounded-full border border-yellow-300 bg-yellow-50 px-2.5 py-1 text-xs font-extrabold text-primary">
                  {roleLabel}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={closeWelcome}
              aria-label="Đóng thông báo chào mừng"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-primary"
            >
              <X size={18} />
            </button>
          </div>

          <p className="mt-3 text-sm font-semibold leading-5 text-slate-600">
            Chào mừng bạn quay trở lại BQDrive.
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            Chúc bạn có một hành trình thuận lợi.
          </p>
        </div>
      </div>

      <div
        className="welcome-back-progress h-[3px] origin-left bg-secondary"
        style={{ animationDuration: `${DISPLAY_DURATION_MS}ms` }}
        aria-hidden="true"
      />
    </aside>
  );
}
