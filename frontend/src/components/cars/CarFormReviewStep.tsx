//  Bước kiểm tra lại thông tin trước khi gửi xe để xét duyệt.
import { BadgeCheck, Images } from "lucide-react";

import { formatPickupAddress } from "../../utils/address.util";
import {
  getFuelTypeLabel,
  getTransmissionLabel,
} from "../../utils/display.util";
import {
  CarReviewGroup,
  ReviewValue,
  type CarFormStep,
} from "./CarFormWizard";
import type {
  CarWizardBrand,
  CarWizardForm,
} from "./carFormWizard.model";

type CarFormReviewStepProps = {
  form: CarWizardForm;
  brands: CarWizardBrand[];
  onEdit: (step: CarFormStep) => void;
};

function formatPrice(value?: number | null) {
  if (value === undefined || value === null) return "--";
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

function formatOptionalNumber(value?: string | number | null) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return undefined;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

export default function CarFormReviewStep({
  form,
  brands,
  onEdit,
}: CarFormReviewStepProps) {
  const brandName = brands.find(
    (brand) => brand._id === form.brandId,
  )?.name;
  const imageCount = (form.mainImage ? 1 : 0) + form.galleryImages.length;
  const currentOdometerKm = formatOptionalNumber(form.currentOdometerKm);
  const includedKmPerDay = formatOptionalNumber(form.includedKmPerDay);
  const includedKmPerHour = formatOptionalNumber(form.includedKmPerHour);

  return (
    <div className="car-review-step space-y-4">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
          <div className="group relative min-h-52 overflow-hidden bg-slate-100">
            {form.mainImage ? (
              <img
                src={form.mainImage}
                alt={`Ảnh chính của ${form.name || "xe"}`}
                className="car-review-hero-image h-full min-h-52 w-full object-cover"
              />
            ) : (
              <div className="flex min-h-52 items-center justify-center px-6 text-center text-sm font-bold text-slate-400">
                Chưa có ảnh chính
              </div>
            )}
            <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-extrabold text-white shadow-lg">
              <Images size={16} className="text-secondary" />
              {imageCount} ảnh xe
            </div>
          </div>

          <div className="flex flex-col justify-center bg-primary px-5 py-6 text-white sm:px-7">
            <div className="flex items-center gap-2 text-sm font-extrabold uppercase text-secondary">
              <BadgeCheck size={18} />
              Kiểm tra lần cuối
            </div>
            <h4 className="mt-3 text-2xl font-extrabold">
              {form.name || "Xe của bạn"}
            </h4>
            <p className="mt-1 text-sm font-bold text-slate-300">
              {[brandName, form.licensePlate].filter(Boolean).join(" • ")}
            </p>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-slate-200">
              Hãy xem lại hình ảnh và thông tin bên dưới trước khi gửi xe tới
              Admin kiểm duyệt.
            </p>
            <button
              type="button"
              onClick={() => onEdit(5)}
              className="mt-5 inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-extrabold text-primary transition hover:bg-secondaryDark"
            >
              <Images size={17} />
              Xem lại hình ảnh
            </button>
          </div>
        </div>
      </div>

      <CarReviewGroup title="Thông tin xe" step={1} onEdit={onEdit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <ReviewValue label="Tên xe" value={form.name} />
          <ReviewValue
            label="Hãng xe"
            value={brands.find((brand) => brand._id === form.brandId)?.name}
          />
          <ReviewValue label="Dòng xe" value={form.type} />
          <ReviewValue
            label="Biển số"
            value={form.licensePlate || "Chưa cập nhật"}
          />
          <ReviewValue label="Số ghế" value={`${form.seats} chỗ`} />
          <ReviewValue
            label="Nhiên liệu / Hộp số"
            value={`${getFuelTypeLabel(form.fuelType)} / ${getTransmissionLabel(
              form.transmission,
            )}`}
          />
        </div>
      </CarReviewGroup>

      <CarReviewGroup title="Bảng giá" step={2} onEdit={onEdit}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ReviewValue
            label="Thuê theo ngày"
            value={
              form.allowDailyRental
                ? formatPrice(form.basePricePerDay)
                : "Không áp dụng"
            }
          />
          <ReviewValue
            label="Phụ thu cuối tuần / ngày"
            value={
              form.allowDailyRental
                ? formatPrice(form.weekendSurchargePerDay)
                : "--"
            }
          />
          <ReviewValue
            label="Phụ thu ngày lễ / ngày"
            value={
              form.allowDailyRental
                ? formatPrice(form.holidaySurchargePerDay)
                : "--"
            }
          />
          <ReviewValue
            label="Thuê theo giờ"
            value={
              form.allowHourlyRental
                ? formatPrice(form.basePricePerHour)
                : "Không áp dụng"
            }
          />
          <ReviewValue
            label="Phụ thu cuối tuần / giờ"
            value={
              form.allowHourlyRental
                ? formatPrice(form.weekendSurchargePerHour)
                : "--"
            }
          />
          <ReviewValue
            label="Phụ thu ngày lễ / giờ"
            value={
              form.allowHourlyRental
                ? formatPrice(form.holidaySurchargePerHour)
                : "--"
            }
          />
        </div>
      </CarReviewGroup>

      <CarReviewGroup
        title="ODO và chính sách kilomet"
        step={3}
        onEdit={onEdit}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <ReviewValue
            label="ODO hiện tại"
            value={
              currentOdometerKm !== undefined
                ? `${new Intl.NumberFormat("vi-VN").format(
                    currentOdometerKm,
                  )} km`
                : "Chưa cập nhật"
            }
          />
          <ReviewValue
            label="Giới hạn ngày"
            value={
              form.allowDailyRental
                ? `${includedKmPerDay ?? "--"} km/ngày`
                : "Không áp dụng"
            }
          />
          <ReviewValue
            label="Giới hạn giờ"
            value={
              form.allowHourlyRental
                ? `${includedKmPerHour ?? "--"} km/giờ`
                : "Không áp dụng"
            }
          />
          <ReviewValue
            label="Phí vượt"
            value={`${formatPrice(Number(form.overageFeePerKm || 0))}/km`}
          />
          <ReviewValue
            label="Mức miễn"
            value={`${new Intl.NumberFormat("vi-VN").format(
              Number(form.graceKm || 0),
            )} km`}
          />
        </div>
      </CarReviewGroup>

      <CarReviewGroup title="Giao xe và địa điểm" step={4} onEdit={onEdit}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReviewValue
            label="Địa điểm nhận xe"
            value={formatPickupAddress({
              pickupAddress: form.pickupAddress,
              pickupFormattedAddress: form.pickupFormattedAddress,
              pickupProvince: form.city,
              pickupDistrict: form.district,
              pickupWard: form.ward,
            })}
          />
          <ReviewValue
            label="Giao xe tận nơi"
            value={form.deliveryEnabled ? "Có hỗ trợ" : "Không hỗ trợ"}
          />
          <ReviewValue
            label="Phí mở đầu / Đơn giá"
            value={
              form.deliveryEnabled
                ? `${formatPrice(Number(form.deliveryBaseFee || 0))} + ${formatPrice(
                    Number(form.deliveryFeePerKm || 0),
                  )}/km`
                : "--"
            }
          />
          <ReviewValue
            label="Phạm vi giao tối đa"
            value={
              form.deliveryEnabled
                ? `${form.deliveryMaxDistanceKm || "--"} km`
                : "--"
            }
          />
          <ReviewValue
            label="Ghi chú giao / nhận xe"
            value={
              [form.deliveryNote, form.locationNote]
                .filter(Boolean)
                .join(" • ") || "Chưa có ghi chú"
            }
          />
        </div>
      </CarReviewGroup>

      <CarReviewGroup title="Hình ảnh và mô tả" step={5} onEdit={onEdit}>
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ReviewValue
              label="Số lượng ảnh"
              value={`${form.mainImage ? 1 : 0} ảnh chính, ${form.galleryImages.length} ảnh phụ`}
            />
            <ReviewValue
              label="Hồ sơ cà vẹt"
              value={
                form.registrationCardImages.length > 0
                  ? `${form.registrationCardImages.length} ảnh`
                  : "Chưa bổ sung"
              }
            />
            <ReviewValue
              label="Mô tả"
              value={form.description || "Chưa có mô tả"}
            />
          </div>
          {form.galleryImages.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {form.galleryImages.map((image, index) => (
                <img
                  key={`${image.slice(0, 32)}-review-${index}`}
                  src={image}
                  alt={`Ảnh phụ ${index + 1}`}
                  className="h-20 w-28 rounded-lg border border-slate-200 object-cover transition duration-300 hover:-translate-y-1 hover:border-secondary hover:shadow-md"
                />
              ))}
            </div>
          )}
          {form.registrationCardImages.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="mb-2 text-xs font-extrabold uppercase text-slate-400">
                Ảnh cà vẹt gửi Admin kiểm duyệt
              </p>
              <div className="flex flex-wrap gap-2">
                {form.registrationCardImages.map((image, index) => (
                  <img
                    key={`${image.slice(0, 32)}-registration-review-${index}`}
                    src={image}
                    alt={`Ảnh cà vẹt ${index + 1}`}
                    className="h-24 w-36 rounded-lg border border-secondary/40 object-cover"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </CarReviewGroup>
    </div>
  );
}
