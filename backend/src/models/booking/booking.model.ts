import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  BOOKING_STATUS_VALUES,
  BookingStatusEnum,
  RentalModeEnum,
  PaymentOptionEnum,
  DeliveryTypeEnum,
  DeliveryAddressSourceEnum,
  PricingDateTypeEnum,
} from "../../constants/model.const";

export type IPricingBreakdownItem = {
  /** Ngày hoặc khung giờ tạo ra dòng giá. */
  dateOrTime: string;
  /** Phân loại ngày dùng để áp dụng bảng giá. */
  priceType: PricingDateTypeEnum;
  /** Đơn giá cơ sở của dòng. */
  basePrice: number;
  /** Tổng phụ thu của dòng. */
  surchargeAmount: number;
  /** Đơn giá sau khi cộng phụ thu. */
  finalPrice: number;
  /** Số đơn vị tính trong dòng. */
  unitCount: number;
  /** Thành tiền của dòng chi tiết. */
  price: number;
};

export type IPricingSnapshot = {
  /** Chế độ thuê được chốt tại thời điểm tạo booking. */
  rentalMode: string;
  /** Đơn giá cơ sở đã snapshot. */
  basePricePerUnit: number;
  /** Phụ thu cuối tuần đã snapshot. */
  weekendSurchargePerUnit: number;
  /** Phụ thu ngày lễ đã snapshot. */
  holidaySurchargePerUnit: number;
  /** Bảng phân rã giá theo ngày/giờ. */
  breakdown: IPricingBreakdownItem[];
  /** Subtotal tiền thuê trước phí nền tảng/bảo hiểm. */
  subtotal: number;

  /** Tỷ lệ tiền cọc/đặt trước được áp dụng. */
  rentalDepositRate?: number;
  /** Số tiền cọc theo chính sách tại thời điểm đặt. */
  rentalDepositAmount?: number;

  /** Tỷ lệ phí nền tảng đã chốt. */
  platformFeeRate?: number;
  /** Số tiền phí nền tảng đã chốt. */
  platformFee?: number;

  /** Phí bảo hiểm quy đổi theo ngày. */
  insuranceFeePerDay?: number;
  /** Số ngày tính bảo hiểm. */
  insuranceDays?: number;
  /** Tổng phí bảo hiểm. */
  insuranceFee?: number;

  /** Số tiền cần thu ngay theo lựa chọn thanh toán. */
  upfrontPaymentAmount?: number;
};

export type IHourlyRatePlanSnapshot = {
  /** Giá cơ sở mỗi giờ đã chốt. */
  basePricePerHour: number;
  /** Phụ thu cuối tuần mỗi giờ. */
  weekendSurchargePerHour: number;
  /** Phụ thu ngày lễ mỗi giờ. */
  holidaySurchargePerHour: number;
  /** Km bao gồm cho mỗi giờ. */
  includedKmPerHour?: number;
};

export type IDailyRatePlanSnapshot = {
  /** Giá cơ sở mỗi ngày đã chốt. */
  basePricePerDay: number;
  /** Phụ thu cuối tuần mỗi ngày. */
  weekendSurchargePerDay: number;
  /** Phụ thu ngày lễ mỗi ngày. */
  holidaySurchargePerDay: number;
  /** Km bao gồm cho mỗi ngày. */
  includedKmPerDay?: number;
};

export type IBookingRatePlanSnapshot = {
  /** Bảng giá theo giờ tại thời điểm booking. */
  hourly?: IHourlyRatePlanSnapshot;
  /** Bảng giá theo ngày tại thời điểm booking. */
  daily?: IDailyRatePlanSnapshot;
  /** Phí mỗi km vượt hạn mức. */
  overageFeePerKm?: number;
  /** Km miễn trừ trước khi tính vượt. */
  graceKm?: number;
};

