import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";

import {
  CAR_STATUS_VALUES,
  CarStatusEnum,
  CarTypeEnum,
  FuelTypeEnum,
  TransmissionEnum,
  RentalUnitEnum,
  UserRoleEnum,
} from "../../constants/model.const";

export type ICarPricing = {
  /** Giá thuê theo ngày trước phụ thu. */
  basePricePerDay?: number;
  /** Phụ thu cuối tuần theo ngày. */
  weekendSurchargePerDay: number;
  /** Phụ thu ngày lễ theo ngày. */
  holidaySurchargePerDay: number;
  /** Giá thuê theo giờ trước phụ thu. */
  basePricePerHour?: number;
  /** Phụ thu cuối tuần theo giờ. */
  weekendSurchargePerHour?: number;
  /** Phụ thu ngày lễ theo giờ. */
  holidaySurchargePerHour?: number;
};

export type ICarApprovalChange = {
  /** Tên field xe thay đổi trong lần gửi duyệt. */
  field: string;
  /** Nhãn thân thiện dùng trong lịch sử kiểm duyệt. */
  label: string;
  /** Giá trị trước khi chỉnh sửa. */
  previousValue?: unknown;
  /** Giá trị mới gửi admin duyệt. */
  currentValue?: unknown;
};

export type ICarApprovalSubmission = {
  /** Loại gửi: tạo mới, cập nhật hoặc gửi lại sau từ chối. */
  submissionType: "CREATE" | "UPDATE" | "RESUBMIT";
  /** Thời điểm User gửi hồ sơ xe. */
  submittedAt: Date;
  /** User/admin thực hiện gửi hồ sơ. */
  submittedBy?: mongoose.Types.ObjectId;
  /** Vai trò của người gửi hồ sơ. */
  submittedByRole: UserRoleEnum;
  /** Các thay đổi cần admin xem xét. */
  changes: ICarApprovalChange[];
};

