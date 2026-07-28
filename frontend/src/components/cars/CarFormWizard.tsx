import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
} from "lucide-react";
import type { ReactNode } from "react";

const CAR_FORM_STEPS = [
  "Thông tin xe",
  "Bảng giá",
  "ODO và kilomet",
  "Giao xe và địa điểm",
  "Hình ảnh và mô tả",
  "Kiểm tra và gửi duyệt",
] as const;

export type CarFormStep = 1 | 2 | 3 | 4 | 5 | 6;

type CarFormStepperProps = {
  currentStep: CarFormStep;
  highestStep: CarFormStep;
  onStepChange: (step: CarFormStep) => void;
};

export function CarFormStepper({
  currentStep,
  highestStep,
  onStepChange,
}: CarFormStepperProps) {
  return (
    <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
      <ol className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {CAR_FORM_STEPS.map((label, index) => {
          const step = (index + 1) as CarFormStep;
          const isCurrent = step === currentStep;
          const isCompleted = step < highestStep && !isCurrent;

          return (
            <li key={label} className="min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (step <= highestStep) onStepChange(step);
                }}
                disabled={step > highestStep}
                className={`group flex w-full items-center gap-2 rounded-lg border p-2 text-left transition duration-300 ${
                  isCurrent
                    ? "border-secondary bg-primary text-white shadow-[0_0_20px_rgba(234,179,8,0.24)]"
                    : isCompleted
                      ? "border-secondary/70 bg-yellow-50 text-primary shadow-[0_0_18px_rgba(234,179,8,0.2)] hover:-translate-y-0.5 hover:bg-yellow-100 hover:shadow-[0_0_24px_rgba(234,179,8,0.3)]"
                      : "cursor-default border-transparent bg-slate-50 text-slate-400"
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                    isCurrent
                      ? "bg-secondary text-primary"
                      : isCompleted
                        ? "bg-emerald-700 text-white shadow-sm ring-1 ring-inset ring-emerald-800"
                        : "border border-slate-200 bg-white"
                  }`}
                >
                  {isCompleted ? <Check size={15} strokeWidth={3} /> : step}
                </span>
                <span
                  className={`min-w-0 text-xs font-extrabold leading-4 ${
                    isCurrent ? "block" : "hidden sm:block"
                  }`}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type CarFormNavigationProps = {
  currentStep: CarFormStep;
  editing: boolean;
  hasChanges: boolean;
  submitting: boolean;
  uploading: boolean;
  onBack: () => void;
  onCancel: () => void;
  onNext: () => void;
  onSubmit: () => void;
};

export function CarFormNavigation({
  currentStep,
  editing,
  hasChanges,
  submitting,
  uploading,
  onBack,
  onCancel,
  onNext,
  onSubmit,
}: CarFormNavigationProps) {
  const busy = submitting || uploading;
  const isLastStep = currentStep === CAR_FORM_STEPS.length;

  return (
    <div className="sticky bottom-0 z-20 mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-1 pb-1 pt-4 backdrop-blur sm:flex-row sm:items-center">
      {currentStep > 1 && (
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2 font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <ChevronLeft size={18} />
          Quay lại
        </button>
      )}

      <div className="flex flex-1 flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-lg border border-slate-200 bg-white px-5 py-2 font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          Hủy
        </button>

        <button
          type="button"
          onClick={isLastStep ? onSubmit : onNext}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary transition hover:bg-secondaryDark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy && <Loader2 size={18} className="animate-spin" />}
          {uploading
            ? "Đang upload ảnh..."
            : isLastStep
              ? editing
                ? hasChanges
                  ? "Lưu thay đổi"
                  : "Kết thúc"
                : "Gửi xe cho Admin duyệt"
              : "Tiếp theo"}
          {!busy && !isLastStep && <ChevronRight size={18} />}
        </button>
      </div>
    </div>
  );
}

type CarReviewGroupProps = {
  title: string;
  step: CarFormStep;
  onEdit: (step: CarFormStep) => void;
  children: ReactNode;
};

export function CarReviewGroup({
  title,
  step,
  onEdit,
  children,
}: CarReviewGroupProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="-mx-4 -mt-4 mb-4 flex items-center justify-between gap-4 rounded-t-lg border-b border-secondary/40 bg-yellow-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-7 w-1 shrink-0 rounded-full bg-secondary shadow-[0_0_10px_rgba(234,179,8,0.45)]"
            aria-hidden="true"
          />
          <h4 className="font-extrabold text-primary">{title}</h4>
        </div>
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm font-extrabold text-primary shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-secondaryDark hover:shadow-md"
        >
          <Pencil size={15} />
          Chỉnh sửa
        </button>
      </div>
      {children}
    </section>
  );
}

export function ReviewValue({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  const hasValue = value !== null && value !== undefined && value !== "";

  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <div className="mt-1 break-words text-sm font-bold text-slate-700">
        {hasValue ? value : "Chưa cập nhật"}
      </div>
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="mt-1 text-xs font-bold text-red-600" role="alert">
      {message}
    </p>
  );
}
