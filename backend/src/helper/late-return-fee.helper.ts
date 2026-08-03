export const LATE_RETURN_POLICY = Object.freeze({
  graceMinutes: 30,
  blockMinutes: 30,
  feePerBlock: 30_000,
});

export type LateReturnCalculation = {
  scheduledReturnAt: Date;
  actualReturnAt: Date;
  lateMinutes: number;
  graceMinutes: number;
  chargeableMinutes: number;
  blockMinutes: number;
  chargedBlocks: number;
  feePerBlock: number;
  calculatedAmount: number;
};

export function calculateLateReturnFee(
  scheduledReturnAtValue: Date | string,
  actualReturnAtValue: Date | string,
): LateReturnCalculation {
  const scheduledReturnAt = new Date(scheduledReturnAtValue);
  const actualReturnAt = new Date(actualReturnAtValue);

  if (
    Number.isNaN(scheduledReturnAt.getTime()) ||
    Number.isNaN(actualReturnAt.getTime())
  ) {
    throw new Error("Thời gian trả xe không hợp lệ.");
  }

  const lateMinutes = Math.max(
    0,
    Math.ceil(
      (actualReturnAt.getTime() - scheduledReturnAt.getTime()) / 60_000,
    ),
  );
  const chargeableMinutes = Math.max(
    lateMinutes - LATE_RETURN_POLICY.graceMinutes,
    0,
  );
  const chargedBlocks =
    chargeableMinutes > 0
      ? Math.ceil(chargeableMinutes / LATE_RETURN_POLICY.blockMinutes)
      : 0;

  return {
    scheduledReturnAt,
    actualReturnAt,
    lateMinutes,
    graceMinutes: LATE_RETURN_POLICY.graceMinutes,
    chargeableMinutes,
    blockMinutes: LATE_RETURN_POLICY.blockMinutes,
    chargedBlocks,
    feePerBlock: LATE_RETURN_POLICY.feePerBlock,
    calculatedAmount: chargedBlocks * LATE_RETURN_POLICY.feePerBlock,
  };
}
