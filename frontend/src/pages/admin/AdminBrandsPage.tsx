import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import toast from "react-hot-toast";
import { Edit, Image, Plus, Trash2, Upload, X } from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import { adminService, type AdminBrand } from "../../services/admin.service";

type BrandForm = {
  name: string;
  logo: string;
  description: string;
};

const emptyForm: BrandForm = {
  name: "",
  logo: "",
  description: "",
};

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Invalid file result"));
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function AdminBrandsPage() {
  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [form, setForm] = useState<BrandForm>(emptyForm);
  const [editingBrand, setEditingBrand] = useState<AdminBrand | null>(null);
  const [deleteBrand, setDeleteBrand] = useState<AdminBrand | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchBrands = async () => {
    setLoading(true);
    try {
      const data = await adminService.getBrands();
      setBrands(data);
    } catch {
      toast.error("Không thể tải danh sách hãng xe");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    adminService
      .getBrands()
      .then((data) => {
        if (active) setBrands(data);
      })
      .catch(() => {
        toast.error("Không thể tải danh sách hãng xe");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingBrand(null);
  };

  const handleEdit = (brand: AdminBrand) => {
    setEditingBrand(brand);
    setForm({
      name: brand.name,
      logo: brand.logo || "",
      description: brand.description || "",
    });
  };

  const handleLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    if (file.size > 1024 * 1024) {
      toast.error("ảnh logo nên nhỏ hơn 1MB");
      return;
    }

    try {
      const logo = await readImageAsDataUrl(file);
      setForm((prev) => ({ ...prev, logo }));
      toast.success("Đã chọn ảnh logo");
    } catch {
      toast.error("Không thể đọc file ảnh");
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event?.preventDefault();

    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên hãng");
      return;
    }

    setSubmitting(true);
    try {
      if (editingBrand) {
        await adminService.updateBrand(editingBrand._id, form);
        toast.success("Đã cập nhật hãng xe");
      } else {
        await adminService.createBrand(form);
        toast.success("Đã tạo hãng xe");
      }

      resetForm();
      await fetchBrands();
    } catch {
      toast.error("Lưu hãng xe thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteBrand) return;

    setSubmitting(true);
    try {
      await adminService.deleteBrand(deleteBrand._id);
      toast.success("Đã xóa hãng xe");
      setDeleteBrand(null);
      await fetchBrands();
    } catch {
      toast.error("Xóa hãng xe thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">
          Danh mởc xe
        </p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">
          Quản lý Hãng xe
        </h2>
        <p className="mt-2 text-slate-500">
          Tạo, cập nhật và quản lý danh sách hãng xe hiển thị trong hệ thống.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-extrabold text-primary">
                {editingBrand ? "Cập nhật hãng xe" : "Thêm hãng xe"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Logo có thể dùng URL ảnh, SVG hoặc chọn file từ máy tính.
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-primary">
              <Plus size={22} />
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">
                Tên hãng
              </span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                className="min-h-11 w-full rounded-lg border border-slate-200 px-4 outline-none focus:border-secondary"
                placeholder="Toyota, VinFast, BMW..."
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">
                Logo
              </span>
              <input
                value={form.logo}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, logo: event.target.value }))
                }
                className="min-h-11 w-full rounded-lg border border-slate-200 px-4 outline-none focus:border-secondary"
                placeholder="https://..."
              />
            </label>

            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {form.logo ? (
                    <img
                      src={form.logo}
                      alt="Logo preview"
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <Image size={26} className="text-slate-400" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-primary">
                    Chọn ảnh logo từ máy tính
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Hỗ trợ PNG, JPG, WEBP, SVG. Nên dùng ảnh dưới 1MB.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white transition hover:bg-primaryDark">
                      <Upload size={17} />
                      Chọn ảnh
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoFileChange}
                      />
                    </label>

                    {form.logo && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, logo: "" }))
                        }
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
                      >
                        <X size={17} />
                        Xóa ảnh
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">
                Mô tả
              </span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-secondary"
                placeholder="Mô tả ngắn về hãng xe"
              />
            </label>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              disabled={submitting}
              className="min-h-11 flex-1 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary transition hover:brightness-95 disabled:opacity-60"
            >
              {submitting
                ? "Đang lưu..."
                : editingBrand
                  ? "Cập nhật"
                  : "Tạo hãng"}
            </button>
            {editingBrand && (
              <button
                type="button"
                onClick={resetForm}
                className="min-h-11 rounded-lg border border-slate-200 px-5 py-2 font-bold text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
            )}
          </div>
        </form>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Logo</th>
                  <th className="px-5 py-4">Tên hãng</th>
                  <th className="px-5 py-4">Mô tả</th>
                  <th className="px-5 py-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      Đang tải danh sách hãng xe...
                    </td>
                  </tr>
                )}

                {!loading &&
                  brands.map((brand) => (
                    <tr key={brand._id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        {brand.logo ? (
                          <img
                            src={brand.logo}
                            alt={brand.name}
                            className="h-12 w-12 rounded-lg border border-slate-200 object-contain p-1"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                            <Image size={20} />
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {brand.name}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {brand.description || "--"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(brand)}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700 hover:bg-slate-200"
                          >
                            <Edit size={16} />
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteBrand(brand)}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-extrabold text-slate-800 hover:bg-slate-200"
                          >
                            <Trash2 size={16} />
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                {!loading && brands.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      Chưa có hãng xe nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <AdminModal
        open={!!deleteBrand}
        title="Xóa hãng xe"
        description={
          deleteBrand
            ? `Bạn chắc chắn muốn xóa hãng ${deleteBrand.name}?`
            : undefined
        }
        confirmText="Xóa hãng"
        danger
        loading={submitting}
        onClose={() => setDeleteBrand(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}








