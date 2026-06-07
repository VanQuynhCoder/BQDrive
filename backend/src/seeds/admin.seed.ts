import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import connectDB from "../config/database";
import { UserModel } from "../models/user/user.model";
import { UserRoleEnum } from "../constants/model.const";

dotenv.config();

const seedAdmin = async () => {
  try {
    await connectDB();

    const existedAdmin = await UserModel.findOne({
      email: "admin@gmail.com",
      isDeleted: false,
    });

    if (existedAdmin) {
      console.log("Admin already exists");
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash("123456", 10);

    await UserModel.create({
      name: "Admin BQDrive",
      email: "admin@gmail.com",
      password: hashedPassword,
      role: UserRoleEnum.ADMIN,
      isVerified: true,
    });

    console.log("Admin created successfully");
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

seedAdmin();