export type ICar = BaseDocument & {
  /** Mã xe hiển thị và tra cứu ổn định. */
  carCode?: string;
  /** User chủ xe ký gửi, không phải role BUSINESS. */
  ownerId: mongoose.Types.ObjectId;
  /** Thương hiệu tham chiếu đến Brand. */
  brandId: mongoose.Types.ObjectId;
  /** Tên/model xe hiển thị trên marketplace. */
  name: string;
  /** Phân loại xe. */
  type: string;
  /** Biển số xe; dữ liệu nhạy cảm tương đối khi hiển thị công khai. */
  licensePlate?: string;
  /** Biển số chuẩn hóa để tìm kiếm/chống trùng. */
  plateNumberNormalized?: string;
  /** Cấu hình giá thuê và các phụ thu. */
  pricing: ICarPricing;
  /** Xe có cho thuê theo ngày không. */
  allowDailyRental?: boolean;
  /** Xe có cho thuê theo giờ không. */
  allowHourlyRental?: boolean;
  /** Đơn vị giá chính của xe. */
  rentalUnit: string;
  /** Số chỗ ngồi. */
  seats: number;
  /** ODO hiện tại được cập nhật sau bàn giao/trả xe. */
  currentOdometerKm?: number | null;
  /** Chính sách km bao gồm và phí vượt km. */
  mileagePolicy?: {
    /** Số km bao gồm cho mỗi ngày. */
    includedKmPerDay?: number;
    /** Số km bao gồm cho mỗi giờ. */
    includedKmPerHour?: number;
    /** Phí tính cho mỗi km vượt. */
    overageFeePerKm: number;
    /** Số km miễn trừ trước khi tính vượt. */
    graceKm: number;
  };
  /** Loại nhiên liệu/năng lượng của xe. */
  fuelType?: string;
  /** Kiểu hộp số. */
  transmission?: string;
  /** Ảnh xe dùng trên trang công khai. */
  images?: string[];
  /** Ảnh giấy đăng ký xe phục vụ kiểm duyệt. */
  registrationCardImages?: string[];
  /** Mô tả tiện ích và tình trạng xe. */
  description?: string;
  /** Địa chỉ nhận xe dạng gốc. */
  pickupAddress?: string;
  /** Địa chỉ nhận xe đã định dạng. */
  pickupFormattedAddress?: string;
  /** Place ID từ bộ mã hóa địa điểm, nếu có. */
  pickupPlaceId?: string;
  /** Vĩ độ điểm nhận xe; có thể bị ẩn theo policy privacy. */
  pickupLat?: number;
  /** Kinh độ điểm nhận xe; có thể bị ẩn theo policy privacy. */
  pickupLng?: number;
  /** Tỉnh/thành của điểm nhận xe. */
  pickupProvince?: string;
  /** Quận/huyện của điểm nhận xe. */
  pickupDistrict?: string;
  /** Phường/xã của điểm nhận xe. */
  pickupWard?: string;
  /** Ghi chú hướng dẫn nhận xe. */
  pickupNote?: string;
  /** Chuỗi vị trí thân thiện cho giao diện. */
  pickupLocationText?: string;
  /** Địa chỉ legacy của xe. */
  address?: string;
  /** Tỉnh/thành legacy của xe. */
  province?: string;
  /** Thành phố legacy của xe. */
  city?: string;
  /** Quận/huyện legacy của xe. */
  district?: string;
  /** Phường/xã legacy của xe. */
  ward?: string;
  /** Ghi chú vị trí legacy. */
  locationNote?: string;
  /** Vĩ độ vị trí chính xác, chỉ trả khi đủ điều kiện. */
  latitude?: number;
  /** Kinh độ vị trí chính xác, chỉ trả khi đủ điều kiện. */
  longitude?: number;
  /** Lần cuối vị trí chính xác được cập nhật. */
  lastLocationUpdatedAt?: Date;
  /** User/admin cập nhật vị trí gần nhất. */
  lastLocationUpdatedBy?: mongoose.Types.ObjectId;
  /** Vai trò người cập nhật vị trí. */
  lastLocationUpdatedByRole?: UserRoleEnum;
  /** Số lần cập nhật vị trí để audit. */
  locationUpdateCount?: number;
  /** Lịch sử thay đổi vị trí, phục vụ audit và không dùng để công khai. */
  locationHistory?: Array<{
    /** Vĩ độ cũ. */
    oldLat?: number;
    /** Kinh độ cũ. */
    oldLng?: number;
    /** Vĩ độ mới. */
    newLat: number;
    /** Kinh độ mới. */
    newLng: number;
    /** Địa chỉ cũ. */
    oldAddress?: string;
    /** Địa chỉ mới. */
    newAddress?: string;
    /** User/admin cập nhật. */
    updatedBy: mongoose.Types.ObjectId;
    /** Vai trò người cập nhật. */
    updatedByRole: UserRoleEnum;
    /** Thời điểm cập nhật. */
    updatedAt: Date;
  }>;
  /** Cho phép cung cấp dịch vụ giao xe. */
  deliveryEnabled?: boolean;
  /** Phí giao xe cố định ban đầu. */
  deliveryBaseFee?: number;
  /** Phí giao theo mỗi km. */
  deliveryFeePerKm?: number;
  /** Khoảng cách giao xe tối đa. */
  deliveryMaxDistanceKm?: number;
  /** Ghi chú điều kiện giao xe. */
  deliveryNote?: string;
  /** Phiên bản dữ liệu dùng chống cập nhật booking cạnh tranh. */
  bookingRevision?: number;
  /** Snapshot lần gửi duyệt xe gần nhất. */
  approvalSubmission?: ICarApprovalSubmission;
  /** Trạng thái nghiệp vụ/kiểm duyệt của xe. */
  status: string;
  /** Lý do admin từ chối xe. */
  rejectReason?: string;
  /** Cờ ẩn xe khỏi danh sách. */
  isHidden?: boolean;
  /** Xe bị chủ xe chủ động ẩn. */
  hiddenByOwner?: boolean;
  /** Xe bị admin ẩn do kiểm duyệt hoặc vi phạm. */
  hiddenByAdmin?: boolean;
  /** Xóa mềm xe, giữ lại booking lịch sử. */
  isDeleted?: boolean;
};

