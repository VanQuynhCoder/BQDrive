import express from "express";
import cors from "cors";
import apiRouter from "./routers/apis";
import carRoute from "./routers/apis/car.route";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/", (req, res) => {
  res.send("BQDrive Backend Running...");
});

app.use("/api", apiRouter);
app.use("/api/cars", carRoute);
app.use((error: any, req: any, res: any, next: any) => {
  console.log("ERROR DETAIL:", error);

  if (error?.code === 11000) {
    const duplicatedField = Object.keys(error.keyPattern || {})[0];
    const duplicatedValue = duplicatedField
      ? error.keyValue?.[duplicatedField]
      : null;
    const isEmailDuplicate = duplicatedField === "email";

    return res.status(409).json({
      status: 409,
      code: "-8",
      message: isEmailDuplicate ? "Email đã tồn tại" : "Dữ liệu đã tồn tại",
      data: duplicatedValue || null,
    });
  }

  return res.status(error.info?.status || 500).json({
    status: error.info?.status || 500,
    code: error.info?.code || "-999",
    message: error.info?.message || "Internal Server Error",
    data: error.info?.data || null,
  });
});

export default app;
