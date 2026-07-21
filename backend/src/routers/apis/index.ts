import express from "express";
import authRoute from "./auth.route";
import brandRoute from "./brand.route";
import businessRoute from "./business.route";
import cartRoute from "./cart.route";
import bookingRoute from "./booking.route";
import paymentRoute from "./payment.route";
import dashboardRoute from "./dashboard.route";
import adminRoute from "./admin.route";
import contractRoute from "./contract.route";
import notificationRoute from "./notification.route";
import holidayRoute from "./holiday.route";
import mapsRoute from "./maps.route";
import ownerRoute from "./owner.route";
import reviewRoute from "./review.route";
const router = express.Router();

function dashboardAlias(targetUrl: string) {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    req.url = targetUrl;
    dashboardRoute(req, res, next);
  };
}

router.use("/auth", authRoute);
router.use("/admin/holidays", holidayRoute);
router.use("/admin/dashboard/stats", dashboardAlias("/admin/stats"));
router.use("/admin", adminRoute);
router.use("/brand", brandRoute);
router.use("/business/dashboard/stats", dashboardAlias("/business/stats"));
router.use("/business", businessRoute);
router.use("/cart", cartRoute);
router.use("/bookings", bookingRoute);
router.use("/payments", paymentRoute);
router.use("/dashboard", dashboardRoute);
router.use("/consignment/dashboard/stats", dashboardAlias("/consignment/stats"));
router.use("/contracts", contractRoute);
router.use("/notifications", notificationRoute);
router.use("/holidays", holidayRoute);
router.use("/maps", mapsRoute);
router.use("/owner", ownerRoute);
router.use("/reviews", reviewRoute);
export default router;