export type IBookingMileagePolicySnapshot = {
  /** Chế độ thuê dùng để tính hạn mức km. */
  rentalMode: string;
  /** Tổng km bao gồm theo ngày. */
  includedKmPerDay?: number;
  /** Tổng km bao gồm theo giờ. */
  includedKmPerHour?: number;
  /** Đơn giá km vượt. */
  overageFeePerKm: number;
  /** Km ân hạn không tính phí. */
  graceKm: number;
  /** Số đơn vị dùng để nhân hạn mức. */
  billableUnits: number;
  /** Tổng km bao gồm của cả booking. */
  totalIncludedKm: number;
};

export type VehicleConditionChecklist = {
  /** Thân vỏ đạt yêu cầu. */
  bodyOk: boolean;
  /** Kính và gương đạt yêu cầu. */
  glassAndMirrorsOk: boolean;
  /** Đèn xe đạt yêu cầu. */
  lightsOk: boolean;
  /** Lốp xe đạt yêu cầu. */
  tiresOk: boolean;
  /** Nội thất sạch. */
  interiorClean: boolean;
  /** Ghế và dây an toàn đạt yêu cầu. */
  seatsAndSeatbeltsOk: boolean;
  /** Điều hòa hoạt động bình thường. */
  airConditioningOk: boolean;
  /** Không có cảnh báo bất thường trên táp-lô. */
  dashboardWarningFree: boolean;
};

export type VehicleAccessoriesSnapshot = {
  /** Có đủ chìa khóa xe. */
  vehicleKeysPresent: boolean;
  /** Có bộ vá/lốp dự phòng. */
  tireSupportKitPresent: boolean;
  /** Có bộ dụng cụ cơ bản. */
  basicToolkitPresent: boolean;
  /** Có tam giác cảnh báo. */
  warningTrianglePresent: boolean;
  /** Xe có áp dụng kiểm tra dây sạc hay không. */
  chargingCableApplicable: boolean;
  /** Dây sạc có mặt khi bàn giao/trả. */
  chargingCablePresent: boolean;
};

export type VehicleDocumentsSnapshot = {
  /** Có giấy đăng ký xe theo xe. */
  registrationPresent: boolean;
  /** Có giấy chứng nhận kiểm định. */
  inspectionCertificatePresent: boolean;
  /** Có giấy chứng nhận bảo hiểm. */
  insuranceCertificatePresent: boolean;
};

