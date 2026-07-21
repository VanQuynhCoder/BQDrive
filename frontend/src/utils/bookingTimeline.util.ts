export type BookingPerspective = "RENTER" | "OWNER" | "ADMIN";

export type BookingTimelineTone = "blue" | "green" | "yellow" | "red" | "gray";

export type BookingTimelineAction =
  | "COMPLETE_RENTER_INFO"
  | "PAY"
  | "CONFIRM"
  | "REJECT"
  | "HANDOVER"
  | "COMPLETE"
  | "NO_SHOW";

export type BookingTimelineStep = {
  key: string;
  label: string;
  state: "completed" | "current" | "upcoming" | "problem";
};

export type BookingTimelineView = {
  displayStatus: string;
  nextActionText: string;
  tone: BookingTimelineTone;
  steps: BookingTimelineStep[];
  allowedActions: BookingTimelineAction[];
  isPickupOverdue: boolean;
};

const PICKUP_GRACE_MINUTES = 30;

const renterSteps = [
  { key: "requested", label: "Đã gửi yêu cầu thuê" },
  { key: "owner-approved", label: "Chủ xe đã duyệt" },
  { key: "payment-pending", label: "Chờ thanh toán" },
  { key: "paid", label: "Đã thanh toán" },
  { key: "waiting-pickup", label: "Chờ nhận xe" },
  { key: "in-progress", label: "Đang thuê" },
  { key: "completed", label: "Hoàn tất" },
];

const ownerSteps = [
  { key: "requested", label: "Có yêu cầu thuê mới" },
  { key: "owner-approved", label: "Đã duyệt yêu cầu" },
  { key: "payment-pending", label: "Chờ khách thanh toán" },
  { key: "paid", label: "Khách đã thanh toán" },
  { key: "waiting-handover", label: "Chờ bàn giao xe" },
  { key: "in-progress", label: "Đang thuê" },
  { key: "completed", label: "Hoàn tất" },
];

function isOverdue(startDate?: string, currentTime: Date = new Date()) {
  if (!startDate) return false;

  const pickupTime = new Date(startDate).getTime();
  if (Number.isNaN(pickupTime)) return false;

  return currentTime.getTime() > pickupTime + PICKUP_GRACE_MINUTES * 60 * 1000;
}

function normalizeStatus(status?: string) {
  return (status || "PENDING").toUpperCase();
}

function buildSteps(
  perspective: BookingPerspective,
  currentIndex: number,
  problemStep?: string,
) {
  const baseSteps = perspective === "RENTER" ? renterSteps : ownerSteps;

  if (problemStep) {
    return [
      {
        ...baseSteps[0],
        state: "completed" as const,
      },
      {
        key: "problem",
        label: problemStep,
        state: "problem" as const,
      },
    ];
  }

  return baseSteps.map((step, index) => ({
    ...step,
    state:
      index < currentIndex
        ? ("completed" as const)
        : index === currentIndex
          ? ("current" as const)
          : ("upcoming" as const),
  }));
}

function getRenterCurrentIndex(status: string) {
  if (status === "WAITING_RENTER_INFO") return 0;
  if (status === "REQUESTED" || status === "PENDING") return 0;
  if (status === "OWNER_APPROVED") return 1;
  if (status === "PAYMENT_PENDING" || status === "WAITING_PAYMENT") return 2;
  if (status === "PAID" || status === "CONFIRMED") return 4;
  if (status === "IN_PROGRESS") return 5;
  if (status === "COMPLETED") return 6;
  return 0;
}

function getOwnerCurrentIndex(status: string) {
  if (status === "REQUESTED" || status === "PENDING") return 0;
  if (status === "OWNER_APPROVED") return 2;
  if (status === "PAYMENT_PENDING" || status === "WAITING_PAYMENT") return 2;
  if (status === "PAID" || status === "CONFIRMED") return 4;
  if (status === "IN_PROGRESS") return 5;
  if (status === "COMPLETED") return 6;
  return 0;
}

