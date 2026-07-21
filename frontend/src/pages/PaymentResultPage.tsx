import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { notifyPaymentTodosChanged } from "../services/booking.service";
import { paymentService } from "../services/payment.service";

type VerifyState = {
  loading: boolean;
  success: boolean;
  message: string;
  bookingId?: string;
};

function detectPaymentProvider(search: string) {
  const params = new URLSearchParams(search);
  const keys = Array.from(params.keys());

  if (keys.some((key) => key.startsWith("vnp_"))) {
    return "VNPAY";
  }

  if (
    params.has("partnerCode") ||
    params.has("orderId") ||
    params.has("requestId") ||
    params.has("resultCode")
  ) {
    return "MOMO";
  }

  return "";
}

export default function PaymentResultPage() {
  const location = useLocation();
  const [state, setState] = useState<VerifyState>({
    loading: true,
    success: false,
    message: "Đang kiểm tra kết quả thanh toán...",
  });

  useEffect(() => {
    let active = true;

    const provider = detectPaymentProvider(location.search);

    if (!location.search || !provider) {
      queueMicrotask(() => {
        setState({
          loading: false,
          success: false,
          message: "Không tìm thủy dữ liệu trả về từ cổng thanh toán.",
        });
      });
      return;
    }

    const verifyPayment =
      provider === "VNPAY"
        ? paymentService.verifyVnpayReturn(location.search)
        : paymentService.verifyMomoReturn(location.search);

    verifyPayment
      .then((data) => {
        if (!active) return;

        setState({
          loading: false,
          success: Boolean(data?.success),
          message:
            data?.message ||
            (data?.success
              ? `Thanh toán ${provider} thành công.`
              : `Thanh toán ${provider} không thành công.`),
          bookingId: data?.booking?._id,
        });
        notifyPaymentTodosChanged();
      })
      .catch(() => {
        if (!active) return;

        setState({
          loading: false,
          success: false,
          message: `Không thể xác minh kết quả thanh toán ${provider}.`,
        });
      });

    return () => {
      active = false;
    };
  }, [location.search]);

  const Icon = state.loading ? Loader2 : state.success ? CheckCircle2 : XCircle;

  return (
    <div className="min-h-screen bg-soft">
      <Header />

      <main className="mx-auto flex min-h-[70vh] max-w-2xl items-center px-4 py-16">
        <section className="w-full rounded-lg border border-border bg-white p-8 text-center shadow-sm">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
              state.loading
                ? "bg-yellow-50 text-secondary"
                : state.success
                  ? "bg-secondarySoft text-secondary"
                  : "bg-slate-100 text-slate-800"
            }`}
          >
            <Icon size={36} className={state.loading ? "animate-spin" : ""} />
          </div>

          <h1 className="mt-6 text-3xl font-extrabold text-primary">
            Kết quả thanh toán
          </h1>
          <p className="mt-3 text-slate-600">{state.message}</p>

          {!state.loading && (
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              {state.bookingId && (
                <Link
                  to={`/bookings/${state.bookingId}`}
                  className="rounded-lg bg-primary px-5 py-3 font-extrabold text-white transition hover:bg-slate-800"
                >
                  Xem booking
                </Link>
              )}
              <Link
                to="/"
                className="rounded-lg border border-border px-5 py-3 font-extrabold text-primary transition hover:bg-slate-50"
              >
                Về trang chủ
              </Link>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}








