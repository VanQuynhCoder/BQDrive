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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-extrabold text-slate-950">{title}</h2>
            {description && (
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label="Đóng modal"
          >
            <X size={19} />
          </button>
        </div>

        {children && <div className="px-6 py-5">{children}</div>}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-slate-200 px-5 py-2 font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {cancelText}
          </button>

          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`min-h-11 rounded-lg px-5 py-2 font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                danger
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-secondary text-primary hover:brightness-95"
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
