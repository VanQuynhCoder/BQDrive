import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CarFront,
  CheckCircle2,
  ClipboardCheck,
  Headphones,
  Handshake,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  UserCheck,
  WalletCards,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";

const heroImage =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1800";

const serviceSections = [
  {
    number: "01",
    icon: Smartphone,
    audience: "Hệ thống tài khoản thành viên",
    title: "Trải nghiệm một chạm",
    subtitle: "Đăng ký, đăng nhập nhanh chóng và bảo mật tuyệt đối",
    description:
      "Chỉ mất chưa đầy 30 giây để thiết lập tài khoản và mở ra cánh cửa trải nghiệm mọi dịch vụ đẳng cấp của BQDrive. Hệ thống thông minh tối ưu hóa toàn bộ quy trình để bạn bắt đầu chuyến đi hoặc quản lý xe một cách mượt mà nhất.",
    points: [
      "Kết nối đa nền tảng qua số điện thoại, email hoặc liên kết một chạm với Google, Facebook, Apple ID.",
      "Xác thực eKYC thông minh, hỗ trợ xác minh bằng lái và giấy tờ định danh nhanh chóng.",
      "Theo dõi lịch sử thuê xe, lịch sử doanh thu từ xe ký gửi và nhận nhắc lịch tự động khi đến ngày nhận/trả xe.",
      "Tích hợp ví điện tử và cổng thanh toán MoMo, VNPAY, thẻ ngân hàng để giao dịch an toàn, bảo mật.",
    ],
  },
  {
    number: "02",
    icon: CarFront,
    audience: "Dành cho chủ xe cá nhân",
    title: "Biến xe nhàn rỗi thành nguồn thu nhập",
    subtitle: "Đăng ký gửi xe dễ dàng, chủ động và an tâm",
    description:
      "Chiếc ô tô của bạn đang nằm trong garage và vẫn phát sinh chi phí bảo dưỡng, bảo hiểm, bến bãi mỗi tháng? BQDrive giúp biến xe nhàn rỗi thành nguồn thu nhập thụ động bền vững bằng cách kết nối với khách thuê tự lái uy tín.",
    points: [
      "Đăng xe trong 5 phút với hình ảnh, dòng xe, đời xe, tính năng đi kèm và mức giá mong muốn.",
      "Toàn quyền bật/tắt lịch cho thuê vào những ngày bạn cần dùng xe.",
      "Xem hồ sơ, đánh giá của khách thuê trước khi quyết định đồng ý cho thuê.",
      "Quy trình bàn giao kỹ thuật số và gói bảo hiểm chuyến đi giúp chủ xe yên tâm hơn.",
    ],
  },
  {
    number: "03",
    icon: Building2,
    audience: "Dành cho doanh nghiệp và đối tác vận tải",
    title: "Nâng tầm số hóa đội xe",
    subtitle: "Giải pháp đồng hành toàn diện cho vận hành chuyên nghiệp",
    description:
      "BQDrive là đòn bẩy công nghệ cho công ty cho thuê xe tự lái, doanh nghiệp vận tải hoặc nhà xe truyền thống muốn mở rộng khách hàng, giảm quản lý thủ công và tối ưu hóa quy trình vận hành.",
    points: [
      "Tiếp cận khách hàng thế hệ mới có thói quen tìm kiếm và đặt xe qua website hoặc ứng dụng.",
      "Quản lý hàng chục đến hàng trăm xe trên một màn hình duy nhất.",
      "Cập nhật trạng thái xe theo thời gian thực: đang trống, đang cho thuê hoặc đang bảo dưỡng.",
      "Theo dõi doanh thu, hiệu suất khai thác bằng biểu đồ và nhận chính sách chiết khấu B2B linh hoạt.",
    ],
  },
];

const platformFeatures = [
  { icon: UserCheck, label: "eKYC thông minh" },
  { icon: WalletCards, label: "Thanh toán đa cổng" },
  { icon: BarChart3, label: "Báo cáo trực quan" },
  { icon: Handshake, label: "Hợp tác minh bạch" },
];

const reasons = [
  {
    icon: LockKeyhole,
    title: "Công nghệ dẫn đầu",
    text: "Hệ thống vận hành mượt mà, gợi ý xe thông minh dựa trên vị trí và nhu cầu của người dùng.",
  },
  {
    icon: ClipboardCheck,
    title: "Minh bạch tuyệt đối",
    text: "Không chi phí ẩn, không phụ phí mập mờ. Giá thuê, chính sách hủy chuyến và bảo hiểm đều rõ ràng.",
  },
  {
    icon: Headphones,
    title: "Hỗ trợ 24/7",
    text: "Bất kể là sự cố trên đường hay thắc mắc kỹ thuật, BQDrive luôn trực chiến để đồng hành cùng bạn.",
  },
];

