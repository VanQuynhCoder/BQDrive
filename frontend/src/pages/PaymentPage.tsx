import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CreditCard,
  FileSignature,
  Loader2,
  MapPin,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { bookingService } from "../services/booking.service";
import { contractService } from "../services/contract.service";
import { paymentService } from "../services/payment.service";
import { getFirstCarImage } from "../utils/image.util";
import { formatAddressSnapshot } from "../utils/address.util";

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
  pickupAddress: string;
  address: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  locationNote?: string;
};

type Booking = {
  _id: string;
  carId: BookingCar;
  startDate: string;
  endDate: string;
  rentalMode?: string;
  totalPrice?: number;
  depositAmount: number;
  remainingAmount: number;
  paidAmount: number;
  paymentOption: string;
  status: string;
  pricingSnapshot?: {
    rentalSubtotal?: number;
    deliveryFee?: number;
    delivery?: {
      deliveryType?: string;
      deliveryAddress?: string;
      deliveryAddressText?: string;
      deliveryFormattedAddress?: string;
      deliveryDistanceKm?: number;
      deliveryDurationText?: string;
    };
  };
  pickupAddressSnapshot: string;
  returnAddressSnapshot: string;
  renterInfo?: {
    fullName?: string;
    phone?: string;
    email?: string;
    cccdNumber?: string;
    cccdFrontImage?: string;
    cccdBackImage?: string;
    driverLicenseNumber?: string;
    driverLicenseImage?: string;
    note?: string;
  };
};

type PaymentType = "DEPOSIT" | "FULL" | "REMAINING";
type PaymentMethod = "CASH" | "MOMO" | "VNPAY";

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

