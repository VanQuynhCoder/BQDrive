export default function Footer() {
  return (
    <footer className="bg-slate-950 px-8 py-12 text-white">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row">
        <div>
          <h2 className="text-2xl font-extrabold text-secondary">BQDrive</h2>
          <p className="mt-3 max-w-md text-slate-300">
            Hệ thống quản lý và đặt thuê xe trực tuyến dành cho khách hàng,
            doanh nghiệp và cá nhân cho thuê xe.
          </p>
        </div>

        <div className="text-slate-300">© 2026 BQDrive. All rights reserved.</div>
      </div>
    </footer>
  );
}