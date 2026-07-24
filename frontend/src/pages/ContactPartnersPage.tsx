import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CarFront,
  ExternalLink,
  Handshake,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import {
  businessService,
  type PublicBusinessPartner,
  type PublicPartnerStats,
} from "../services/business.service";
import { publicContactConfig } from "../config/public-contact.config";
import { founderConfig } from "../config/founder.config";

const emptyStats: PublicPartnerStats = {
  partnerCount: 0,
  activeCarCount: 0,
  servedAreaCount: 0,
};

const contactCards = [
  {
    icon: Mail,
    label: "Email hỗ trợ",
    value: publicContactConfig.supportEmail || "Đang cập nhật",
    href: publicContactConfig.supportEmail
      ? `mailto:${publicContactConfig.supportEmail}`
      : "",
  },
  {
    icon: Handshake,
    label: "Email hợp tác",
    value: publicContactConfig.partnershipEmail || "Đang cập nhật",
    href: publicContactConfig.partnershipEmail
      ? `mailto:${publicContactConfig.partnershipEmail}?subject=Hợp tác cùng BQDrive`
      : "",
  },
  {
    icon: Phone,
    label: "Điện thoại",
    value: publicContactConfig.phone || "Đang cập nhật",
    href: publicContactConfig.phone ? `tel:${publicContactConfig.phone}` : "",
  },
  {
    icon: MapPin,
    label: "Khu vực hoạt động",
    value: publicContactConfig.operatingArea,
    href: "",
  },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function normalizeWebsiteUrl(value?: string | null) {
  const website = (value || "").trim();
  if (!website) return "";
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}

function scrollToSection(id: string) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
}