export default function PaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  

  const [booking, setBooking] = useState<Booking | null>(null);
  const [pageLoading, setPageLoading] = useState(() => Boolean(id));
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [paymentType, setPaymentType] = useState<PaymentType>("DEPOSIT");

  useEffect(() => {
    let active = true;

    if (!id) {
      return;
    }

    bookingService
      .getMyBooking(id)
      .then((found: Booking) => {
        if (!active) return;
        setBooking(found || null);
        setPaymentType(found.paymentOption === "FULL" ? "FULL" : "DEPOSIT");
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
  const canCreatePayment = [
    "OWNER_APPROVED", // Trạng thái mới: chủ xe đã duyệt, được phép thanh toán
    "PAYMENT_PENDING", // Trạng thái mới: đang chờ thanh toán, được quay lại thanh toán
    "PAID", // Trạng thái mới: cho phép thanh toán phần còn lại nếu còn tiền
    "CONFIRMED", // Trạng thái cu
    "WAITING_PAYMENT", // Trạng thái cu
    "IN_PROGRESS",
  ].includes(booking?.status || "");
  const rental = getRentalInfo(car, booking?.rentalMode);
  const pickupAddress = formatAddressSnapshot(
    booking?.pickupAddressSnapshot,
    car,
  );
  const returnAddress = formatAddressSnapshot(
    booking?.returnAddressSnapshot,
    car,
    pickupAddress,
  );
  const deliverySnapshot = booking?.pricingSnapshot?.delivery;
  const isDeliveryToCustomer =
    deliverySnapshot?.deliveryType === "DELIVERY_TO_CUSTOMER";
  const rentalTime = booking
    ? calculateRentalTime(booking.rentalMode, booking.startDate, booking.endDate)
    : 0;

  const availablePaymentTypes = useMemo(() => {
    if (!booking) return [];

    const totalPrice = booking.totalPrice || 0;
    const paidAmount = booking.paidAmount || 0;
    const depositAmount =
      booking.depositAmount || Math.round(totalPrice * 0.3);
    const outstandingAmount = Math.max(
      booking.remainingAmount || totalPrice - paidAmount,
      0,
    );

    if (paidAmount >= totalPrice && totalPrice > 0) {
      return [];
    }

    if (paidAmount <= 0) {
      return [
        {
          value: "DEPOSIT" as const,
          label: "Đặt cọc trước",
          description: "Thanh toán tiền cọc để giữ xe, phần còn lại trả sau.",
          amount: depositAmount,
        },
        {
          value: "FULL" as const,
          label: "Thanh toán toàn bộ",
          description: "Thanh toán đủ toàn bộ chi phí thuê xe ngay bây giờ.",
          amount: totalPrice,
        },
      ];
    }

    if (outstandingAmount > 0) {
      return [
        {
          value: "REMAINING" as const,
          label: "Thanh toán phần còn lại",
          description: "Thanh toán nốt số tiền còn lại của booking.",
          amount: outstandingAmount,
        },
      ];
    }

    return [];
  }, [booking]);

  const effectivePaymentType =
    availablePaymentTypes.find((item) => item.value === paymentType)?.value ||
    availablePaymentTypes[0]?.value ||
    paymentType;

  const paymentSummary = useMemo(() => {
    if (!booking) {
      return {
        totalPrice: 0,
        depositAmount: 0,
        paidAmount: 0,
        outstandingAmount: 0,
      };
    }

    const totalPrice = booking.totalPrice || 0;
    const paidAmount = booking.paidAmount || 0;
    const depositAmount =
      booking.depositAmount || Math.round(totalPrice * 0.3);
    const outstandingAmount = Math.max(
      booking.remainingAmount || totalPrice - paidAmount,
      0,
    );

    return {
      totalPrice,
      depositAmount,
      paidAmount,
      outstandingAmount,
    };
  }, [booking]);

  const payableAmount =
    availablePaymentTypes.find((item) => item.value === effectivePaymentType)?.amount ||
    0;

  const handlePayment = async (event: FormEvent) => {
    event?.preventDefault();

    if (!booking) return;

    if (payableAmount <= 0) {
      toast.error("Booking không còn số tiền cần thanh toán");
      navigate(`/bookings/${booking._id}`);
      return;
    }

    if (!canCreatePayment) {
      toast.error("Booking cần được chủ xe xác nhận trước khi thanh toán");
      navigate(`/bookings/${booking._id}`);
      return;
    }

    if (!booking.renterInfo?.fullName || !booking.renterInfo?.cccdNumber) {
      toast.error("Booking thiếu thông tin người thuê, không thể thanh toán");
      navigate(`/bookings/${booking._id}`);
      return;
    }

    setSubmitting(true);

    try {
      console.log("PAYMENT DEBUG - START:", {
        bookingId: booking._id,
        method,
        paymentType: effectivePaymentType,
      });

      try {
        const contract = await contractService.createContract({
          bookingId: booking._id,
        });
        console.log("PAYMENT DEBUG - CONTRACT CREATED:", contract);
      } catch (contractError) {
        console.error("PAYMENT DEBUG - CREATE CONTRACT FAILED:", contractError);
        throw contractError;
      }

      if (method === "MOMO") {
      console.log("PAYMENT DEBUG - CALL MOMO CREATE");
      const momoResult = await paymentService.createMomoPayment({
        bookingId: booking._id,
        paymentType: effectivePaymentType,
      });

      console.log("MOMO RESULT:", momoResult);
      console.log("PAY URL:", momoResult.payUrl);

      if (!momoResult.payUrl) {
        throw new Error("Không lấy được đường đến thanh toán MoMo");
      }

      window.open(momoResult.payUrl, "_self");
      return;
      }

      if (method === "VNPAY") {
        const vnpayResult = await paymentService.createVnpayPayment({
          bookingId: booking._id,
          paymentType: effectivePaymentType,
        });

        if (!vnpayResult.payUrl) {
          throw new Error("Không lấy được đường đến thanh toán VNPAY");
        }

        window.open(vnpayResult.payUrl, "_self");
        return;
      }

      await paymentService.createPayment({
        bookingId: booking._id,
        method,
        paymentType: effectivePaymentType,
      });

      toast.success(
        method === "CASH"
          ? "Đã tạo yêu cầu thanh toán ngoài hệ thống. Vui lòng chờ chủ xe xác nhận đã nhận tiền."
          : "Đã tạo yêu cầu thanh toán thành công.",
      );
      navigate(`/bookings/${booking._id}`);
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

  if (!canCreatePayment) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-7xl px-6 pt-32">
          <div className="rounded-lg border border-border bg-white p-10 text-center">
            <h1 className="text-2xl font-extrabold text-primary">
              Booking đang chờ chủ xe xác nhận
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-muted">
              Sau khi chủ xe đồng ý cho thuê, hệ thống sẽ mở bước hợp đồng và thanh toán cho booking này.
            </p>
            <Link
              to={`/bookings/${booking._id}`}
              className="mt-5 inline-flex rounded-lg bg-secondary px-6 py-3 font-bold text-primary"
            >
              Xem chi tiết booking
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
            Kiểm tra hồ sơ người thuê đã gửi trước đó và chọn khoản thanh toán
            cho booking này.
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
                    Hồ sơ người thuê
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Thông tin này được lấy từ hồ sơ đã gửi khi đặt xe.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ReadonlyField label="Họ tên" value={booking.renterInfo?.fullName} />
                <ReadonlyField label="Số điện thoại" value={booking.renterInfo?.phone} />
                <ReadonlyField label="Email" value={booking.renterInfo?.email} />
                <ReadonlyField label="CCCD/CMND" value={booking.renterInfo?.cccdNumber} />
                <ReadonlyField
                  label="Số bằng lái"
                  value={booking.renterInfo?.driverLicenseNumber}
                />
                <ReadonlyField label="Ghi chú" value={booking.renterInfo?.note || "--"} />
                <DocumentPreview
                  label="CCCD mặt trước"
                  value={booking.renterInfo?.cccdFrontImage}
                />
                <DocumentPreview
                  label="CCCD mặt sau"
                  value={booking.renterInfo?.cccdBackImage}
                />
                <DocumentPreview
                  label="Bằng lái xe"
                  value={booking.renterInfo?.driverLicenseImage}
                />
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
                      effectivePaymentType === item.value
                        ? "border-secondary bg-yellow-50"
                        : "border-border bg-white hover:bg-secondarySoft/35"
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
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-primary">
                  <MapPin size={22} />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase text-secondary">
                    Địa điểm
                  </p>
                  <h2 className="text-2xl font-extrabold text-primary">
                    Nhận và trả xe
                  </h2>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <AddressBlock label="Địa điểm nhận xe" value={pickupAddress} />
                <AddressBlock
                  label="Hình thức nhận xe"
                  value={isDeliveryToCustomer ? "Giao xe tận nơi" : "Nhận tại vị trí chủ xe"}
                />
                {isDeliveryToCustomer && (
                  <AddressBlock
                    label="Địa chỉ giao xe"
                    value={
                      deliverySnapshot?.deliveryAddressText ||
                      deliverySnapshot?.deliveryAddress ||
                      deliverySnapshot?.deliveryFormattedAddress ||
                      "--"
                    }
                  />
                )}
                <AddressBlock label="Địa điểm trả xe" value={returnAddress} />
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
                        : "border-border hover:bg-secondarySoft/35"
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

              <div className="mt-6 rounded-lg border border-secondary/20 bg-secondarySoft/25 p-5">
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
                <SummaryRow label="Nhận xe" value={pickupAddress} />
                <SummaryRow label="Đơn giá" value={`${formatPrice(rental.price)} / ${rental.unit}`} />
                <SummaryRow label={rental.label} value={`${rentalTime} ${rental.unit}`} />
                <SummaryRow
                  label="Tiền thuê xe"
                  value={formatPrice(
                    booking?.pricingSnapshot?.rentalSubtotal ??
                      paymentSummary.totalPrice,
                  )}
                />
                <SummaryRow
                  label="Phí giao xe"
                  value={formatPrice(booking?.pricingSnapshot?.deliveryFee || 0)}
                />
                <SummaryRow label="Tổng booking" value={formatPrice(paymentSummary.totalPrice)} />
                <SummaryRow label="Tiền cọc" value={formatPrice(paymentSummary.depositAmount)} />
                <SummaryRow label="Đã thanh toán" value={formatPrice(paymentSummary.paidAmount)} />
                <SummaryRow label="Còn lại" value={formatPrice(paymentSummary.outstandingAmount)} />
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
                disabled={submitting || payableAmount <= 0}
                className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 size={20} className="animate-spin" />}
                {submitting
                  ? "Đang xử lý..."
                  : payableAmount > 0
                    ? "Xác nhận thanh toán"
                    : "Không cần thanh toán"}
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

function ReadonlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-border bg-soft/40 px-4 py-3">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-1 break-words font-extrabold text-primary">
        {value || "--"}
      </p>
    </div>
  );
}

function DocumentPreview({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <p className="mb-2 text-xs font-bold uppercase text-muted">{label}</p>
      {value ? (
        <img
          src={value}
          alt={label}
          className="h-32 w-full rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg bg-soft text-sm font-bold text-muted">
          Chưa có ảnh
        </div>
      )}
    </div>
  );
}

function AddressBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="mt-1 text-sm font-extrabold leading-6 text-primary">
        {value}
      </p>
    </div>
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








