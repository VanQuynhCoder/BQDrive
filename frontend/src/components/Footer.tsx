import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUp,
  CarFront,
  ExternalLink,
  Handshake,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { publicContactConfig } from "../config/public-contact.config";
import { founderConfig } from "../config/founder.config";

type FooterLinkItem = {
  label: string;
  to?: string;
  href?: string;
  external?: boolean;
};

const exploreLinks: FooterLinkItem[] = [
  { label: "Trang chủ", to: "/" },
  { label: "Tìm kiếm xe", to: "/cars/search" },
  { label: "Dịch vụ", to: "/services" },
  { label: "Về chúng tôi", to: "/about" },
  { label: "Đối tác BQDrive", to: "/contact" },
];

const supportLinks: FooterLinkItem[] = [
  { label: "Liên hệ hỗ trợ", to: "/contact" },
  { label: "Chính sách hủy và hoàn tiền", to: "/policies/cancellation-refund" },
];

const socialLinks = [
  {
    label: "Gửi email BQDrive",
    href: publicContactConfig.supportEmail
      ? `mailto:${publicContactConfig.supportEmail}`
      : "",
    icon: Mail,
  },
  {
    label: "Facebook BQDrive",
    href: publicContactConfig.facebook,
    icon: ExternalLink,
  },
  {
    label: "GitHub BQDrive",
    href: publicContactConfig.github,
    icon: ExternalLink,
  },
  {
    label: "LinkedIn BQDrive",
    href: publicContactConfig.linkedin,
    icon: ExternalLink,
  },
].filter((item) => Boolean(item.href));

const contactItems = [
  {
    icon: Mail,
    label: "Email hỗ trợ",
    value: publicContactConfig.supportEmail,
    href: publicContactConfig.supportEmail
      ? `mailto:${publicContactConfig.supportEmail}`
      : "",
  },
  {
    icon: Handshake,
    label: "Email hợp tác",
    value: publicContactConfig.partnershipEmail,
    href: publicContactConfig.partnershipEmail
      ? `mailto:${publicContactConfig.partnershipEmail}?subject=Hợp tác cùng BQDrive`
      : "",
  },
  {
    icon: Phone,
    label: "Điện thoại",
    value: publicContactConfig.phone,
    href: publicContactConfig.phone ? `tel:${publicContactConfig.phone}` : "",
  },
  {
    icon: MapPin,
    label: "Khu vực phục vụ",
    value: publicContactConfig.operatingArea || publicContactConfig.serviceArea,
    href: "",
  },
].filter((item) => Boolean(item.value));

function FooterLink({ item }: { item: FooterLinkItem }) {
  const className =
    "inline-flex w-fit items-center gap-2 rounded-lg py-1 text-sm font-semibold text-slate-300 transition duration-200 hover:translate-x-1 hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary";

  if (item.to) {
    return (
      <Link to={item.to} className={className}>
        {item.label}
      </Link>
    );
  }

  if (item.href) {
    return (
      <a
        href={item.href}
        target={item.external ? "_blank" : undefined}
        rel={item.external ? "noopener noreferrer" : undefined}
        className={className}
      >
        {item.label}
        {item.external && <ExternalLink size={14} />}
      </a>
    );
  }

  return null;
}

function useBackToTopVisibility() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;

    const updateVisibility = () => {
      setVisible(window.scrollY > 520);
      ticking = false;
    };

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateVisibility);
    };

    updateVisibility();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return visible;
}