const carSchema = new mongoose.Schema(
  {
    carCode: {
      type: String,
      unique: true,
      sparse: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(CarTypeEnum),
      required: true,
    },
    licensePlate: {
      type: String,
      trim: true,
    },
    plateNumberNormalized: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    pricing: {
      basePricePerDay: {
        type: Number,
        min: 1,
      },
      weekendSurchargePerDay: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
      holidaySurchargePerDay: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
      basePricePerHour: {
        type: Number,
        min: 1,
      },
      weekendSurchargePerHour: {
        type: Number,
        min: 0,
        default: 0,
      },
      holidaySurchargePerHour: {
        type: Number,
        min: 0,
        default: 0,
      },
    },
    allowDailyRental: {
      type: Boolean,
      default: true,
    },
    allowHourlyRental: {
      type: Boolean,
      default: false,
    },
    rentalUnit: {
      type: String,
      enum: Object.values(RentalUnitEnum),
      default: RentalUnitEnum.DAY,
    },
    seats: {
      type: Number,
      required: true,
      min: 1,
    },
    currentOdometerKm: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: (value: number | null | undefined) =>
          value === null || value === undefined || Number.isInteger(value),
        message: "ODO hiện tại phải là số nguyên không âm",
      },
    },
    mileagePolicy: {
      includedKmPerDay: {
        type: Number,
        min: 1,
      },
      includedKmPerHour: {
        type: Number,
        min: 1,
      },
      overageFeePerKm: {
        type: Number,
        min: 0,
      },
      graceKm: {
        type: Number,
        min: 0,
      },
    },
    fuelType: {
      type: String,
      enum: Object.values(FuelTypeEnum),
    },
    transmission: {
      type: String,
      enum: Object.values(TransmissionEnum),
    },
    images: [
      {
        type: String,
      },
    ],
    registrationCardImages: [
      {
        type: String,
      },
    ],
    description: {
      type: String,
    },
    pickupAddress: {
      type: String,
      trim: true,
    },
    pickupFormattedAddress: {
      type: String,
      trim: true,
    },
    pickupPlaceId: {
      type: String,
      trim: true,
    },
    pickupLat: {
      type: Number,
    },
    pickupLng: {
      type: Number,
    },
    pickupProvince: {
      type: String,
      trim: true,
    },
    pickupDistrict: {
      type: String,
      trim: true,
    },
    pickupWard: {
      type: String,
      trim: true,
    },
    pickupNote: {
      type: String,
      trim: true,
    },
    pickupLocationText: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    province: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    district: {
      type: String,
      trim: true,
    },
    ward: {
      type: String,
      trim: true,
    },
    locationNote: {
      type: String,
      trim: true,
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    lastLocationUpdatedAt: {
      type: Date,
    },
    lastLocationUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastLocationUpdatedByRole: {
      type: String,
  enum: [
    UserRoleEnum.ADMIN,
    UserRoleEnum.USER,
  ],

    },
    locationUpdateCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    locationHistory: [
      {
        oldLat: {
          type: Number,
        },
        oldLng: {
          type: Number,
        },
        newLat: {
          type: Number,
          required: true,
        },
        newLng: {
          type: Number,
          required: true,
        },
        oldAddress: {
          type: String,
          trim: true,
        },
        newAddress: {
          type: String,
          trim: true,
        },
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        updatedByRole: {
          type: String,
           enum: [
    UserRoleEnum.ADMIN,
    UserRoleEnum.USER,
  ],

          required: true,
        },
        updatedAt: {
          type: Date,
          required: true,
        },
      },
    ],
    deliveryEnabled: {
      type: Boolean,
      default: false,
    },
    deliveryBaseFee: {
      type: Number,
      min: 0,
      default: 0,
    },
    deliveryFeePerKm: {
      type: Number,
      min: 0,
      default: 0,
    },
    deliveryMaxDistanceKm: {
      type: Number,
      min: 0,
    },
    deliveryNote: {
      type: String,
      trim: true,
    },
    bookingRevision: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
    approvalSubmission: {
      submissionType: {
        type: String,
        enum: ["CREATE", "UPDATE", "RESUBMIT"],
      },
      submittedAt: {
        type: Date,
      },
      submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
     submittedByRole: {
  type: String,
  enum: [
    UserRoleEnum.ADMIN,
    UserRoleEnum.USER,
  ],
},
      changes: [
        {
          field: {
            type: String,
            required: true,
          },
          label: {
            type: String,
            required: true,
          },
          previousValue: {
            type: mongoose.Schema.Types.Mixed,
          },
          currentValue: {
            type: mongoose.Schema.Types.Mixed,
          },
        },
      ],
    },
    status: {
      type: String,
      enum: CAR_STATUS_VALUES,
      default: CarStatusEnum.PENDING,
    },
    rejectReason: {
      type: String,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    hiddenByOwner: {
      type: Boolean,
      default: false,
    },
    hiddenByAdmin: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

carSchema.index({ status: 1, isDeleted: 1, isHidden: 1, createdAt: -1 });
carSchema.index({ brandId: 1, status: 1, isDeleted: 1 });
carSchema.index({
  ownerId: 1,
  isDeleted: 1,
  createdAt: -1,
});

const CarModel = mongoose.model<ICar>("Car", carSchema);

export { CarModel };
