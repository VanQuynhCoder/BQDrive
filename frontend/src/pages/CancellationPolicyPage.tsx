import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Info,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";

const policyCards = [
  {
    title: "Trước giờ nhận xe từ 48 giờ",
    description: "Khách được hoàn 100% số tiền đã thanh toán.",
    className: "border-emerald-100 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  {
    title: "Trước giờ nhận xe 24-48 giờ",
    description: "Khách được hoàn 80%, hệ thống giữ 20% làm phí hủy.",
    className: "border-yellow-200 bg-yellow-50 text-amber-700",
    icon: Clock3,
  },
  {
    title: "Hủy sát giờ, dưới 24 giờ",
    description:
      "Hệ thống giữ tiền cọc. Nếu khách chỉ mới thanh toán cọc thì có thể không phát sinh hoàn tiền.",
    className: "border-red-100 bg-red-50 text-red-700",
    icon: RotateCcw,
  },
];

const examples = [
  {
    title: "Ví dụ 1: Đã cọc 180.000đ, hủy trước 48 giờ",
    text: "Phí hủy: 0đ. Dự kiến hoàn: 180.000đ. Hệ thống sẽ tạo hồ sơ hoàn tiền để khách cung cấp thông tin nhận tiền.",
  },
  {
    title: "Ví dụ 2: Đã cọc 180.000đ, hủy sát giờ",
    text: "Phí hủy: 180.000đ. Dự kiến hoàn: 0đ. Booking vẫn được hủy, nhưng không tạo hồ sơ hoàn tiền.",
  },
  {
    title: "Ví dụ 3: Đã thanh toán đủ 600.000đ, hủy sát giờ",
    text: "Nếu tiền cọc là 180.000đ, hệ thống giữ 180.000đ và dự kiến hoàn 420.000đ.",
  },
  {
    title: "Ví dụ 4: Chủ xe hủy booking",
    text: "Khách được hoàn lại số tiền đã thanh toán theo chính sách của hệ thống, thông thường là hoàn 100%.",
  },
];

export default function CancellationPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-primary">
      <style>
        {`
          @keyframes policyFadeUp {
            from {
              opacity: 0;
              transform: translateY(18px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes policyScaleIn {
            from {
              opacity: 0;
              transform: scale(0.96);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          @keyframes policyShimmer {
            0% {
              transform: translateX(-45%);
            }
            100% {
              transform: translateX(145%);
            }
          }

          .policy-fade-up {
            animation: policyFadeUp 0.65s ease both;
          }

          .policy-scale-in {
            animation: policyScaleIn 0.55s ease both;
          }

          .policy-shimmer::after {
            animation: policyShimmer 2.8s ease-in-out infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .policy-fade-up,
            .policy-scale-in,
            .policy-shimmer::after {
              animation: none;
            }
          }
        `}
      </style>

      <Header />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6">
        <Link
          to="/"
          className="policy-fade-up inline-flex items-center gap-2 text-sm font-extrabold text-muted transition hover:-translate-x-1 hover:text-primary"
        >
          <ArrowLeft size={18} />
          Về trang chủ
        </Link>

        <section className="policy-scale-in mt-6 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="relative overflow-hidden bg-primary px-6 py-8 text-white sm:px-8">
            <div className="policy-shimmer absolute left-6 top-0 h-1 w-44 overflow-hidden rounded-full bg-white/10 sm:left-8">
              <span className="absolute inset-y-0 left-0 w-20 rounded-full bg-secondary/90" />
            </div>

            <p className="policy-fade-up text-sm font-extrabold uppercase text-secondary">
              Chính sách hủy và hoàn tiền
            </p>
            <h1
              className="policy-fade-up mt-3 max-w-3xl text-3xl font-extrabold leading-tight sm:text-5xl"
              style={{ animationDelay: "80ms" }}
            >
              Hủy booking minh bạch, xem trước số tiền hoàn trước khi xác nhận
            </h1>
            <p
              className="policy-fade-up mt-4 max-w-3xl text-base font-semibold leading-8 text-white/75"
              style={{ animationDelay: "160ms" }}
            >
              BQDrive tính phí hủy dựa trên thời điểm hủy so với giờ nhận xe và
              số tiền khách đã thanh toán. Khi hủy booking, hệ thống luôn hiển
              thị phần xem trước để bạn kiểm tra trước khi xác nhận.
            </p>
          </div>

          <div className="space-y-8 px-6 py-8 sm:px-8">
            <section className="policy-fade-up" style={{ animationDelay: "220ms" }}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold uppercase text-secondary">
                    Khi nào được hoàn tiền?
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold text-primary">
                    Áp dụng theo thời điểm hủy booking
                  </h2>
                </div>
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-secondarySoft px-4 py-2 text-sm font-extrabold text-primary transition hover:-translate-y-0.5">
                  <ShieldCheck size={17} />
                  Xem trước trước khi hủy
                </span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {policyCards.map((card, index) => {
                  const Icon = card.icon;

                  return (
                    <article
                      key={card.title}
                      className={`policy-fade-up rounded-2xl border p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lg ${card.className}`}
                      style={{ animationDelay: `${300 + index * 90}ms` }}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 transition duration-300 group-hover:scale-105">
                        <Icon size={22} />
                      </div>
                      <h3 className="mt-4 text-xl font-extrabold">
                        {card.title}
                      </h3>
                      <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
                        {card.description}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>

            <section
              className="policy-fade-up rounded-2xl border border-secondary/30 bg-secondarySoft/25 p-5"
              style={{ animationDelay: "520ms" }}
            >
              <p className="text-sm font-extrabold uppercase text-secondary">
                Ví dụ dễ hiểu
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {examples.map((example, index) => (
                  <article
                    key={example.title}
                    className="policy-fade-up rounded-xl bg-white p-5 transition duration-300 hover:-translate-y-1 hover:shadow-md"
                    style={{ animationDelay: `${620 + index * 80}ms` }}
                  >
                    <h3 className="text-base font-extrabold text-primary">
                      {example.title}
                    </h3>
                    <p className="mt-3 text-sm font-semibold leading-7 text-muted">
                      {example.text}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section
              className="policy-fade-up rounded-2xl border border-border bg-slate-50 p-5 transition duration-300 hover:shadow-md"
              style={{ animationDelay: "880ms" }}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Info size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-primary">
                    Lưu ý khi hủy booking
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-7 text-muted">
                    Số tiền hiển thị ở mục “Dự kiến hoàn” trong popup hủy là kết
                    quả hệ thống đã tính theo booking hiện tại của bạn. Nếu số
                    tiền này bằng 0đ, hệ thống sẽ hủy booking nhưng không tạo hồ
                    sơ hoàn tiền. Nếu có phát sinh hoàn tiền, khách cần cung cấp
                    thông tin nhận tiền để chủ xe hoặc doanh nghiệp xử lý hoàn
                    thủ công.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
