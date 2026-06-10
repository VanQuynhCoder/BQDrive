import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { paymentService } from "../services/payment.service";

type VerifyState = {
  loading: boolean;
  success: boolean;
  message: string;
  bookingId?: string;
};

export default function PaymentResultPage() {
  const location = useLocation();
  const [state, setState] = useState<VerifyState>({
    loading: true,
    success: false,
    message: "Dang kiem tra ket qua thanh toan...",
  });

  useEffect(() => {
    let active = true;

    if (!location.search) {
      setState({
        loading: false,
        success: false,
        message: "Khong tim thay du lieu tra ve tu cong thanh toan.",
      });
      return;
    }

    paymentService
      .verifyVnpayReturn(location.search)
      .then((data) => {
        if (!active) return;

        setState({
          loading: false,
          success: Boolean(data?.success),
          message: data?.success
            ? "Thanh toan VNPAY thanh cong."
            : "Thanh toan VNPAY khong thanh cong.",
          bookingId: data?.booking?._id,
        });
      })
      .catch(() => {
        if (!active) return;

        setState({
          loading: false,
          success: false,
          message: "Khong the xac minh ket qua thanh toan VNPAY.",
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
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-red-50 text-red-600"
            }`}
          >
            <Icon size={36} className={state.loading ? "animate-spin" : ""} />
          </div>

          <h1 className="mt-6 text-3xl font-extrabold text-primary">
            Ket qua thanh toan
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
                Ve trang chu
              </Link>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
