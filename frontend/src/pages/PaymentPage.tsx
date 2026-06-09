import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CreditCard,
  FileSignature,
  Landmark,
  Loader2,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { authService } from "../services/auth.service";
import { bookingService } from "../services/booking.service";
import { contractService } from "../services/contract.service";
import { paymentService } from "../services/payment.service";
import { getFirstCarImage } from "../utils/image.util";

type BookingCar = {
  _id: string;
  name?: string;
  licensePlate?: string;
  pricePerDay?: number;
  pricePerHour?: number;
  rentalUnit?: string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
};

type Booking = {
  _id: string;
  carId?: BookingCar;
  startDate: string;
  endDate: string;
  rentalMode?: string;
  totalPrice?: number;
  depositAmount?: number;
  remainingAmount?: number;
  paidAmount?: number;
  paymentOption?: string;
  status?: string;
};

type ContractForm = {
  renterName: string;
  renterPhone: string;
  renterIdentityNumber: string;
  renterAddress: string;
  note: string;
};

type PaymentType = "DEPOSIT" | "FULL" | "REMAINING";
type PaymentMethod = "CASH" | "BANKING" | "MOMO" | "VNPAY";

const paymentMethods: Array<{
  value: PaymentMethod;
  label: string;
  description: string;
  icon: typeof Wallet;
}> = [
  {
    value: "CASH",
    label: "Tiền mặt",
    description: "Thanh toán trực tiếp khi nhận xe.",
    icon: Wallet,
  },
  {
    value: "BANKING",
    label: "Chuyển khoản",
    description: "Thanh toán qua tài khoản ngân hàng.",
    icon: Landmark,
  },
  {
    value: "MOMO",
    label: "Momo",
    description: "Thanh toán qua ví điện tử Momo.",
    icon: Smartphone,
  },
  {
    value: "VNPAY",
    label: "VNPAY",
    description: "Thanh toán qua cổng VNPAY.",
    icon: CreditCard,
  },
];

function formatPrice(price?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price || 0);
}

function getRentalInfo(car: BookingCar | undefined, rentalMode?: string) {
  if (rentalMode === "HOURLY" || (!rentalMode && car?.rentalUnit === "HOUR")) {
    return {
      price: car?.pricePerHour || 0,
      unit: "giờ",
      label: "Số giờ thuê",
    };
  }

  return {
    price: car?.pricePerDay || 0,
    unit: "ngày",
    label: "Số ngày thuê",
  };
}

const HOUR_MS = 1000 * 60 * 60;

function calculateRentalTime(rentalMode: string | undefined, start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();

  if (diffMs <= 0) return 0;

  if (rentalMode === "HOURLY") {
    return Math.ceil(diffMs / HOUR_MS);
  }

  return Math.max(1, Math.ceil(diffMs / HOUR_MS / 24));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  return fallback;
}

function getDigits(value: string) {
  return value.replace(/\D/g, "");
}

function getInitialForm(): ContractForm {
  const user = authService.getCurrentUser();

  return {
    renterName: user?.name || "",
    renterPhone: user?.phone || "",
    renterIdentityNumber: "",
    renterAddress: "",
    note: "",
  };
}

