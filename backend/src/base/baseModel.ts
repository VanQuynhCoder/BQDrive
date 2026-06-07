import { Document } from "mongoose";

export interface BaseDocument extends Document {
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}