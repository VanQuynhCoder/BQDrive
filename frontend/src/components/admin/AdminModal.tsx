import { X } from "lucide-react";
import type { ReactNode } from "react";

type AdminModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm?: () => void;
};

export default function AdminModal({
  open,
  title,
  description,
  children,
  confirmText = "Xác nhận",
  cancelText = "Hủy",
  danger = false,
  loading = false,
  onClose,
  onConfirm,
}: AdminModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-primary/20 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 bg-primary px-6 py-5">
          <div>
            <h2 className="text-xl font-extrabold text-secondary">{title}</h2>
            {description && (
              <p className="mt-1 text-sm font-semibold leading-6 text-white/75">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-secondary"
            aria-label="Đóng modal"
          >
            <X size={19} />
          </button>
        </div>

        {children && <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-5 py-2 font-bold text-primary transition hover:border-secondary hover:bg-secondarySoft/70"
          >
            {cancelText}
          </button>

          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`min-h-11 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary shadow-sm transition hover:bg-secondaryLight disabled:cursor-not-allowed disabled:opacity-60 ${
                danger ? "ring-1 ring-red-200" : ""
              }`}
            >
              {loading ? "Đang xử lý..." : confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}







