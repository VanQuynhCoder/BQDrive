import { Hash } from "lucide-react";

import type { CarFormStep } from "./CarFormWizard";

type CarCodeNoticeProps = {
  carCode?: string | null;
  editing: boolean;
  currentStep: CarFormStep;
};

export default function CarCodeNotice({
  carCode,
  editing,
  currentStep,
}: CarCodeNoticeProps) {
  const codeLabel = editing
    ? carCode || "Chưa được cấp"
    : "Tự động tạo sau khi hoàn tất";

  return (
    <section className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <Hash size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase text-amber-700">
            Mã xe
          </p>
          <p className="mt-0.5 break-words font-mono text-sm font-extrabold text-primary">
            {codeLabel}
          </p>
          {!editing && (
            <p className="mt-1 text-xs font-semibold text-slate-600">
              Hệ thống sẽ tự động cấp mã sau khi bạn hoàn tất thêm xe.
            </p>
          )}
        </div>
      </div>

      {currentStep === 6 && (
        <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
          Trạng thái sau khi gửi:{" "}
          <span className="text-amber-700">Chờ duyệt</span>
        </div>
      )}
    </section>
  );
}
