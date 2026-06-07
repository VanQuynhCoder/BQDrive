import dotenv from "dotenv";

dotenv.config();

import mongoose from "mongoose";
import app from "./app";
import connectDB from "./config/database";

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  console.log("Database Name:", mongoose.connection.name);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});