export type ReturnTimingTone = "green" | "red" | "gray";

type ReturnTimingInput = {
  endDate?: string | Date | null;
  actualReturnAt?: string | Date | null;
  bookingStatus?: string;
};

export function getReturnTimingState({
  endDate,
  actualReturnAt,
  bookingStatus,
}: ReturnTimingInput): {
  label: "Trả đúng hạn" | "Trả trễ" | "Quá hạn trả" | "Chưa ghi nhận";
  tone: ReturnTimingTone;
} {
  const expectedReturnTime = endDate ? new Date(endDate).getTime() : Number.NaN;
  const actualReturnTime = actualReturnAt
    ? new Date(actualReturnAt).getTime()
    : Number.NaN;

  if (Number.isFinite(actualReturnTime) && Number.isFinite(expectedReturnTime)) {
    return actualReturnTime <= expectedReturnTime
      ? { label: "Trả đúng hạn", tone: "green" }
      : { label: "Trả trễ", tone: "red" };
  }

  if (
    bookingStatus === "IN_PROGRESS" &&
    Number.isFinite(expectedReturnTime) &&
    Date.now() > expectedReturnTime
  ) {
    return { label: "Quá hạn trả", tone: "red" };
  }

  return { label: "Chưa ghi nhận", tone: "gray" };
}
