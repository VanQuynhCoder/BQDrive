import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  CarFront,
  CheckCircle2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";

const heroImage =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1800";

const aboutHighlights = [
  {
    icon: Search,
    title: "Tìm kiếm dễ dàng",
    text: "Khách hàng có thể xem nhanh thông tin xe, hình ảnh, giá thuê, loại xe, số chỗ, nhiên liệu, hộp số và tình trạng khả dụng trước khi đặt.",
  },
  {
    icon: CalendarCheck2,
    title: "Đặt thuê minh bạch",
    text: "Quy trình đặt xe rõ ràng từ chọn lịch trình, gửi yêu cầu thuê, theo dõi đơn đến xác nhận từ chủ xe hoặc doanh nghiệp.",
  },
  {
    icon: Building2,
    title: "Quản lý cho chủ xe",
    text: "Chủ xe dễ dàng đăng tải phương tiện, cập nhật thông tin, quản lý lịch thuê và phản hồi yêu cầu của khách hàng trên cùng một hệ thống.",
  },
];

const aboutStats = [
  {
    value: "3 bên",
    label: "Kết nối khách hàng, chủ xe và doanh nghiệp cho thuê xe.",
  },
  {
    value: "Nhanh",
    label: "Tối ưu thao tác tìm xe, chọn xe và gửi yêu cầu thuê.",
  },
  {
    value: "An tâm",
    label: "Thông tin xe, giá thuê và trạng thái đơn được hiển thị rõ ràng.",
  },
];

const values = [
  "Thông tin xe trực quan, dễ so sánh trước khi đặt.",
  "Lịch sử đặt xe và đơn thuê được quản lý tập trung.",
  "Chủ xe chủ động xác nhận yêu cầu và theo dõi phương tiện.",
  "Trải nghiệm thuê xe hiện đại, linh hoạt và thân thiện.",
];

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />

      <main className="pt-20">
        <section className="relative overflow-hidden bg-primary text-white">
          <img
            src={heroImage}
            alt="BQ Drive - thuê xe dễ dàng, di chuyển tự do"
            className="absolute inset-0 h-full w-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-black/60" />

          <div className="relative mx-auto grid min-h-[560px] max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="max-w-4xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-extrabold text-primary">
                <Sparkles size={17} />
                Về BQ Drive
              </span>

              <h1 className="mt-6 text-4xl font-extrabold leading-tight md:text-6xl">
                Thuê xe dễ dàng, di chuyển tự do
              </h1>

              <p className="mt-6 max-w-3xl text-lg leading-8 text-white/82">
                BQ Drive là nền tảng thuê xe trực tuyến giúp khách hàng dễ dàng
                tìm kiếm, lựa chọn và đặt thuê xe phù hợp với nhu cầu di chuyển
                chỉ trong vài thao tác.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  to="/#home-cars"
                  className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:-translate-y-0.5 hover:brightness-95"
                >
                  Tìm xe ngay
                  <ArrowRight size={19} />
                </Link>
                <Link
                  to="/services"
                  className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-5 py-3 font-extrabold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/18"
                >
                  Xem dịch vụ
                  <CarFront size={19} />
                </Link>
              </div>
            </div>

            <div className="grid gap-3">
              {aboutStats.map((item) => (
                <div
                  key={item.value}
                  className="rounded-lg border border-white/15 bg-white/10 p-5 backdrop-blur"
                >
                  <p className="text-3xl font-extrabold text-secondary">
                    {item.value}
                  </p>
                  <p className="mt-2 leading-7 text-white/78">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-16 md:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 lg:grid-cols-[minmax(0,1fr)_460px]">
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Câu chuyện của chúng tôi
              </p>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight text-primary md:text-5xl">
                Một nền tảng cho hành trình chủ động hơn
              </h2>
              <p className="mt-6 text-lg leading-8 text-muted">
                Hệ thống kết nối khách hàng với các chủ xe và doanh nghiệp cho
                thuê xe, mang đến quy trình đặt xe nhanh chóng, minh bạch và
                tiện lợi.
              </p>
              <p className="mt-4 leading-8 text-muted">
                Với BQ Drive, người dùng có thể xem thông tin chi tiết từng xe
                trước khi đặt. Đồng thời, chủ xe có công cụ để đăng tải, quản lý
                phương tiện và xác nhận các yêu cầu thuê xe dễ dàng hơn.
              </p>
            </div>

            <div className="rounded-lg bg-primary p-6 text-white shadow-xl">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-primary">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-2xl font-extrabold">
                BQ Drive hướng đến trải nghiệm thuê xe hiện đại, an toàn và thân
                thiện.
              </h3>
              <div className="mt-6 grid gap-4">
                {values.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2
                      size={20}
                      className="mt-1 shrink-0 text-secondary"
                    />
                    <span className="leading-7 text-white/78">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f1f5f9] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-8 max-w-3xl">
              <p className="text-sm font-bold uppercase text-secondary">
                Điều BQ Drive mang lại
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-primary md:text-4xl">
                Thuê xe rõ ràng hơn cho khách hàng, quản lý gọn hơn cho chủ xe
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {aboutHighlights.map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="rounded-lg border border-border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-secondary/60 hover:shadow-lg"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
                    <Icon size={24} />
                  </div>
                  <h3 className="mt-5 text-xl font-extrabold text-primary">
                    {title}
                  </h3>
                  <p className="mt-3 leading-7 text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-8 rounded-lg bg-primary p-6 text-white md:grid-cols-[minmax(0,1fr)_320px] md:p-10">
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Sẵn sàng bắt đầu?
              </p>
              <h2 className="mt-2 text-3xl font-extrabold">
                Tìm chiếc xe phù hợp cho chuyến đi tiếp theo của bạn
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-white/70">
                BQ Drive giúp mọi chuyến đi trở nên chủ động, linh hoạt và thuận
                tiện hơn từ lúc tìm xe đến khi hoàn tất đơn thuê.
              </p>
            </div>

            <div className="flex items-center md:justify-end">
              <Link
                to="/#home-cars"
                className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:-translate-y-0.5 hover:brightness-95"
              >
                Xem xe
                <ArrowRight size={19} />
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}