function getTerminalView(
  status: string,
  perspective: BookingPerspective,
  overdue: boolean,
): BookingTimelineView | null {
  if (status === "REJECTED") {
    return {
      displayStatus:
        perspective === "RENTER" ? "Yêu cầu bị từ chối" : "Đã từ chối",
      nextActionText:
        perspective === "RENTER"
          ? "Yêu cầu thuê xe bị từ chối."
          : "Bạn đã từ chối booking này.",
      tone: "red",
      steps: buildSteps(
        perspective,
        0,
        perspective === "RENTER" ? "Yêu cầu bị từ chối" : "Đã từ chối",
      ),
      allowedActions: [],
      isPickupOverdue: overdue,
    };
  }

  if (status === "CANCELLED") {
    return {
      displayStatus: "Booking đã hủy",
      nextActionText: "Booking đã hủy.",
      tone: "gray",
      steps: buildSteps(perspective, 0, "Booking đã hủy"),
      allowedActions: [],
      isPickupOverdue: overdue,
    };
  }

  if (status === "NO_SHOW") {
    return {
      displayStatus:
        perspective === "RENTER" ? "Không nhận xe" : "Khách không nhận xe",
      nextActionText:
        perspective === "RENTER"
          ? "Booking được đánh dấu khách không nhận xe."
          : "Khách không nhận xe.",
      tone: "red",
      steps: buildSteps(
        perspective,
        0,
        perspective === "RENTER" ? "Không nhận xe" : "Khách không nhận xe",
      ),
      allowedActions: [],
      isPickupOverdue: overdue,
    };
  }

  return null;
}

