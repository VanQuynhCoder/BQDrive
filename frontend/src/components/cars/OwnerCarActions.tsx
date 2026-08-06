// Shared owner UI: car action menu used by BUSINESS and USER consignment lists.
import {
  Edit,
  Eye,
  EyeOff,
  MapPinned,
  MoreVertical,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { isOwnerCarHidden } from "../../utils/ownerCarList.util";

type ActionCar = {
  status?: string;
  isHidden?: boolean;
  hiddenByOwner?: boolean;
  hiddenByAdmin?: boolean;
};

type OwnerCarActionsProps = {
  car: ActionCar;
  variant: "desktop" | "mobile";
  visibilityLoading?: boolean;
  onView: () => void;
  onEdit: () => void;
  onManageLocation: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
  onResubmit: () => void;
};

type ActionItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  show: boolean;
  disabled?: boolean;
  tone?: "default" | "warning" | "danger";
};

type MenuPosition = {
  left: number;
  top: number;
};

export default function OwnerCarActions({
  car,
  variant,
  visibilityLoading = false,
  onView,
  onEdit,
  onManageLocation,
  onToggleVisibility,
  onDelete,
  onResubmit,
}: OwnerCarActionsProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const hidden = isOwnerCarHidden(car);
  const canModify = car.status !== "RENTED";

  const actions: ActionItem[] = [
    {
      key: "view",
      label: "Xem chi tiết",
      icon: Eye,
      onClick: onView,
      show: true,
    },
    {
      key: "edit",
      label: "Chỉnh sửa",
      icon: Edit,
      onClick: onEdit,
      show: canModify,
    },
    {
      key: "location",
      label: "Quản lý vị trí",
      icon: MapPinned,
      onClick: onManageLocation,
      show: true,
    },
    {
      key: "visibility",
      label: hidden ? "Hiện xe" : "Ẩn xe",
      icon: hidden ? Eye : EyeOff,
      onClick: onToggleVisibility,
      show: canModify,
      disabled: visibilityLoading,
      tone: "warning",
    },
    {
      key: "resubmit",
      label: "Gửi lại duyệt",
      icon: RotateCcw,
      onClick: onResubmit,
      show: car.status === "REJECTED",
      tone: "warning",
    },
    {
      key: "delete",
      label: "Xóa xe",
      icon: Trash2,
      onClick: onDelete,
      show: canModify,
      tone: "danger",
    },
  ];
  const visibleActions = actions.filter((action) => action.show);

  const calculatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return null;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 224;
    const menuHeight = visibleActions.length * 44 + 16;
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
    menuRef.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }

    setPosition(calculatePosition());
    setOpen(true);
  };

  const menu =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Thao tác xe"
            style={{ left: position.left, top: position.top }}
            className="fixed z-[7000] w-56 overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {visibleActions.map((action) => {
              const Icon = action.icon;
              const toneClass =
                action.tone === "danger"
                  ? "text-red-700 hover:bg-red-50"
                  : action.tone === "warning"
                    ? "text-amber-800 hover:bg-amber-50"
                    : "text-primary hover:bg-slate-100";

              return (
                <button
                  key={action.key}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                    action.onClick();
                  }}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-secondary disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggleMenu();
        }}
        aria-label="Mở menu thao tác xe"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Thao tác xe"
        className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-primary bg-primary font-bold text-secondary shadow-md transition hover:bg-primaryDark focus:outline-none focus:ring-4 focus:ring-secondary/30 ${
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
