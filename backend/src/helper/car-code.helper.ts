import { generateSequentialCode } from "./sequence-code.helper";

const CAR_CODE_SEQUENCE_KEY = "CAR_CODE";
const CAR_CODE_PREFIX = "BQD-XE-";
const CAR_CODE_DIGITS = 6;
export async function generateCarCode() {
  return generateSequentialCode({
    key: CAR_CODE_SEQUENCE_KEY,
    prefix: CAR_CODE_PREFIX,
    digits: CAR_CODE_DIGITS,
  });
}