function PartnerLogo({ partner }: { partner: PublicBusinessPartner }) {
  const initials = getInitials(partner.businessName || "BQ");

  if (partner.logo) {
    return (
      <img
        src={partner.logo}
        alt={`Logo ${partner.businessName}`}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-secondarySoft text-lg font-extrabold text-primary">
      {initials}
    </div>
  );
}

function PartnerCard({ partner }: { partner: PublicBusinessPartner }) {
  const websiteUrl = normalizeWebsiteUrl(partner.website);

  return (
    <article className="group rounded-2xl border border-border bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-secondary/60 hover:shadow-xl">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-slate-50 p-2 transition duration-300 group-hover:scale-105">
          <PartnerLogo partner={partner} />
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-xl font-extrabold text-primary">
            {partner.businessName}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-muted">
            {partner.description || "Đối tác đang cập nhật mô tả công khai."}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm font-semibold text-slate-700">
        {partner.publicEmail && (
          <a
            href={`mailto:${partner.publicEmail}`}
            className="flex items-center gap-2 break-all rounded-xl bg-slate-50 px-3 py-2 transition hover:bg-secondarySoft"
          >
            <Mail size={17} className="shrink-0 text-secondary" />
            {partner.publicEmail}
          </a>
        )}

        {partner.publicPhone && (
          <a
            href={`tel:${partner.publicPhone}`}
            className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 transition hover:bg-secondarySoft"
          >
            <Phone size={17} className="shrink-0 text-secondary" />
            {partner.publicPhone}
          </a>
        )}

        {partner.address && (
          <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 leading-6">
            <MapPin size={17} className="mt-1 shrink-0 text-secondary" />
            <span>{partner.address}</span>
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {partner.publicEmail && (
          <a
            href={`mailto:${partner.publicEmail}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm font-extrabold text-primary transition hover:brightness-95"
          >
            Gửi email
            <Mail size={17} />
          </a>
        )}

        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-secondary transition hover:bg-primaryDark"
          >
            Xem website
            <ExternalLink size={17} />
          </a>
        )}
      </div>
    </article>
  );
}

function PartnerMarquee({ partners }: { partners: PublicBusinessPartner[] }) {
  if (!partners.length) return null;

  const marqueeItems = partners.length === 1 ? [...partners, ...partners] : partners;

  return (
    <section className="border-y border-border bg-white py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-5">
          <p className="text-sm font-extrabold uppercase text-secondary">
            Đồng hành cùng BQDrive
          </p>
          <h2 className="mt-2 text-2xl font-extrabold text-primary">
            Những doanh nghiệp đang cùng chúng tôi xây dựng hệ sinh thái thuê xe tin cậy
          </h2>
        </div>

        <div className="contact-marquee-mask overflow-hidden">
          <div className="contact-marquee-track flex w-max gap-4 hover:[animation-play-state:paused]">
            {[marqueeItems, marqueeItems].map((group, groupIndex) => (
              <div
                key={groupIndex === 0 ? "primary" : "duplicate"}
                aria-hidden={groupIndex === 1}
                className="flex gap-4"
              >
                {group.map((partner, index) => (
                  <div
                    key={`${partner._id}-${groupIndex}-${index}`}
                    className="flex h-20 w-64 items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white p-1">
                      <PartnerLogo partner={partner} />
                    </div>
                    <p className="line-clamp-2 font-extrabold text-primary">
                      {partner.businessName}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-72 animate-pulse rounded-2xl border border-border bg-white p-5"
        >
          <div className="flex gap-4">
            <div className="h-16 w-16 rounded-2xl bg-slate-100" />
            <div className="flex-1 space-y-3">
              <div className="h-5 w-3/4 rounded bg-slate-100" />
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
          <div className="mt-8 space-y-3">
            <div className="h-10 rounded-xl bg-slate-100" />
            <div className="h-10 rounded-xl bg-slate-100" />
            <div className="h-10 rounded-xl bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ContactPartnersPage() {
  const [partners, setPartners] = useState<PublicBusinessPartner[]>([]);
  const [stats, setStats] = useState<PublicPartnerStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPartners = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await businessService.getPublicPartners();
      setPartners(data.partners);
      setStats(data.stats);
    } catch {
      setPartners([]);
      setStats(emptyStats);
      setError("Không thể tải danh sách đối tác. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const previousTitle = document.title;
    document.title = "Liên hệ & Đối tác | BQDrive";

    const fetchInitialPartners = async () => {
      try {
        const data = await businessService.getPublicPartners();
        if (!active) return;
        setPartners(data.partners);
        setStats(data.stats);
      } catch {
        if (!active) return;
        setPartners([]);
        setStats(emptyStats);
        setError("Không thể tải danh sách đối tác. Vui lòng thử lại sau.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchInitialPartners();

    return () => {
      active = false;
      document.title = previousTitle;
    };
  }, []);

  const statItems = useMemo(
    () => [
      {
        icon: Building2,
        value: stats.partnerCount,
        label: "Doanh nghiệp đối tác",
      },
      {
        icon: CarFront,
        value: stats.activeCarCount,
        label: "Xe đang hoạt động",
      },
      {
        icon: MapPin,
        value: stats.servedAreaCount,
        label: "Khu vực phục vụ",
      },
    ],
    [stats],
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-primary">
      <style>
        {`
          @keyframes contactGradientMove {
            0% { background-position: 0% 50%; }
            100% { background-position: 100% 50%; }
          }

          @keyframes contactFloat {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(0, -10px, 0); }
          }

          @keyframes contactMarquee {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }

          @keyframes contactBorderFlow {
            0% { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
          }

          @keyframes contactPulse {
            0%, 100% { opacity: 0.72; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.025); }
          }

          .contact-hero-bg {
            background: linear-gradient(120deg, #020617, #0f172a, #1e293b, #eab308);
            background-size: 240% 240%;
            animation: contactGradientMove 14s ease-in-out infinite alternate;
          }

          .contact-floating {
            animation: contactFloat 5.5s ease-in-out infinite;
            will-change: transform;
          }

          .contact-marquee-mask {
            -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
            mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
          }

          .contact-marquee-track {
            animation: contactMarquee 28s linear infinite;
            will-change: transform;
          }

          .contact-founder-frame {
            background: linear-gradient(90deg, #eab308, #0f172a, #facc15, #0f172a, #eab308);
            background-size: 220% 100%;
            animation: contactBorderFlow 8s linear infinite;
          }

          .contact-cta-glow {
            animation: contactPulse 4s ease-in-out infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .contact-hero-bg,
            .contact-floating,
            .contact-marquee-track,
            .contact-founder-frame,
            .contact-cta-glow {
              animation: none;
            }
          }
        `}
      </style>

      <Header />

      <main className="pt-20">
        <section className="contact-hero-bg relative overflow-hidden text-white">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:48px_48px] opacity-25" />

          <div
            aria-hidden="true"
            className="contact-floating absolute right-8 top-24 hidden rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur lg:block"
          >
            <p className="text-sm font-extrabold text-secondary">Đối tác</p>
            <p className="mt-1 text-2xl font-extrabold">{stats.partnerCount}</p>
          </div>
          <div
            aria-hidden="true"
            className="contact-floating absolute bottom-16 left-8 hidden rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur lg:block"
            style={{ animationDelay: "900ms" }}
          >
            <p className="text-sm font-extrabold text-secondary">Xe hoạt động</p>
            <p className="mt-1 text-2xl font-extrabold">{stats.activeCarCount}</p>
          </div>

          <div className="relative mx-auto grid min-h-[600px] max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-extrabold text-primary">
                <Sparkles size={17} />
                Mạng lưới đối tác BQDrive
              </span>
              <h1 className="mt-6 max-w-4xl text-4xl font-extrabold leading-tight md:text-6xl">
                Kết nối cùng hệ sinh thái di chuyển BQDrive
              </h1>
              <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/78">
                BQDrive hợp tác cùng các doanh nghiệp và chủ xe uy tín nhằm
                mang đến trải nghiệm thuê xe thuận tiện, minh bạch và an toàn.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => scrollToSection("partners")}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-secondary px-6 py-3 font-extrabold text-primary transition hover:-translate-y-0.5 hover:brightness-95"
                >
                  Khám phá đối tác
                  <ArrowRight size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection("bqdrive-contact")}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 font-extrabold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/16"
                >
                  Liên hệ hợp tác
                  <Handshake size={18} />
                </button>
              </div>
            </div>

            <div className="contact-floating rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
                <ShieldCheck size={28} />
              </div>
              <h2 className="mt-5 text-2xl font-extrabold">
                Minh bạch từ đối tác đến từng chuyến thuê
              </h2>
              <p className="mt-3 leading-7 text-white/72">
                Doanh nghiệp được duyệt, xe được kiểm tra, giá thuê và thông tin
                liên hệ được trình bày rõ ràng để khách hàng dễ lựa chọn.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-6 py-8 md:grid-cols-3">
          {statItems.map(({ icon: Icon, value, label }) => (
            <article
              key={label}
              className="rounded-2xl border border-border bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-3xl font-extrabold text-primary">{value}</p>
                  <p className="mt-1 font-semibold text-muted">{label}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondarySoft text-secondary">
                  <Icon size={24} />
                </div>
              </div>
            </article>
          ))}
        </section>

        <PartnerMarquee partners={partners} />

        <section id="partners" className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-extrabold uppercase text-secondary">
                Danh sách đối tác
              </p>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight text-primary md:text-5xl">
                Doanh nghiệp đang hợp tác cùng BQDrive
              </h2>
              <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-muted">
                Thông tin bên dưới chỉ gồm dữ liệu công khai phục vụ liên hệ và
                tham khảo, không bao gồm dữ liệu nội bộ của doanh nghiệp.
              </p>
            </div>
          </div>

          {loading && <LoadingSkeleton />}

          {!loading && error && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6">
              <p className="font-extrabold text-red-700">{error}</p>
              <button
                type="button"
                onClick={loadPartners}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 font-extrabold text-secondary"
              >
                <RefreshCw size={18} />
                Thử lại
              </button>
            </div>
          )}

          {!loading && !error && partners.length === 0 && (
            <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
              <Building2 className="mx-auto text-secondary" size={42} />
              <h3 className="mt-4 text-2xl font-extrabold text-primary">
                Danh sách đối tác đang được cập nhật
              </h3>
              <p className="mt-2 font-semibold text-muted">
                Khi có doanh nghiệp được duyệt và bật hiển thị công khai, hệ
                thống sẽ hiển thị tại đây.
              </p>
            </div>
          )}

          {!loading && !error && partners.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {partners.map((partner) => (
                <PartnerCard key={partner._id} partner={partner} />
              ))}
            </div>
          )}
        </section>

        <section id="bqdrive-contact" className="bg-white py-16">
          <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <p className="text-sm font-extrabold uppercase text-secondary">
                Liên hệ BQDrive
              </p>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight md:text-5xl">
                Bạn muốn đồng hành cùng BQDrive?
              </h2>
              <p className="mt-4 text-base font-semibold leading-8 text-muted">
                BQDrive luôn sẵn sàng kết nối với các doanh nghiệp, đơn vị vận
                tải và chủ xe có định hướng vận hành minh bạch, chuyên nghiệp.
              </p>
              <div className="contact-cta-glow mt-7 rounded-2xl border border-secondary/30 bg-secondarySoft p-5">
                <p className="font-extrabold text-primary">
                  Thời gian hỗ trợ: {publicContactConfig.workingHours}
                </p>
                <p className="mt-2 font-semibold text-muted">
                  Địa chỉ: {publicContactConfig.address}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {contactCards.map(({ icon: Icon, label, value, href }) => {
                const content = (
                  <>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondarySoft text-secondary">
                      <Icon size={22} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold uppercase text-muted">
                        {label}
                      </p>
                      <p className="mt-1 break-words text-lg font-extrabold text-primary">
                        {value}
                      </p>
                    </div>
                  </>
                );

                return href ? (
                  <a
                    key={label}
                    href={href}
                    className="flex items-start gap-4 rounded-2xl border border-border bg-background p-5 transition hover:-translate-y-1 hover:border-secondary/60 hover:shadow-lg"
                  >
                    {content}
                  </a>
                ) : (
                  <div
                    key={label}
                    className="flex items-start gap-4 rounded-2xl border border-border bg-background p-5"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="contact-founder-frame rounded-[1.75rem] p-[2px] shadow-sm">
            <div className="rounded-[1.65rem] bg-primary p-6 text-white md:p-8">
              <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
                <div className="contact-floating mx-auto flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/10 p-2">
                  {founderConfig.avatar ? (
                    <img
                      src={founderConfig.avatar}
                      alt={founderConfig.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-5xl font-extrabold text-secondary">
                      BQ
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-sm font-extrabold uppercase text-secondary">
                    Người sáng lập
                  </p>
                  <h2 className="mt-2 text-3xl font-extrabold md:text-5xl">
                    {founderConfig.name}
                  </h2>
                  <p className="mt-2 text-lg font-extrabold text-secondary">
                    {founderConfig.role}
                  </p>
                  <p className="mt-5 max-w-3xl font-semibold leading-8 text-white/75">
                    {founderConfig.description}
                  </p>
                  <blockquote className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-5 font-semibold leading-8 text-white/82">
                    “{founderConfig.quote}”
                  </blockquote>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {founderConfig.publicEmail && (
                      <a
                        href={`mailto:${founderConfig.publicEmail}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-secondary px-4 py-2 font-extrabold text-primary"
                      >
                        <Mail size={18} />
                        Gửi email
                      </a>
                    )}
                    {founderConfig.github && (
                      <a
                        href={founderConfig.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-2 font-extrabold text-white"
                      >
                        GitHub
                        <ExternalLink size={18} />
                      </a>
                    )}
                    {founderConfig.linkedin && (
                      <a
                        href={founderConfig.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-2 font-extrabold text-white"
                      >
                        LinkedIn
                        <ExternalLink size={18} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