export default function ServicesPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />

      <main className="pt-20">
        <section className="relative overflow-hidden bg-primary text-white">
          <img
            src={heroImage}
            alt="Dịch vụ thuê xe và ký gửi xe BQDrive"
            className="absolute inset-0 h-full w-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-black/60" />

          <div className="relative mx-auto min-h-[560px] max-w-7xl px-6 py-16 md:py-20">
            <div className="max-w-4xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-extrabold text-primary">
                <ShieldCheck size={17} />
                Dịch vụ BQDrive
              </span>

              <h1 className="mt-6 text-4xl font-extrabold leading-tight md:text-6xl">
                Nền tảng công nghệ cho thuê xe và ký gửi thông minh
              </h1>

              <p className="mt-6 max-w-3xl text-lg leading-8 text-white/80">
                BQDrive định nghĩa lại trải nghiệm di chuyển: không còn thủ tục
                giấy tờ rườm rà, không còn những chiếc xe cá nhân phải nằm yên
                lãng phí và không còn nỗi lo tìm kiếm khách hàng của doanh
                nghiệp vận tải.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  to="/"
                  className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary transition hover:brightness-95"
                >
                  Về trang chủ
                  <ArrowRight size={18} />
                </Link>
                <Link
                  to="/#home-cars"
                  className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-white/10 px-6 py-3 font-extrabold text-white ring-1 ring-white/20 transition hover:bg-white/15"
                >
                  Tìm xe ngay
                  <CarFront size={18} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-white">
          <div className="mx-auto grid max-w-7xl gap-4 px-6 py-8 md:grid-cols-4">
            {platformFeatures.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
                  <Icon size={22} />
                </div>
                <span className="font-extrabold text-primary">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 md:py-20">
          <div className="mb-10 max-w-3xl">
            <p className="text-sm font-bold uppercase text-secondary">
              Hệ sinh thái dịch vụ
            </p>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight text-primary md:text-5xl">
              Mọi hành trình bắt đầu bằng sự tiện lợi, an toàn và tối ưu chi phí
            </h2>
          </div>

          <div className="grid gap-5">
            {serviceSections.map(
              ({ number, icon: Icon, audience, title, subtitle, description, points }) => (
                <article
                  key={number}
                  className="grid gap-6 rounded-lg border border-border bg-white p-5 shadow-sm md:grid-cols-[170px_minmax(0,1fr)] md:p-7"
                >
                  <div className="flex items-center justify-between gap-4 md:block">
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Icon size={28} />
                    </div>
                    <span className="text-4xl font-extrabold text-primary/10 md:mt-8 md:block md:text-6xl">
                      {number}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-bold uppercase text-secondary">
                      {audience}
                    </p>
                    <h3 className="mt-2 text-2xl font-extrabold text-primary md:text-3xl">
                      {title}
                    </h3>
                    <p className="mt-2 font-bold text-text">{subtitle}</p>
                    <p className="mt-4 leading-7 text-muted">{description}</p>

                    <div className="mt-5 grid gap-3">
                      {points.map((point) => (
                        <p key={point} className="flex gap-3 leading-7 text-text">
                          <CheckCircle2
                            size={20}
                            className="mt-1 shrink-0 text-secondary"
                          />
                          <span>{point}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                </article>
              ),
            )}
          </div>
        </section>

        <section className="bg-white py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start">
              <div>
                <p className="text-sm font-bold uppercase text-secondary">
                  Hợp tác cùng phát triển
                </p>
                <h2 className="mt-3 text-3xl font-extrabold leading-tight text-primary md:text-5xl">
                  Sẵn sàng đồng hành với đối tác vận tải trên toàn quốc
                </h2>
                <p className="mt-5 leading-8 text-muted">
                  BQDrive hoan nghênh sự đồng hành của các công ty vận tải hành
                  khách, du lịch và cho thuê xe. Đội ngũ chuyên viên B2B hỗ trợ
                  thiết lập hệ thống riêng, tư vấn bảng giá chiết khấu và chuẩn
                  hóa quy trình hợp tác bằng văn bản pháp lý minh bạch.
                </p>
              </div>

              <div className="grid gap-4">
                {reasons.map(({ icon: Icon, title, text }) => (
                  <div
                    key={title}
                    className="flex gap-4 rounded-lg border border-border bg-white p-5 shadow-sm"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Icon size={23} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-primary">{title}</h3>
                      <p className="mt-1 leading-6 text-muted">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}
