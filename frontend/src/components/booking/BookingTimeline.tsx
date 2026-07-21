import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  Info,
} from "lucide-react";
import type { ReactNode } from "react";

import type { BookingTimelineView } from "../../utils/bookingTimeline.util";

const toneClasses = {
  blue: {
    panel: "border-primary/20 bg-primary/5 text-primary",
    badge: "bg-primary text-secondary",
    current: "border-primary bg-primary text-secondary",
  },
  green: {
    panel: "border-emerald-200 bg-emerald-50 text-emerald-800",
    badge: "bg-emerald-600 text-white",
    current: "border-emerald-600 bg-emerald-600 text-white",
  },
  yellow: {
    panel: "border-secondary/40 bg-secondarySoft text-primary",
    badge: "bg-secondary text-primary",
    current: "border-secondary bg-secondary text-primary",
  },
  red: {
    panel: "border-red-200 bg-red-50 text-red-700",
    badge: "bg-red-600 text-white",
    current: "border-red-600 bg-red-600 text-white",
  },
  gray: {
    panel: "border-slate-200 bg-slate-100 text-slate-700",
    badge: "bg-slate-700 text-white",
    current: "border-slate-700 bg-slate-700 text-white",
  },
};

function getStepClass(
  state: "completed" | "current" | "upcoming" | "problem",
  tone: BookingTimelineView["tone"],
) {
  if (state === "completed") {
    return "border-secondary bg-secondarySoft text-primary";
  }

  if (state === "current") {
    return toneClasses[tone].current;
  }

  if (state === "problem") {
    return "border-red-500 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-white text-slate-500";
}

function StepIcon({
  state,
}: {
  state: "completed" | "current" | "upcoming" | "problem";
}) {
  if (state === "completed") return <CheckCircle2 size={18} />;
  if (state === "current") return <CircleDot size={18} />;
  if (state === "problem") return <AlertTriangle size={18} />;

  return <Circle size={18} />;
}

export function BookingStatusBadge({
  timeline,
}: {
  timeline: BookingTimelineView;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-extrabold ${toneClasses[timeline.tone].badge}`}
    >
      <Info size={15} />
      {timeline.displayStatus}
    </span>
  );
}

export function BookingTimeline({
  timeline,
  compact = false,
}: {
  timeline: BookingTimelineView;
  compact?: boolean;
}) {
  return (
    <div
      className={`grid gap-3 ${
        compact ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-4 xl:grid-cols-7"
      }`}
    >
      {timeline.steps.map((step, index) => (
        <div
          key={step.key}
          className={`rounded-lg border p-3 ${getStepClass(
            step.state,
            timeline.tone,
          )}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold">
              {String(index + 1).padStart(2, "0")}
            </span>
            <StepIcon state={step.state} />
          </div>
          <p className="mt-3 text-sm font-extrabold leading-5">{step.label}</p>
        </div>
      ))}
    </div>
  );
}

export function BookingNextAction({
  timeline,
  actionSlot,
}: {
  timeline: BookingTimelineView;
  actionSlot?: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border p-4 text-sm font-semibold leading-6 ${toneClasses[timeline.tone].panel}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase opacity-80">
            Việc cần làm tiếp theo
          </p>
          <p className="mt-1">{timeline.nextActionText}</p>
        </div>
        {actionSlot && <div className="shrink-0">{actionSlot}</div>}
      </div>
    </div>
  );
}