export type IBooking = BaseDocument & {
  /** Mã booking bất biến để người dùng tra cứu. */
  bookingCode?: string;
  /** User thuê xe. */
  userId: mongoose.Types.ObjectId;
  /** User chủ xe ký gửi. */
  ownerId: mongoose.Types.ObjectId;
  /** Xe được đặt. */
  carId: mongoose.Types.ObjectId;
  /** Giỏ hàng nguồn nếu booking tạo từ cart. */
  cartId?: mongoose.Types.ObjectId;
  /** Thời điểm bắt đầu thuê theo lịch đã chốt. */
  startDate: Date;
  /** Thời điểm kết thúc thuê theo lịch đã chốt. */
  endDate: Date;
  /** Thời điểm thực tế renter nhận xe. */
  actualPickupAt?: Date;
  /** Thời điểm thực tế chủ xe nhận lại xe. */
  actualReturnAt?: Date;
  /** Thời điểm booking hoàn tất cả điều kiện. */
  completedAt?: Date;
  /** Chế độ thuê theo giờ hoặc ngày. */
  rentalMode: string;
  /** Snapshot bảng giá theo giờ/ngày. */
  ratePlanSnapshot?: IBookingRatePlanSnapshot;
  /** Snapshot chuyển đổi gói thuê phát sinh khi gia hạn. */
  rentalPlanConversionSnapshot?: {
    /** Chế độ thuê ban đầu. */
    sourceRentalMode: string;
    /** Chế độ thuê sau chuyển đổi. */
    targetRentalMode: string;
    /** Thời điểm chuyển đổi có hiệu lực. */
    effectiveFrom: Date;
    /** Thời điểm hệ thống ghi nhận chuyển đổi. */
    convertedAt: Date;
    /** BookingExtension làm nguồn chuyển đổi. */
    extensionId: mongoose.Types.ObjectId;
  };
  /** Chính sách km được cố định cho booking, không lấy lại từ Car. */
  mileagePolicySnapshot?: IBookingMileagePolicySnapshot;
  /** Biên bản điện tử bàn giao và các xác nhận liên quan. */
  handoverSnapshot?: {
    /** Dữ liệu chuẩn bị xe trước giờ nhận. */
    preparation?: {
      /** ODO khi chủ xe chuẩn bị. */
      odometerKm: number;
      /** Mức nhiên liệu/pin khi chuẩn bị. */
      energyLevelPercent: number;
      /** Ảnh tổng quan lúc chuẩn bị. */
      images?: string[];
      /** Ảnh đồng hồ lúc chuẩn bị. */
      dashboardImage?: string;
      /** Ghi chú chuẩn bị xe. */
      note?: string;
      /** Thời điểm ghi nhận chuẩn bị. */
      recordedAt: Date;
      /** User ghi nhận chuẩn bị. */
      recordedBy: mongoose.Types.ObjectId;
    };
    /** ODO chính thức khi giao xe. */
    handoverOdometerKm: number;
    /** Mức nhiên liệu/pin chính thức khi giao. */
    handoverEnergyLevelPercent: number;
    /** Ảnh hiện trạng xe khi giao. */
    handoverPhotos?: string[];
    /** Ảnh đồng hồ khi giao xe. */
    handoverDashboardImage?: string;
    /** Ghi chú tình trạng khi giao. */
    handoverConditionNotes?: string;
    /** Checklist tình trạng xe lúc giao. */
    vehicleCondition?: VehicleConditionChecklist;
    /** Snapshot phụ kiện đi kèm lúc giao. */
    accessoriesSnapshot?: VehicleAccessoriesSnapshot;
    /** Snapshot giấy tờ đi kèm theo xe. */
    vehicleDocumentsSnapshot?: VehicleDocumentsSnapshot;
    /** Thời điểm chủ xe lập biên bản giao. */
    handoverRecordedAt: Date;
    /** User lập biên bản giao. */
    handoverRecordedBy: mongoose.Types.ObjectId;
    /** Thời điểm chủ xe xác nhận biên bản giao. */
    ownerConfirmedAt?: Date;
    /** User chủ xe xác nhận giao. */
    ownerConfirmedBy?: mongoose.Types.ObjectId;
    /** Thời điểm renter xác nhận đã nhận xe. */
    renterConfirmedAt?: Date;
    /** User renter xác nhận nhận xe. */
    renterConfirmedBy?: mongoose.Types.ObjectId;
  };
  /** Tổng tiền booking theo snapshot giá. */
  totalPrice: number;
  /** Snapshot chi tiết tiền thuê, phí nền tảng, bảo hiểm và giao xe. */
  pricingSnapshot?: IPricingSnapshot & {
    /** Subtotal tiền thuê. */
    rentalSubtotal?: number;
    /** Phí giao xe đã tính. */
    deliveryFee?: number;
    /** Tổng tiền sau các khoản phí. */
    totalPrice?: number;
    /** Snapshot thông tin giao xe tại thời điểm booking. */
    delivery?: {
      /** Hình thức giao/nhận xe. */
      deliveryType: string;
      /** Địa chỉ giao xe gốc. */
      deliveryAddress?: string;
      /** Địa chỉ người dùng nhập. */
      deliveryAddressText?: string;
      /** Địa chỉ đã chuẩn hóa. */
      deliveryFormattedAddress?: string;
      /** Nguồn địa chỉ được chọn. */
      deliveryAddressSource?: string;
      /** Vĩ độ điểm giao, lưu để tính phí/lịch sử. */
      deliveryLat?: number;
      /** Kinh độ điểm giao, lưu để tính phí/lịch sử. */
      deliveryLng?: number;
      /** Khoảng cách tính phí. */
      deliveryDistanceKm?: number;
      /** Thời lượng dự kiến theo routing. */
      deliveryDurationText?: string;
      /** Phí nền giao xe. */
      deliveryBaseFee?: number;
      /** Đơn giá giao theo km. */
      deliveryFeePerKm?: number;
      /** Khoảng cách giao tối đa được chấp nhận. */
      deliveryMaxDistanceKm?: number;
      /** Phí giao xe cuối cùng. */
      deliveryFee?: number;
      /** Ghi chú/điều kiện giao xe. */
      deliveryNote?: string;
    };
  };

  /** Phương thức thanh toán đã chọn (toàn bộ/đặt cọc...). */
  paymentOption: string;
  /** Số tiền phải thanh toán trước khi booking được xác nhận. */
  upfrontPaymentAmount: number;
  /** Số tiền còn lại sau khoản đã thu. */
  remainingAmount: number;
  /** Tổng tiền đã ghi nhận thanh toán thành công. */
  paidAmount: number;
  /** Cho biết khoản đặt cọc có được hoàn theo chính sách hay không. */
  isDepositRefundable: boolean;
  /** Snapshot chính sách hủy tại thời điểm tạo booking. */
  cancellationPolicySnapshot?: {
    /** Số phút đầu được hủy miễn phí. */
    freeCancellationMinutes: number;
    /** Quy tắc áp dụng khi hủy trễ. */
    lateCancellationRule: string;
    /** Tỷ lệ hoàn khi chủ xe hủy. */
    ownerCancellationRefundRate: number;
  };
  /** Địa chỉ nhận xe được chụp từ cấu hình xe/booking. */
  pickupAddressSnapshot?: string;
  /** Địa chỉ trả xe được chụp từ booking. */
  returnAddressSnapshot?: string;
  /** Thông tin liên hệ renter được chụp để hợp đồng không đổi theo User. */
  renterInfo?: {
    /** Tên renter tại thời điểm đặt. */
    fullName: string;
    /** Điện thoại renter tại thời điểm đặt. */
    phone: string;
    /** Email renter tại thời điểm đặt. */
    email: string;
    /** Ghi chú của renter cho booking. */
    note?: string;
  };
  /** Kết quả kiểm tra điều kiện renter tại lúc tạo booking. */
  renterEligibilitySnapshot?: {
    /** Trạng thái hoàn thiện hồ sơ tại lúc kiểm tra. */
    identityProfileCompleted: boolean;
    /** Trạng thái admin xác minh tại lúc kiểm tra. */
    identityVerificationStatus?: string;
    /** Hạng GPLX đã kiểm tra. */
    driverLicenseClass: "B" | "B1" | "B2";
    /** GPLX có phù hợp điều kiện xe hay không. */
    licenseEligible: boolean;
    /** Thời điểm kết quả eligibility được chụp. */
    checkedAt: Date;
  };

  /** Trạng thái vòng đời booking. */
  status: string;
  /** Thời điểm chủ xe duyệt booking. */
  ownerApprovedAt?: Date;
  /** Hạn thanh toán khoản bắt buộc. */
  paymentDeadlineAt?: Date;
  /** Lý do hủy dạng tổng quát. */
  cancelReason?: string;
  /** Thời điểm booking bị hủy. */
  cancelledAt?: Date;
  /** User thực hiện hủy. */
  cancelledBy?: mongoose.Types.ObjectId;
  /** Role của người thực hiện hủy. */
  cancelledByRole?: string;
  /** Mã lý do hủy để áp chính sách. */
  cancelReasonCode?: string;
  /** Nội dung lý do hủy hiển thị cho người dùng. */
  cancelReasonText?: string;
  /** Snapshot tiền và chính sách dùng để tạo refund. */
  cancellationSummary?: {
    /** Số tiền đã trả tại thời điểm hủy. */
    paidAmountAtCancellation: number;
    /** Phí hủy bị khấu trừ. */
    cancellationFee: number;
    /** Số tiền dự kiến phải hoàn. */
    refundAmount: number;
    /** Quy tắc chính sách đã áp dụng. */
    policyRuleApplied: string;
    /** Có phát sinh yêu cầu hoàn tiền hay không. */
    refundRequired: boolean;
    /** Refund record được tạo, nếu có. */
    refundId?: mongoose.Types.ObjectId;
  };
  /** Lý do đánh dấu no-show. */
  noShowReason?: string;
  /** Thời điểm đánh dấu no-show. */
  noShowAt?: Date;
  /** Thời điểm đã gửi nhắc trả xe. */
  returnReminderSentAt?: Date;
  /** Ghi chú tự do của booking. */
  note?: string;
  /** Xóa mềm booking, giữ toàn bộ lịch sử thanh toán/biên bản. */
  isDeleted?: boolean;
};

