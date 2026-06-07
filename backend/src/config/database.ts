import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error("MONGODB_URI is missing");
    }

    await mongoose.connect(mongoURI);

    console.log("MongoDB Connected Successfully");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);

    process.exit(1);
  }
};

export default connectDB;