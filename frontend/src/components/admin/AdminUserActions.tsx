import { Eye, Lock, MoreVertical, Trash2, Unlock } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AdminUserActionsProps = {
  userName: string;
  isBlocked: boolean;
  variant: "desktop" | "mobile";
  onView: () => void;
  onToggleBlock: () => void;
  onDelete: () => void;
};

type MenuPosition = {
  left: number;
  top: number;
};

export default function AdminUserActions({
  userName,
  isBlocked,
  variant,
  onView,
  onToggleBlock,
  onDelete,
}: AdminUserActionsProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const calculatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return null;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 224;
    const menuHeight = 148;
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(
        rect.right - menuWidth,
        window.innerWidth - menuWidth - viewportPadding,
      ),
    );
    const hasSpaceBelow =
      rect.bottom + menuHeight + viewportPadding <= window.innerHeight;

    return {
      left,
      top: hasSpaceBelow
        ? rect.bottom + viewportPadding
        : Math.max(viewportPadding, rect.top - menuHeight - viewportPadding),
    };
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnViewportChange = () => setOpen(false);

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  const runAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  const menu =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Thao tác tài khoản ${userName}`}
            style={{ left: position.left, top: position.top }}
            className="fixed z-[7000] w-56 overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onView)}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-bold text-primary transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-secondary"
            >
              <Eye size={18} />
              Xem chi tiết
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onToggleBlock)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-secondary ${
                isBlocked
                  ? "text-emerald-700 hover:bg-emerald-50"
                  : "text-amber-800 hover:bg-amber-50"
              }`}
            >
              {isBlocked ? <Unlock size={18} /> : <Lock size={18} />}
              {isBlocked ? "Mở khóa" : "Khóa tài khoản"}
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onDelete)}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-bold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-secondary"
            >
              <Trash2 size={18} />
              Xóa tài khoản
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="inline-flex" onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          setPosition(calculatePosition());
          setOpen(true);
        }}
        aria-label={`Mở menu thao tác tài khoản ${userName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-primary bg-primary text-secondary shadow-md transition hover:bg-primaryDark focus:outline-none focus:ring-4 focus:ring-secondary/30 ${
          variant === "mobile"
            ? "ring-1 ring-white/70"
            : "ring-1 ring-slate-200"
        }`}
      >
        <MoreVertical size={21} />
      </button>
      {menu}
    </div>
  );
}
