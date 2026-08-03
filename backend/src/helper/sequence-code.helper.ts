import { SequenceModel } from "../models/sequence/sequence.model";

type SequentialCodeOptions = {
  key: string;
  prefix: string;
  digits?: number;
};

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

async function getNextSequence(key: string) {
  try {
    const counter = await SequenceModel.findOneAndUpdate(
      { key },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    const sequence = Number(counter?.sequence);
    if (!Number.isInteger(sequence) || sequence <= 0) {
      throw new Error(`${key} sequence is invalid`);
    }

    return sequence;
  } catch (error: unknown) {
    // Concurrent first-use upserts can race on the unique sequence key.
    if (isDuplicateKeyError(error)) {
      const counter = await SequenceModel.findOneAndUpdate(
        { key },
        { $inc: { sequence: 1 } },
        { new: true },
      ).lean();
      const sequence = Number(counter?.sequence);

      if (Number.isInteger(sequence) && sequence > 0) return sequence;
    }

    throw error;
  }
}

export async function generateSequentialCode({
  key,
  prefix,
  digits = 6,
}: SequentialCodeOptions) {
  const sequence = await getNextSequence(key);
  const maxSequence = 10 ** digits - 1;

  if (sequence > maxSequence) {
    throw new Error(`${key} sequence exceeded the supported range`);
  }

  return `${prefix}${String(sequence).padStart(digits, "0")}`;
}
