import { useEffect } from "react";
import {
  Clock3,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { publicContactConfig } from "../config/public-contact.config";
import { founderConfig } from "../config/founder.config";

export default function ContactPartnersPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Liên hệ | BQDrive";

    return () => {
      document.title = previousTitle;
    };
  }, []);

  const contactItems = [
    {
      icon: Mail,
      label: "Email hỗ trợ",
      value: publicContactConfig.supportEmail || "Đang cập nhật",
      href: publicContactConfig.supportEmail
        ? `mailto:${publicContactConfig.supportEmail}`
        : "",
    },
    {
      icon: Phone,
      label: "Điện thoại",
      value: publicContactConfig.phone || "Đang cập nhật",
      href: publicContactConfig.phone
        ? `tel:${publicContactConfig.phone}`
        : "",
    },
    {
      icon: MapPin,
      label: "Địa chỉ",
      value: publicContactConfig.address || "Đang cập nhật",
      href: "",
    },
    {
      icon: Clock3,
      label: "Thời gian hỗ trợ",
      value: publicContactConfig.workingHours || "Đang cập nhật",
      href: "",
    },
  ];

const socialLinks = [
  {
    icon: ExternalLink,
    label: "GitHub",
    href: founderConfig.github,
  },
  {
    icon: ExternalLink,
    label: "LinkedIn",
    href: founderConfig.linkedin,
  },
  {
    icon: ExternalLink,
    label: "Facebook",
    href: founderConfig.facebook,
  },
].filter((item) => Boolean(item.href));

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-primary">
      <style>
        {`
          @keyframes contactGradientMove {
            0% {
              background-position: 0% 50%;
            }

            100% {
              background-position: 100% 50%;
            }
          }

          @keyframes contactFloat {
            0%, 100% {
              transform: translate3d(0, 0, 0);
            }

            50% {
              transform: translate3d(0, -12px, 0);
            }
          }

          @keyframes contactBorderFlow {
            0% {
              background-position: 0% 50%;
            }

            100% {
              background-position: 200% 50%;
            }
          }

          @keyframes contactPulse {
            0%, 100% {
              opacity: 0.72;
              transform: scale(1);
            }

            50% {
              opacity: 1;
              transform: scale(1.025);
            }
          }

          @keyframes contactOrbOne {
            0%, 100% {
              transform: translate3d(0, 0, 0) scale(1);
            }

            50% {
              transform: translate3d(35px, -20px, 0) scale(1.08);
            }
          }

          @keyframes contactOrbTwo {
            0%, 100% {
              transform: translate3d(0, 0, 0);
            }

            50% {
              transform: translate3d(-30px, 24px, 0);
            }
          }

          .contact-hero-bg {
            background:
              linear-gradient(
                120deg,
                #020617,
                #0f172a,
                #1e293b,
                #eab308
              );

            background-size: 240% 240%;

            animation:
              contactGradientMove
              14s
              ease-in-out
              infinite
              alternate;
          }

          .contact-floating {
            animation:
              contactFloat
              5.5s
              ease-in-out
              infinite;

            will-change: transform;
          }

          .contact-founder-frame {
            background:
              linear-gradient(
                90deg,
                #eab308,
                #0f172a,
                #facc15,
                #0f172a,
                #eab308
              );

            background-size: 220% 100%;

            animation:
              contactBorderFlow
              8s
              linear
              infinite;
          }

          .contact-cta-glow {
            animation:
              contactPulse
              4s
              ease-in-out
              infinite;
          }

          .contact-orb-one {
            animation:
              contactOrbOne
              9s
              ease-in-out
              infinite;
          }

          .contact-orb-two {
            animation:
              contactOrbTwo
              11s
              ease-in-out
              infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .contact-hero-bg,
            .contact-floating,
            .contact-founder-frame,
            .contact-cta-glow,
            .contact-orb-one,
            .contact-orb-two {
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
            className="contact-orb-one absolute -right-28 top-20 h-80 w-80 rounded-full bg-secondary/20 blur-3xl"
          />

          <div
            aria-hidden="true"
            className="contact-orb-two absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
          />

          <div className="relative mx-auto grid min-h-[580px] max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-extrabold text-primary">
                <Sparkles size={17} />
                Liên hệ BQDrive
              </span>

              <h1 className="mt-6 max-w-4xl text-4xl font-extrabold leading-tight md:text-6xl">
                Kết nối với BQDrive
              </h1>

              <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/80">
                Nếu bạn cần hỗ trợ về thuê xe, ký gửi xe hoặc các
                chức năng của hệ thống, hãy liên hệ với BQDrive
                qua các kênh bên dưới.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                {publicContactConfig.supportEmail && (
                  <a
                    href={`mailto:${publicContactConfig.supportEmail}`}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-secondary px-6 py-3 font-extrabold text-primary transition hover:-translate-y-1 hover:brightness-95"
                  >
                    <Mail size={18} />
                    Gửi email
                  </a>
                )}

                {publicContactConfig.phone && (
                  <a
                    href={`tel:${publicContactConfig.phone}`}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 font-extrabold text-white backdrop-blur transition hover:-translate-y-1 hover:bg-white/20"
                  >
                    <Phone size={18} />
                    Liên hệ
                  </a>
                )}
              </div>
            </div>

            <div className="contact-floating rounded-3xl border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
                <ShieldCheck size={28} />
              </div>

              <h2 className="mt-5 text-2xl font-extrabold">
                BQDrive luôn sẵn sàng hỗ trợ
              </h2>

              <p className="mt-4 leading-7 text-white/75">
                Hệ thống hướng đến trải nghiệm thuê xe rõ ràng,
                thuận tiện và hỗ trợ người dùng quản lý các xe ký
                gửi trên cùng một tài khoản.
              </p>

              <div className="contact-cta-glow mt-6 rounded-2xl border border-secondary/30 bg-secondary/10 p-5">
                <p className="text-sm font-bold uppercase text-secondary">
                  Thời gian hỗ trợ
                </p>

                <p className="mt-2 font-extrabold text-white">
                  {publicContactConfig.workingHours}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-extrabold uppercase tracking-wider text-secondary">
              Thông tin liên hệ
            </p>

            <h2 className="mt-3 text-3xl font-extrabold text-primary md:text-5xl">
              Bạn cần hỗ trợ?
            </h2>

            <p className="mt-4 font-semibold leading-7 text-muted">
              Chọn kênh liên hệ phù hợp để trao đổi với BQDrive.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {contactItems.map(
              ({ icon: Icon, label, value, href }) => {
                const content = (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondarySoft text-secondary">
                      <Icon size={23} />
                    </div>

                    <div className="mt-5">
                      <p className="text-sm font-bold uppercase text-muted">
                        {label}
                      </p>

                      <p className="mt-2 break-words text-lg font-extrabold leading-7 text-primary">
                        {value}
                      </p>
                    </div>
                  </>
                );

                return href ? (
                  <a
                    key={label}
                    href={href}
                    className="rounded-2xl border border-border bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-2 hover:border-secondary/60 hover:shadow-xl"
                  >
                    {content}
                  </a>
                ) : (
                  <article
                    key={label}
                    className="rounded-2xl border border-border bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-2 hover:border-secondary/60 hover:shadow-xl"
                  >
                    {content}
                  </article>
                );
              },
            )}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-20">
          <div className="contact-founder-frame rounded-[1.8rem] p-[2px] shadow-lg">
            <div className="rounded-[1.7rem] bg-primary p-7 text-white md:p-10">
              <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
                <div className="contact-floating mx-auto flex h-44 w-44 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/10 p-2">
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
                  <p className="text-sm font-extrabold uppercase tracking-wider text-secondary">
                    Founder
                  </p>

                  <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">
                    {founderConfig.name}
                  </h2>

                  <p className="mt-2 font-bold text-secondary">
                    {founderConfig.role}
                  </p>

                  <p className="mt-5 max-w-3xl font-medium leading-8 text-white/75">
                    {founderConfig.description}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {founderConfig.publicEmail && (
                      <a
                        href={`mailto:${founderConfig.publicEmail}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-secondary px-4 py-2 font-extrabold text-primary transition hover:-translate-y-1"
                      >
                        <Mail size={18} />
                        Email
                      </a>
                    )}

                    {socialLinks.map(
                      ({ icon: Icon, label, href }) => (
                        <a
                          key={label}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={label}
                          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:-translate-y-1 hover:bg-white/20"
                        >
                          <Icon size={19} />
                        </a>
                      ),
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