export default function PaymentPage() {
  const { id } = useParams();
  

  const [booking, setBooking] = useState<Booking | null>(null);
  const [pageLoading, setPageLoading] = useState(() => Boolean(id));
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [paymentType, setPaymentType] = useState<PaymentType>("DEPOSIT");
  const [form, setForm] = useState<ContractForm>(() => getInitialForm());

  useEffect(() => {
    let active = true;

    if (!id) {
      return;
    }

    bookingService
      .getMyBookings()
      .then((data) => {
        if (!active) return;
        const found = (data as Booking[]).find((item) => item._id === id);
        setBooking(found || null);
        setPaymentType(found?.paymentOption === "FULL" ? "FULL" : "DEPOSIT");
      })
      .catch((error) => {
        toast.error(getErrorMessage(error, "Không thể tải booking"));
      })
      .finally(() => {
        if (active) setPageLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const car = booking?.carId;
  const rental = getRentalInfo(car, booking?.rentalMode);
  const rentalTime = booking
    ? calculateRentalTime(booking.rentalMode, booking.startDate, booking.endDate)
    : 0;

  const availablePaymentTypes = useMemo(() => {
    if (!booking) return [];

    if (booking.paymentOption === "FULL") {
      return [
        {
          value: "FULL" as const,
          label: "Thanh toán toàn bộ",
          description: "Hoàn tất toàn bộ chi phí booking.",
          amount: booking.totalPrice || 0,
        },
      ];
    }

    if ((booking.paidAmount || 0) > 0 && (booking.remainingAmount || 0) > 0) {
      return [
        {
          value: "REMAINING" as const,
          label: "Thanh toán phần còn lại",
          description: "Hoàn tất số tiền còn lại của booking.",
          amount: booking.remainingAmount || 0,
        },
      ];
    }

    return [
      {
        value: "DEPOSIT" as const,
        label: "Đặt cọc trước",
        description: "Giữ xe trước và thanh toán phần còn lại khi nhận xe.",
        amount: booking.depositAmount || 0,
      },
    ];
  }, [booking]);

  const payableAmount =
    availablePaymentTypes.find((item) => item.value === paymentType)?.amount ||
    0;

  const updateForm = (field: keyof ContractForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateForm = () => {
    const renterName = form.renterName.trim();
    const renterPhone = form.renterPhone.trim();
    const renterIdentityNumber = form.renterIdentityNumber.trim();
    const renterAddress = form.renterAddress.trim();

    if (
      !renterName ||
      !renterPhone ||
      !renterIdentityNumber ||
      !renterAddress
    ) {
      toast.error("Vui lòng nhập đầy đủ thông tin hợp đồng bắt buộc");
      return null;
    }

    if (getDigits(renterPhone).length < 10) {
      toast.error("Số điện thoại phải có ít nhất 10 số");
      return null;
    }

    if (getDigits(renterIdentityNumber).length < 9) {
      toast.error("CCCD/CMND phải có ít nhất 9 số");
      return null;
    }

    return {
      renterName,
      renterPhone,
      renterIdentityNumber,
      renterAddress,
      note: form.note.trim(),
    };
  };

  const handlePayment = async (event: FormEvent) => {
    event.preventDefault();

    if (!booking) return;

    const payload = validateForm();
    if (!payload) return;

    setSubmitting(true);

    try {
      console.log("PAYMENT DEBUG - START:", {
        bookingId: booking._id,
        method,
        paymentType,
      });

      try {
        const contract = await contractService.createContract({
          bookingId: booking._id,
          ...payload,
        });
        console.log("PAYMENT DEBUG - CONTRACT CREATED:", contract);
      } catch (contractError) {
        console.error("PAYMENT DEBUG - CREATE CONTRACT FAILED:", contractError);
        throw contractError;
      }

      console.log("PAYMENT DEBUG - CALL MOMO CREATE");
      const momoResult = await paymentService.createMomoPayment({
        bookingId: booking._id,
        paymentType,
      });

      console.log("MOMO RESULT:", momoResult);
      console.log("PAY URL:", momoResult?.payUrl);

      if (!momoResult?.payUrl) {
        throw new Error("Không lấy được đường dẫn thanh toán MoMo");
      }

      window.open(momoResult.payUrl, "_self");
    } catch (error) {
      console.error("PAYMENT DEBUG - HANDLE PAYMENT FAILED:", error);
      toast.error(getErrorMessage(error, "Thanh toán thất bại"));
    } finally {
      setSubmitting(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 pt-20">
          <Loader2 size={30} className="animate-spin text-secondary" />
        </main>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-7xl px-6 pt-32">
          <div className="rounded-lg border border-border bg-white p-10 text-center">
            <h1 className="text-2xl font-extrabold text-primary">
              Không tìm thấy booking
            </h1>
            <Link
              to="/"
              className="mt-5 inline-flex rounded-lg bg-secondary px-6 py-3 font-bold text-primary"
            >
              Về trang chủ
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
        <div className="mb-10">
          <p className="font-bold uppercase text-secondary">
            Hợp đồng và thanh toán
          </p>
          <h1 className="mt-2 text-4xl font-extrabold text-primary md:text-5xl">
            Hoàn tất thuê xe
          </h1>
          <p className="mt-3 max-w-2xl text-muted">
            Nhập thông tin người thuê để tạo hợp đồng trước khi hệ thống ghi
            nhận thanh toán.
          </p>
        </div>

        <form onSubmit={handlePayment} className="grid gap-8 lg:grid-cols-3">
          <section className="space-y-6 lg:col-span-2">
            <div className="rounded-lg border border-border bg-white p-6 shadow-sm md:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-secondary">
                  <FileSignature size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-primary">
                    Thông tin hợp đồng thuê xe
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Thông tin này chỉ dùng cho hợp đồng thuê xe của booking.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Họ tên người thuê *"
                  value={form.renterName}
                  onChange={(value) => updateForm("renterName", value)}
                />
                <TextField
                  label="Số điện thoại người thuê *"
                  value={form.renterPhone}
                  onChange={(value) => updateForm("renterPhone", value)}
                  inputMode="tel"
                />
                <TextField
                  label="CCCD/CMND *"
                  value={form.renterIdentityNumber}
                  onChange={(value) =>
                    updateForm("renterIdentityNumber", value)
                  }
                  inputMode="numeric"
                />
                <TextField
                  label="Địa chỉ *"
                  value={form.renterAddress}
                  onChange={(value) => updateForm("renterAddress", value)}
                />
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-extrabold text-primary">
                    Ghi chú
                  </span>
                  <textarea
                    value={form.note}
                    onChange={(event) => updateForm("note", event.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-border px-4 py-3 font-semibold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                    placeholder="Yêu cầu thêm khi nhận xe..."
                  />
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-6 shadow-sm md:p-8">
              <h2 className="mb-5 text-2xl font-extrabold text-primary">
                Khoản thanh toán
              </h2>

              <div className="space-y-4">
                {availablePaymentTypes.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setPaymentType(item.value)}
                    className={`w-full rounded-lg border p-5 text-left transition ${
                      paymentType === item.value
                        ? "border-secondary bg-yellow-50"
                        : "border-border bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-lg font-extrabold text-primary">
                          {item.label}
                        </p>
                        <p className="mt-1 text-muted">{item.description}</p>
                      </div>
                      <p className="text-2xl font-extrabold text-secondary">
                        {formatPrice(item.amount)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-6 shadow-sm md:p-8">
              <h2 className="mb-5 text-2xl font-extrabold text-primary">
                Phương thức thanh toán
              </h2>

              <div className="grid gap-4 md:grid-cols-2">
                {paymentMethods.map(({ value, label, description, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMethod(value)}
                    className={`flex min-h-24 items-start gap-4 rounded-lg border p-5 text-left transition ${
                      method === value
                        ? "border-secondary bg-yellow-50"
                        : "border-border hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="mt-1 shrink-0 text-secondary" />
                    <div>
                      <p className="font-extrabold text-primary">{label}</p>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        {description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-lg bg-soft p-5">
                <p className="font-bold text-yellow-700">
                  Nếu khách hàng không đến nhận xe đúng hẹn, tiền cọc sẽ không
                  được hoàn lại.
                </p>
              </div>
            </div>
          </section>

          <aside>
            <div className="sticky top-28 rounded-lg bg-primary p-7 text-white shadow-xl">
              <h2 className="text-2xl font-extrabold">Tóm tắt booking</h2>

              <div className="my-6 flex items-center gap-4">
                <img
                  src={getFirstCarImage(car?.images)}
                  alt={car?.name || "Xe thuê"}
                  className="h-24 w-36 rounded-lg object-cover"
                />

                <div>
                  <h3 className="text-lg font-extrabold">{car?.name}</h3>
                  <p className="mt-1 text-sm text-white/70">
                    {rentalTime} {rental.unit}
                  </p>
                </div>
              </div>

              <div className="space-y-4 border-y border-white/10 py-6">
                <SummaryRow label="Đơn giá" value={`${formatPrice(rental.price)} / ${rental.unit}`} />
                <SummaryRow label={rental.label} value={`${rentalTime} ${rental.unit}`} />
                <SummaryRow label="Tổng booking" value={formatPrice(booking.totalPrice)} />
                <SummaryRow label="Tiền cọc" value={formatPrice(booking.depositAmount)} />
                <SummaryRow label="Còn lại" value={formatPrice(booking.remainingAmount)} />
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between lg:flex-col lg:items-start xl:flex-row xl:items-end">
                <div>
                  <p className="text-lg font-bold">Cần thanh toán</p>
                  <p className="text-sm text-white/60">
                    Theo khoản đã chọn
                  </p>
                </div>

                <p className="text-3xl font-extrabold text-secondary">
                  {formatPrice(payableAmount)}
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 size={20} className="animate-spin" />}
                {submitting ? "Đang xử lý..." : "Xác nhận thanh toán"}
              </button>

              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/70">
                <ShieldCheck size={16} />
                Thanh toán được bảo mật SSL
              </div>
            </div>
          </aside>
        </form>
      </main>

      <Footer />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "text" | "tel" | "numeric";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold text-primary">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        className="min-h-12 w-full rounded-lg border border-border px-4 font-semibold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
      />
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-white/70">{label}</span>
      <span className="text-right font-bold">{value}</span>
    </div>
  );
}