export default function Footer() {
  const year = new Date().getFullYear();
  const showBackToTop = useBackToTopVisibility();

  const handleBackToTop = () => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  return (
    <>
      <style>
        {`
          @keyframes footerGradientMove {
            0% { background-position: 0% 50%; }
            100% { background-position: 100% 50%; }
          }

          @keyframes footerLightSweep {
            0% { transform: translateX(-35%); opacity: 0; }
            25% { opacity: 0.75; }
            100% { transform: translateX(135%); opacity: 0; }
          }

          @keyframes footerFloat {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(0, -8px, 0); }
          }

          @keyframes footerCtaPulse {
            0%, 100% { opacity: 0.75; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.018); }
          }

          .footer-gradient {
            background: linear-gradient(120deg, #020617, #0f172a, #111827, #1e293b);
            background-size: 240% 240%;
            animation: footerGradientMove 16s ease-in-out infinite alternate;
          }

          .footer-light-sweep::after {
            content: "";
            position: absolute;
            inset-block-start: 0;
            inset-inline-start: 0;
            height: 2px;
            width: 38%;
            background: linear-gradient(90deg, transparent, #eab308, transparent);
            animation: footerLightSweep 5.5s ease-in-out infinite;
          }

          .footer-floating {
            animation: footerFloat 6s ease-in-out infinite;
            will-change: transform;
          }

          .footer-cta-glow {
            animation: footerCtaPulse 4.8s ease-in-out infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .footer-gradient,
            .footer-light-sweep::after,
            .footer-floating,
            .footer-cta-glow {
              animation: none;
            }
          }
        `}
      </style>

      <footer className="footer-gradient footer-light-sweep relative overflow-hidden px-4 pt-10 text-white sm:px-6 lg:px-8">
        <div
          aria-hidden="true"
          className="footer-floating pointer-events-none absolute -left-16 top-16 h-40 w-40 rounded-full bg-secondary/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="footer-floating pointer-events-none absolute -right-20 bottom-20 h-48 w-48 rounded-full bg-sky-400/10 blur-2xl"
          style={{ animationDelay: "1.1s" }}
        />

        <div className="relative mx-auto max-w-7xl">
          <section className="footer-cta-glow rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur md:p-7">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-extrabold uppercase text-primary">
                  <Sparkles size={15} />
                  BQDrive đồng hành cùng bạn
                </span>
                <h2 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
                  Bạn đã sẵn sàng cho hành trình tiếp theo?
                </h2>
                <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300 md:text-base">
                  Khám phá những mẫu xe phù hợp hoặc trở thành đối tác cung cấp
                  xe cùng BQDrive.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Link
                  to="/cars/search"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-3 font-extrabold text-primary transition duration-200 hover:-translate-y-0.5 hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
                >
                  Tìm xe ngay
                  <CarFront size={19} />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 font-extrabold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
                >
                  Hợp tác cùng BQDrive
                  <ArrowRight size={19} />
                </Link>
              </div>
            </div>
          </section>

          <div className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.8fr))]">
            <section>
              <Link
                to="/"
                className="inline-flex items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                  <ShieldCheck size={25} />
                </span>
                <span className="text-2xl font-extrabold text-white">
                  BQDrive
                </span>
              </Link>
              <p className="mt-5 max-w-md text-sm font-semibold leading-7 text-slate-300">
                BQDrive là nền tảng kết nối người thuê xe với các doanh nghiệp
                và chủ xe uy tín, hướng đến trải nghiệm thuê xe thuận tiện, minh
                bạch và an toàn.
              </p>

              {socialLinks.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {socialLinks.map(({ label, href, icon: Icon }) => (
                    <a
                      key={label}
                      href={href}
                      aria-label={label}
                      target={href.startsWith("http") ? "_blank" : undefined}
                      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-slate-200 transition duration-200 hover:-translate-y-1 hover:border-secondary hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
                    >
                      <Icon size={18} />
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-secondary">
                Khám phá
              </h3>
              <div className="mt-4 grid gap-2">
                {exploreLinks.map((item) => (
                  <FooterLink key={item.label} item={item} />
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-secondary">
                Hỗ trợ khách hàng
              </h3>
              <div className="mt-4 grid gap-2">
                {supportLinks.map((item) => (
                  <FooterLink key={item.label} item={item} />
                ))}
              </div>
              <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs font-semibold leading-6 text-slate-400">
                Các mục điều khoản, bảo mật và FAQ sẽ được hiển thị khi hệ thống
                có route nội dung chính thức.
              </p>
            </section>

            <section>
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-secondary">
                Liên hệ
              </h3>
              <div className="mt-4 grid gap-3">
                {contactItems.length > 0 ? (
                  contactItems.map(({ icon: Icon, label, value, href }) => {
                    const content = (
                      <>
                        <Icon size={17} className="mt-1 shrink-0 text-secondary" />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold uppercase text-slate-500">
                            {label}
                          </span>
                          <span className="block break-words text-sm font-semibold leading-6 text-slate-300">
                            {value}
                          </span>
                        </span>
                      </>
                    );

                    return href ? (
                      <a
                        key={label}
                        href={href}
                        className="flex items-start gap-2 rounded-xl transition hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
                      >
                        {content}
                      </a>
                    ) : (
                      <p key={label} className="flex items-start gap-2">
                        {content}
                      </p>
                    );
                  })
                ) : (
                  <p className="text-sm font-semibold leading-7 text-slate-400">
                    Thông tin liên hệ công khai đang được cập nhật.
                  </p>
                )}
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-4 border-t border-white/10 py-6 text-sm font-semibold text-slate-400 md:flex-row md:items-center md:justify-between">
            <p>© {year} BQDrive. All rights reserved.</p>
            <div className="flex flex-col gap-2 md:items-end">
              <p>Sáng lập và phát triển bởi {founderConfig.name}.</p>
              <p className="text-xs text-slate-500">
                Sản phẩm được phát triển trong khuôn khổ Luận văn tốt nghiệp.
              </p>
            </div>
          </div>
        </div>
      </footer>

      <button
        type="button"
        aria-label="Quay lại đầu trang"
        onClick={handleBackToTop}
        className={`footer-floating fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary shadow-xl transition duration-300 hover:-translate-y-1 hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary md:bottom-7 md:right-7 ${
          showBackToTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        <ArrowUp size={22} />
      </button>
    </>
  );
}
