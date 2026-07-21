import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { CarFront, LogIn, ShieldCheck, Sparkles } from "lucide-react";

type Props = {
  children: ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
};

const heroImage =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1800";

const authButtonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-extrabold transition";

export default function AuthLayout({
  children,
  title,
  subtitle,
  badge = "BQDrive",
}: Props) {
  const { pathname } = useLocation();

  const isLoginPage = pathname === "/login";
  const isRegisterPage = pathname === "/register";

  return (
    <div className="min-h-screen overflow-hidden bg-[#0f141b] text-white">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#151a22]/95 backdrop-blur">
        <header className="mx-auto flex min-h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-primary shadow-lg shadow-black/20">
              <CarFront size={26} className="text-secondary" />
            </span>

            <span className="hidden text-xl font-extrabold text-white sm:block">
              BQDrive
            </span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              to="/login"
              className={
                isLoginPage
                  ? `${authButtonBase} border border-white/10 bg-white/10 text-secondary`
                  : `${authButtonBase} border border-white/10 text-white hover:bg-white/10`
              }
            >
              <LogIn size={17} />
              <span className="hidden sm:inline">Đăng nhập</span>
            </Link>

            <Link
              to="/register"
              className={
                isRegisterPage
                  ? `${authButtonBase} bg-secondary text-primary shadow-lg shadow-yellow-500/20`
                  : `${authButtonBase} border border-white/10 text-white hover:bg-white/10`
              }
            >
              <Sparkles size={17} />
              <span className="hidden sm:inline">Đăng ký</span>
            </Link>
          </div>
        </header>
      </div>

      <main className="relative flex min-h-screen items-center justify-center px-4 pb-10 pt-28 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(234,179,8,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(20,184,166,0.16),transparent_32%)]" />

        <section className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-lg border border-white/10 bg-[#121720] shadow-2xl shadow-black/35 lg:grid-cols-[minmax(0,0.96fr)_minmax(460px,1fr)]">
          <aside className="relative hidden min-h-[650px] overflow-hidden border-r border-white/10 lg:block">
            <img
              src={heroImage}
              alt="Dịch vụ thuê xe BQDrive"
              className="absolute inset-0 h-full w-full object-cover"
            />

            <div className="absolute inset-0 bg-primary/50" />
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#071016] via-[#071016]/70 to-transparent" />

            <div className="relative z-10 flex h-full flex-col justify-end p-8 xl:p-10">
              <div className="mb-7 flex h-28 w-28 items-center justify-center rounded-lg bg-white shadow-xl shadow-black/30">
                <div className="text-center">
                  <CarFront size={35} className="mx-auto text-secondary" />
                  <p className="mt-2 text-lg font-extrabold text-primary">
                    BQDrive
                  </p>
                </div>
              </div>

              <h1 className="text-4xl font-extrabold leading-tight">
                Thuê xe linh hoạt cho mới lịch trình.
              </h1>

              <div className="mt-6 grid gap-4 text-sm leading-6 text-white/[0.85]">
                <p>
                  <span className="font-extrabold text-secondary">
                    Một tài khoản:
                  </span>{" "}
                  Quản lý đặt xe, lịch trình và thanh toán ở cùng một nơi.
                </p>

                <p>
                  <span className="font-extrabold text-secondary">
                    Đặt xe nhanh:
                  </span>{" "}
                  Theo dõi trạng thái booking và xác nhận rõ ràng.
                </p>

                <p>
                  <span className="font-extrabold text-secondary">An tâm:</span>{" "}
                  Xe được kiểm duyệt, thông tin minh bạch trước khi thuê.
                </p>
              </div>
            </div>
          </aside>

          <section className="flex min-h-[650px] items-center px-5 py-8 sm:px-8 lg:px-10">
            <div className="w-full">
              <div className="mb-7">
                <p className="text-sm font-extrabold uppercase text-secondary">
                  {badge}
                </p>

                <h2 className="mt-2 text-3xl font-extrabold tracking-normal text-white sm:text-4xl">
                  {title}
                </h2>

                <p className="mt-3 max-w-xl leading-7 text-white/[0.72]">
                  {subtitle}
                </p>
              </div>

              {children}

              <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    size={20}
                    className="mt-0.5 shrink-0 text-secondary"
                  />

                  <div>
                    <h3 className="font-extrabold text-white">
                      Vì sao nên dùng BQDrive?
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-white/[0.68]">
                      Lưu lịch thuê xe, theo dõi booking và nhận thông tin rõ
                      ràng từ lúc chọn xe đến khi hoàn tất chuyến đi.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}