const hourlyRatePlanSnapshotSchema = new mongoose.Schema(
  {
    basePricePerHour: { type: Number, required: true, min: 1 },
    weekendSurchargePerHour: { type: Number, required: true, min: 0 },
    holidaySurchargePerHour: { type: Number, required: true, min: 0 },
    includedKmPerHour: { type: Number, min: 1 },
  },
  { _id: false },
);

const dailyRatePlanSnapshotSchema = new mongoose.Schema(
  {
    basePricePerDay: { type: Number, required: true, min: 1 },
    weekendSurchargePerDay: { type: Number, required: true, min: 0 },
    holidaySurchargePerDay: { type: Number, required: true, min: 0 },
    includedKmPerDay: { type: Number, min: 1 },
  },
  { _id: false },
);

const ratePlanSnapshotSchema = new mongoose.Schema(
  {
    hourly: { type: hourlyRatePlanSnapshotSchema },
    daily: { type: dailyRatePlanSnapshotSchema },
    overageFeePerKm: { type: Number, min: 0 },
    graceKm: { type: Number, min: 0 },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    bookingCode: {
      type: String,
      unique: true,
      sparse: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^BQD-BK-\d{6}$/,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Car",
      required: true,
    },
    cartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cart",
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    actualPickupAt: {
      type: Date,
      default: null,
    },
    actualReturnAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    rentalMode: {
      type: String,
      enum: Object.values(RentalModeEnum),
      required: true,
      default: RentalModeEnum.DAILY,
    },
    ratePlanSnapshot: {
      type: ratePlanSnapshotSchema,
      immutable: true,
      default: undefined,
    },
    rentalPlanConversionSnapshot: {
      sourceRentalMode: {
        type: String,
        enum: Object.values(RentalModeEnum),
      },
      targetRentalMode: {
        type: String,
        enum: Object.values(RentalModeEnum),
      },
      effectiveFrom: { type: Date },
      convertedAt: { type: Date },
      extensionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BookingExtension",
      },
    },
    mileagePolicySnapshot: {
      rentalMode: {
        type: String,
        enum: Object.values(RentalModeEnum),
      },
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
      billableUnits: {
        type: Number,
        min: 1,
      },
      totalIncludedKm: {
        type: Number,
        min: 0,
      },
    },
    handoverSnapshot: {
      preparation: {
        odometerKm: {
          type: Number,
          min: 0,
        },
        energyLevelPercent: {
          type: Number,
          min: 0,
          max: 100,
        },
        images: [{ type: String, trim: true }],
        dashboardImage: {
          type: String,
          trim: true,
        },
        note: {
          type: String,
          trim: true,
          maxlength: 1000,
        },
        recordedAt: { type: Date },
        recordedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
      handoverOdometerKm: {
        type: Number,
        min: 0,
        validate: {
          validator: (value: number | undefined) =>
            value === undefined || Number.isInteger(value),
          message: "ODO bàn giao phải là số nguyên không âm",
        },
      },
      handoverEnergyLevelPercent: {
        type: Number,
        min: 0,
        max: 100,
      },
      handoverDashboardImage: {
        type: String,
        trim: true,
      },
      handoverPhotos: [{ type: String, trim: true }],
      handoverConditionNotes: {
        type: String,
        trim: true,
        maxlength: 1000,
      },
      vehicleCondition: {
        bodyOk: { type: Boolean },
        glassAndMirrorsOk: { type: Boolean },
        lightsOk: { type: Boolean },
        tiresOk: { type: Boolean },
        interiorClean: { type: Boolean },
        seatsAndSeatbeltsOk: { type: Boolean },
        airConditioningOk: { type: Boolean },
        dashboardWarningFree: { type: Boolean },
      },
      accessoriesSnapshot: {
        vehicleKeysPresent: { type: Boolean },
        tireSupportKitPresent: { type: Boolean },
        basicToolkitPresent: { type: Boolean },
        warningTrianglePresent: { type: Boolean },
        chargingCableApplicable: { type: Boolean },
        chargingCablePresent: { type: Boolean },
      },
      vehicleDocumentsSnapshot: {
        registrationPresent: { type: Boolean },
        inspectionCertificatePresent: { type: Boolean },
        insuranceCertificatePresent: { type: Boolean },
      },
      handoverRecordedAt: {
        type: Date,
      },
      handoverRecordedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      ownerConfirmedAt: { type: Date },
      ownerConfirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      renterConfirmedAt: { type: Date },
      renterConfirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    pricingSnapshot: {
      rentalMode: {
        type: String,
        enum: Object.values(RentalModeEnum),
      },
      basePricePerUnit: {
        type: Number,
        required: true,
        min: 0,
      },
      weekendSurchargePerUnit: {
        type: Number,
        required: true,
        min: 0,
      },
      holidaySurchargePerUnit: {
        type: Number,
        required: true,
        min: 0,
      },
      breakdown: [
        {
          dateOrTime: {
            type: String,
            required: true,
            trim: true,
          },
          priceType: {
            type: String,
            enum: Object.values(PricingDateTypeEnum),
            required: true,
          },
          basePrice: {
            type: Number,
            required: true,
            min: 0,
          },
          surchargeAmount: {
            type: Number,
            required: true,
            min: 0,
          },
          finalPrice: {
            type: Number,
            required: true,
            min: 0,
          },
          unitCount: {
            type: Number,
            required: true,
            min: 0,
          },
          price: {
            type: Number,
            required: true,
            min: 0,
          },
        },
      ],
      subtotal: {
        type: Number,
        required: true,
        min: 0,
      },
      rentalDepositRate: {
        type: Number,
        min: 0,
        max: 1,
      },

      rentalDepositAmount: {
        type: Number,
        min: 0,
      },

      platformFeeRate: {
        type: Number,
        min: 0,
        max: 1,
      },

      platformFee: {
        type: Number,
        min: 0,
      },

      insuranceFeePerDay: {
        type: Number,
        min: 0,
      },

      insuranceDays: {
        type: Number,
        min: 0,
      },

      insuranceFee: {
        type: Number,
        min: 0,
      },

      upfrontPaymentAmount: {
        type: Number,
        min: 0,
      },
      rentalSubtotal: {
        type: Number,
        min: 0,
      },
      deliveryFee: {
        type: Number,
        min: 0,
        default: 0,
      },
      totalPrice: {
        type: Number,
        min: 0,
      },
      delivery: {
        deliveryType: {
          type: String,
          enum: Object.values(DeliveryTypeEnum),
          default: DeliveryTypeEnum.PICKUP_AT_CAR_LOCATION,
        },
        deliveryAddress: {
          type: String,
          trim: true,
        },
        deliveryAddressText: {
          type: String,
          trim: true,
        },
        deliveryFormattedAddress: {
          type: String,
          trim: true,
        },
        deliveryAddressSource: {
          type: String,
          enum: Object.values(DeliveryAddressSourceEnum),
        },
        deliveryLat: {
          type: Number,
        },
        deliveryLng: {
          type: Number,
        },
        deliveryDistanceKm: {
          type: Number,
          min: 0,
        },
        deliveryDurationText: {
          type: String,
          trim: true,
        },
        deliveryBaseFee: {
          type: Number,
          min: 0,
        },
        deliveryFeePerKm: {
          type: Number,
          min: 0,
        },
        deliveryMaxDistanceKm: {
          type: Number,
          min: 0,
        },
        deliveryFee: {
          type: Number,
          min: 0,
          default: 0,
        },
        deliveryNote: {
          type: String,
          trim: true,
        },
      },
    },

    paymentOption: {
      type: String,
      enum: Object.values(PaymentOptionEnum),
      default: PaymentOptionEnum.DEPOSIT,
    },
    upfrontPaymentAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isDepositRefundable: {
      type: Boolean,
      default: true,
    },
    cancellationPolicySnapshot: {
      freeCancellationMinutes: {
        type: Number,
        default: 60,
        min: 0,
      },
      lateCancellationRule: {
        type: String,
        default: "KEEP_RENTAL_DEPOSIT_AND_PLATFORM_FEE",
        trim: true,
      },
      ownerCancellationRefundRate: {
        type: Number,
        default: 1,
        min: 0,
        max: 1,
      },
    },
    pickupAddressSnapshot: {
      type: String,
      trim: true,
    },
    returnAddressSnapshot: {
      type: String,
      trim: true,
    },
    renterInfo: {
      fullName: {
        type: String,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
      note: {
        type: String,
        trim: true,
      },
    },

    renterEligibilitySnapshot: {
      identityProfileCompleted: {
        type: Boolean,
        required: true,
      },
      // Optional để booking cũ vẫn đọc và xử lý bình thường.
      identityVerificationStatus: {
        type: String,
        enum: ["INCOMPLETE", "PENDING", "VERIFIED", "REJECTED"],
      },
      driverLicenseClass: {
        type: String,
        enum: ["B", "B1", "B2"],
        required: true,
      },
      licenseEligible: {
        type: Boolean,
        required: true,
      },
      checkedAt: {
        type: Date,
        required: true,
      },
    },

    status: {
      type: String,
      enum: BOOKING_STATUS_VALUES,
      default: BookingStatusEnum.REQUESTED,
    },
    ownerApprovedAt: {
      type: Date,
    },
    paymentDeadlineAt: {
      type: Date,
    },
    cancelReason: {
      type: String,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancelledByRole: {
      type: String,
      trim: true,
    },
    cancelReasonCode: {
      type: String,
      trim: true,
    },
    cancelReasonText: {
      type: String,
      trim: true,
    },
    cancellationSummary: {
      paidAmountAtCancellation: {
        type: Number,
        min: 0,
        default: 0,
      },
      cancellationFee: {
        type: Number,
        min: 0,
        default: 0,
      },
      refundAmount: {
        type: Number,
        min: 0,
        default: 0,
      },
      policyRuleApplied: {
        type: String,
        trim: true,
      },
      refundRequired: {
        type: Boolean,
        default: false,
      },
      refundId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Refund",
      },
    },
    noShowReason: {
      type: String,
    },
    noShowAt: {
      type: Date,
    },
    returnReminderSentAt: {
      type: Date,
    },
    note: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

bookingSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
bookingSchema.index({
  carId: 1,
  status: 1,
  startDate: 1,
  endDate: 1,
  isDeleted: 1,
});
bookingSchema.index({
  ownerId: 1,
  isDeleted: 1,
  createdAt: -1,
});
bookingSchema.index({
  carId: 1,
  status: 1,
  completedAt: -1,
  isDeleted: 1,
});

const BookingModel = mongoose.model<IBooking>("Booking", bookingSchema);

export { BookingModel };
