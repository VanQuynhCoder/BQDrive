import mongoose from "mongoose";

export type ISequence = {
  /** Khóa định danh của bộ đếm, ví dụ mã booking hoặc refund. */
  key: string;
  /** Giá trị tăng dần dùng để sinh mã nghiệp vụ duy nhất. */
  sequence: number;
};

const sequenceSchema = new mongoose.Schema<ISequence>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    sequence: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Sequence phải là số nguyên không âm",
      },
    },
  },
  { timestamps: true },
);

const SequenceModel = mongoose.model<ISequence>("Sequence", sequenceSchema);

export { SequenceModel };
