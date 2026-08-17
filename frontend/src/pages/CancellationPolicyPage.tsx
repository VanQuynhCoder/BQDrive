import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Info,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";

const policyCards = [
  {
    title: "Chuyến chưa phát sinh thanh toán",
    description:
      "Nếu trạng thái booking cho phép hủy và chuyến chưa có khoản thanh toán thành công, bạn có thể hủy mà không phát sinh thủ tục hoàn tiền.",
    className: "border-sky-100 bg-sky-50 text-sky-700",
    icon: Info,
  },
  {
    title: "Hủy trong vòng 60 phút",
    description:
      "Nếu người thuê hủy trong vòng 60 phút kể từ lần thanh toán thành công đầu tiên, hệ thống hoàn 100% số tiền đã thanh toán và không thu phí hủy.",
    className: "border-emerald-100 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  {
    title: "Hủy sau 60 phút",
    description:
      "Sau 60 phút kể từ lần thanh toán thành công đầu tiên, hệ thống giữ tiền cọc thuê xe bằng 50% tiền thuê và phí nền tảng bằng 10% tiền thuê. Phần còn lại đủ điều kiện được hoàn lại.",
    className: "border-red-100 bg-red-50 text-red-700",
    icon: RotateCcw,
  },
];
const examples = [
  {
    title: "Ví dụ 1: Hủy trong 60 phút từ lần thanh toán đầu tiên",
    text:
      "Tiền thuê 600.000đ, tiền cọc thuê xe 300.000đ, phí nền tảng 60.000đ và bảo hiểm 60.000đ. Khách đã thanh toán giữ chỗ 420.000đ và hủy đúng thời hạn miễn phí nên được hoàn đủ 420.000đ.",
  },
  {
    title: "Ví dụ 2: Thanh toán giữ chỗ 420.000đ, hủy sau 60 phút",
    text:
      "Hệ thống giữ tiền cọc thuê xe 300.000đ và phí nền tảng 60.000đ, tổng cộng giữ 360.000đ. Phí bảo hiểm 60.000đ được hoàn lại, nên số tiền dự kiến hoàn là 60.000đ.",
  },
  {
    title: "Ví dụ 3: Đã thanh toán đủ 720.000đ, hủy sau 60 phút",
    text:
      "Hệ thống giữ tiền cọc thuê xe 300.000đ và phí nền tảng 60.000đ. Phần tiền thuê vượt cọc 300.000đ cùng phí bảo hiểm 60.000đ được hoàn lại, nên số tiền dự kiến hoàn là 360.000đ.",
  },
  {
    title: "Ví dụ 4: Chủ xe hủy booking",
    text:
      "Nếu chủ xe hủy booking, khách được hoàn 100% số tiền đã thanh toán.",
  },
  {
    title: "Ví dụ 5: Khách không đến nhận xe",
    text:
      "Sau thời gian chờ nhận xe, nếu booking được ghi nhận NO_SHOW thì hệ thống giữ cọc thuê xe và phí BQDrive. Phần tiền còn lại đủ điều kiện sẽ được tạo hồ sơ hoàn tiền.",
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
                  BQDrive áp dụng chính sách hoàn tiền dựa trên thời điểm hủy tính từ
                  lần thanh toán thành công đầu tiên và số tiền khách đã thanh
                  toán. Trước khi xác nhận hủy, hệ thống hiển thị số tiền được giữ lại
                  và số tiền dự kiến hoàn.
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
                    Áp dụng từ lần thanh toán thành công đầu tiên
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
                  <p className="mt-2 text-sm font-semibold leading-6 text-muted">
                    Số tiền dự kiến hoàn được hệ thống tính theo booking và các khoản
                    khách đã thanh toán. Nếu số tiền hoàn bằng 0đ, hệ thống không phát
                    sinh thủ tục hoàn tiền.
                  </p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm font-semibold leading-6 text-muted">
                    <li>
                      Phí bảo hiểm 30.000đ/ngày của chuyến chưa được sử dụng được
                      tính vào phần có thể hoàn theo kết quả hệ thống xác định.
                    </li>
                    <li>
                      Phí giao xe chỉ không được hoàn nếu dịch vụ giao xe đã thực tế
                      được thực hiện. Nếu dịch vụ chưa được thực hiện, khoản phí này
                      được tính vào phần có thể hoàn.
                    </li>
                    <li>
                      Nếu chủ xe hủy chuyến, khách thuê được hoàn lại toàn bộ số tiền
                      đã thanh toán.
                    </li>
                  </ul>
                  <p className="mt-3 text-sm font-semibold leading-6 text-muted">
                    Khi có tiền cần hoàn, hệ thống tạo yêu cầu hoàn tiền và ưu tiên xử
                    lý tự động qua VNPay nếu đủ điều kiện giao dịch. Trường hợp không
                    thể hoàn tự động có thể được chuyển sang quy trình hoàn thủ công;
                    người thuê không cần tự truy cập VNPay để yêu cầu hoàn tiền.
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