export function getBookingTimelineView({
  status,
  perspective,
  startDate,
  totalPrice,
  paidAmount,
  remainingAmount,
  currentTime = new Date(),
}: {
  status?: string;
  perspective: BookingPerspective;
  startDate?: string;
  totalPrice?: number;
  paidAmount?: number;
  remainingAmount?: number;
  currentTime?: Date;
}): BookingTimelineView {
  const normalizedStatus = normalizeStatus(status);
  const currentTimeValue =
    currentTime instanceof Date ? currentTime : new Date(currentTime);
  const overdue = isOverdue(startDate, currentTimeValue);
  const total = Number(totalPrice || 0);
  const paid = Number(paidAmount || 0);
  const remaining = Math.max(
    Number(remainingAmount || 0) || total - paid,
    0,
  );
  const hasDepositOnly = paid > 0 && remaining > 0;
  const terminalView = getTerminalView(
    normalizedStatus,
    perspective,
    overdue,
  );

  if (terminalView) return terminalView;

  if (perspective === "OWNER") {
    if (normalizedStatus === "REQUESTED" || normalizedStatus === "PENDING") {
      return {
        displayStatus: "Có yêu cầu thuê mới",
        nextActionText:
          "Có yêu cầu thuê xe mới. Hãy kiểm tra hồ sơ người thuê.",
        tone: "yellow",
        steps: buildSteps(perspective, getOwnerCurrentIndex(normalizedStatus)),
        allowedActions: ["CONFIRM", "REJECT"],
        isPickupOverdue: overdue,
      };
    }

    if (
      ["OWNER_APPROVED", "PAYMENT_PENDING", "WAITING_PAYMENT"].includes(
        normalizedStatus,
      )
    ) {
      return {
        displayStatus: "Đã duyệt, chờ khách thanh toán",
        nextActionText: overdue
          ? "Đã quá giờ nhận xe. Hãy bàn giao nếu khách đến trễ hoặc đánh dấu không nhận xe."
          : "Đã duyệt booking. Đang chờ khách thanh toán.",
        tone: overdue ? "red" : "blue",
        steps: buildSteps(perspective, getOwnerCurrentIndex(normalizedStatus)),
        allowedActions: overdue ? ["HANDOVER", "NO_SHOW"] : [],
        isPickupOverdue: overdue,
      };
    }

    if (normalizedStatus === "PAID" || normalizedStatus === "CONFIRMED") {
      return {
        displayStatus: hasDepositOnly
          ? "Khách đã cọc, chờ thu phần còn lại"
          : "Khách đã thanh toán, chờ bàn giao",
        nextActionText: overdue
          ? "Đã quá giờ nhận xe. Hãy bàn giao nếu khách đến trễ hoặc đánh dấu không nhận xe."
          : hasDepositOnly
            ? "Khách đã đặt cọc. Khi bàn giao xe, hãy thu phần còn lại rồi giao xe."
            : "Khách đã thanh toán. Đến giờ nhận xe, hãy bàn giao xe.",
        tone: overdue ? "red" : hasDepositOnly ? "yellow" : "green",
        steps: buildSteps(perspective, getOwnerCurrentIndex(normalizedStatus)),
        allowedActions: overdue ? ["HANDOVER", "NO_SHOW"] : ["HANDOVER"],
        isPickupOverdue: overdue,
      };
    }

    if (normalizedStatus === "IN_PROGRESS") {
      return {
        displayStatus: "Xe đang được thuê",
        nextActionText:
          "Xe đang được thuê. Khi khách trả xe, hãy kiểm tra và hoàn tất chuyến.",
        tone: "blue",
        steps: buildSteps(perspective, getOwnerCurrentIndex(normalizedStatus)),
        allowedActions: ["COMPLETE"],
        isPickupOverdue: overdue,
      };
    }

    if (normalizedStatus === "COMPLETED") {
      return {
        displayStatus: "Hoàn tất",
        nextActionText: "Chuyến thuê đã hoàn tất.",
        tone: "green",
        steps: buildSteps(perspective, getOwnerCurrentIndex(normalizedStatus)),
        allowedActions: [],
        isPickupOverdue: overdue,
      };
    }
  }

  if (normalizedStatus === "WAITING_RENTER_INFO") {
    return {
      displayStatus: "Chờ hoàn tất thông tin thuê xe",
      nextActionText: "Vui lòng hoàn tất thông tin thuê xe.",
      tone: "yellow",
      steps: buildSteps(perspective, getRenterCurrentIndex(normalizedStatus)),
      allowedActions: perspective === "RENTER" ? ["COMPLETE_RENTER_INFO"] : [],
      isPickupOverdue: overdue,
    };
  }

  if (normalizedStatus === "REQUESTED" || normalizedStatus === "PENDING") {
    return {
      displayStatus:
        perspective === "OWNER" ? "Có yêu cầu thuê mới" : "Đã gửi yêu cầu thuê",
      nextActionText:
        perspective === "OWNER"
          ? "Có yêu cầu thuê xe mới. Hãy kiểm tra hồ sơ người thuê."
          : "Yêu cầu thuê xe đã được gửi. Vui lòng chờ chủ xe xác nhận.",
      tone: "yellow",
      steps: buildSteps(perspective, getRenterCurrentIndex(normalizedStatus)),
      allowedActions:
        perspective === "OWNER" ? ["CONFIRM", "REJECT"] : [],
      isPickupOverdue: overdue,
    };
  }

  if (
    ["OWNER_APPROVED", "PAYMENT_PENDING", "WAITING_PAYMENT"].includes(
      normalizedStatus,
    )
  ) {
    return {
      displayStatus:
        normalizedStatus === "OWNER_APPROVED"
          ? "Chủ xe đã duyệt"
          : "Chờ thanh toán",
      nextActionText:
        "Chủ xe đã duyệt. Vui lòng thanh toán để tiếp tục.",
      tone: "blue",
      steps: buildSteps(perspective, getRenterCurrentIndex(normalizedStatus)),
      allowedActions: perspective === "RENTER" ? ["PAY"] : [],
      isPickupOverdue: overdue,
    };
  }

  if (normalizedStatus === "PAID" || normalizedStatus === "CONFIRMED") {
    return {
      displayStatus: hasDepositOnly ? "Đã cọc, chờ nhận xe" : "Đã thanh toán, chờ nhận xe",
      nextActionText:
        hasDepositOnly
          ? "Bạn đã đặt cọc. Phần còn lại cần thanh toán khi nhận xe."
          : "Bạn đã thanh toán. Vui lòng đến điểm nhận xe đúng giờ và mang CCCD/bằng lái.",
      tone: hasDepositOnly ? "yellow" : "green",
      steps: buildSteps(perspective, getRenterCurrentIndex(normalizedStatus)),
      allowedActions: [],
      isPickupOverdue: overdue,
    };
  }

  if (normalizedStatus === "IN_PROGRESS") {
    return {
      displayStatus: "Đang thuê",
      nextActionText:
        "Chuyến thuê đang diễn ra. Vui lòng trả xe đúng thời gian.",
      tone: "blue",
      steps: buildSteps(perspective, getRenterCurrentIndex(normalizedStatus)),
      allowedActions: [],
      isPickupOverdue: overdue,
    };
  }

  if (normalizedStatus === "COMPLETED") {
    return {
      displayStatus: "Hoàn tất",
      nextActionText: "Chuyến thuê đã hoàn tất.",
      tone: "green",
      steps: buildSteps(perspective, getRenterCurrentIndex(normalizedStatus)),
      allowedActions: [],
      isPickupOverdue: overdue,
    };
  }

  return {
    displayStatus: "Đang xử lý",
    nextActionText: "Booking đang được xử lý.",
    tone: "gray",
    steps: buildSteps(perspective, 0),
    allowedActions: [],
    isPickupOverdue: overdue,
  };
}
