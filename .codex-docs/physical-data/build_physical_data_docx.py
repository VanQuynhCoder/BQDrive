from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


@dataclass(frozen=True)
class Field:
    name: str
    data_type: str
    key: bool = False
    unique: bool = False
    mandatory: bool = False
    description: str = ""


def f(
    name: str,
    data_type: str,
    description: str,
    *,
    key: bool = False,
    unique: bool = False,
    mandatory: bool = False,
) -> Field:
    return Field(name, data_type, key, unique, mandatory, description)


COMMON_FIELDS = [
    f("_id", "ObjectId", "Mã định danh do MongoDB sinh", key=True, unique=True, mandatory=True),
]

TIMESTAMP_FIELDS = [
    f("createdAt", "Date", "Thời điểm tạo bản ghi"),
    f("updatedAt", "Date", "Thời điểm cập nhật gần nhất"),
]


SCHEMAS: list[tuple[str, list[Field]]] = [
    (
        "users",
        COMMON_FIELDS
        + [
            f("name", "String", "Họ tên người dùng", mandatory=True),
            f("email", "String", "Email đăng nhập, được chuẩn hóa chữ thường", unique=True, mandatory=True),
            f("password", "String", "Mật khẩu đã mã hóa", mandatory=True),
            f("phone", "String", "Số điện thoại"),
            f("address", "String", "Địa chỉ chi tiết"),
            f("province", "String", "Tỉnh/thành phố"),
            f("city", "String", "Thành phố"),
            f("district", "String", "Quận/huyện"),
            f("ward", "String", "Phường/xã"),
            f("avatar", "String", "Đường dẫn ảnh đại diện"),
            f("bio", "String", "Thông tin giới thiệu"),
            f("role", "String (enum)", "Vai trò: ADMIN, BUSINESS hoặc USER"),
            f("isBlocked", "Boolean", "Đánh dấu tài khoản bị khóa"),
            f("blockedReason", "String", "Lý do khóa tài khoản"),
            f("blockedAt", "Date", "Thời điểm khóa tài khoản"),
            f("blockedBy", "ObjectId", "Người quản trị thực hiện khóa; tham chiếu users"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
            f("deletedReason", "String", "Lý do xóa tài khoản"),
            f("deletedAt", "Date", "Thời điểm xóa"),
            f("deletedBy", "ObjectId", "Người thực hiện xóa; tham chiếu users"),
            f("isVerified", "Boolean", "Trạng thái xác thực tài khoản"),
            f("otpCode", "String", "Mã OTP xác thực"),
            f("otpExpireAt", "Date", "Thời điểm hết hạn OTP"),
            f("resetPasswordOtpHash", "String", "Giá trị băm OTP đặt lại mật khẩu"),
            f("resetPasswordOtpExpiresAt", "Date", "Thời điểm OTP đặt lại mật khẩu hết hạn"),
            f("resetPasswordOtpVerified", "Boolean", "Trạng thái xác minh OTP đặt lại mật khẩu"),
            f("resetPasswordOtpVerifiedAt", "Date", "Thời điểm xác minh OTP"),
            f("resetPasswordOtpAttempts", "Number", "Số lần nhập OTP đặt lại mật khẩu"),
            f("resetPasswordTokenHash", "String", "Giá trị băm token đặt lại mật khẩu"),
            f("resetPasswordTokenExpiresAt", "Date", "Thời điểm token đặt lại mật khẩu hết hạn"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "businesses",
        COMMON_FIELDS
        + [
            f("userId", "ObjectId", "Tài khoản đại diện doanh nghiệp; tham chiếu users", mandatory=True),
            f("businessName", "String", "Tên đơn vị kinh doanh", mandatory=True),
            f("businessType", "String (enum)", "Loại chủ xe: COMPANY hoặc INDIVIDUAL", mandatory=True),
            f("isRejected", "Boolean", "Trạng thái hồ sơ bị từ chối"),
            f("rejectReason", "String", "Lý do từ chối hồ sơ"),
            f("phone", "String", "Số điện thoại liên hệ"),
            f("address", "String", "Địa chỉ chi tiết"),
            f("province", "String", "Tỉnh/thành phố"),
            f("city", "String", "Thành phố"),
            f("district", "String", "Quận/huyện"),
            f("ward", "String", "Phường/xã"),
            f("description", "String", "Mô tả doanh nghiệp"),
            f("logo", "String", "Đường dẫn logo"),
            f("publicEmail", "String", "Email công khai"),
            f("publicPhone", "String", "Số điện thoại công khai"),
            f("website", "String", "Website doanh nghiệp"),
            f("shortDescription", "String", "Mô tả ngắn hiển thị công khai"),
            f("isPublicPartner", "Boolean", "Cho phép hiển thị trong danh sách đối tác"),
            f("displayOrder", "Number", "Thứ tự hiển thị"),
            f("isApproved", "Boolean", "Trạng thái được quản trị viên phê duyệt"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "brands",
        COMMON_FIELDS
        + [
            f("name", "String", "Tên hãng xe", unique=True, mandatory=True),
            f("logo", "String", "Đường dẫn logo hãng xe"),
            f("description", "String", "Mô tả hãng xe"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "cars",
        COMMON_FIELDS
        + [
            f("businessId", "ObjectId", "Doanh nghiệp sở hữu theo mô hình dữ liệu cũ; tham chiếu businesses"),
            f("ownerId", "ObjectId", "Chủ xe; tham chiếu users hoặc businesses theo ownerModel", mandatory=True),
            f("ownerType", "String (enum)", "Loại chủ xe: BUSINESS hoặc USER", mandatory=True),
            f("ownerModel", "String (enum)", "Tên model tham chiếu động: User hoặc Business", mandatory=True),
            f("brandId", "ObjectId", "Hãng xe; tham chiếu brands", mandatory=True),
            f("name", "String", "Tên xe", mandatory=True),
            f("type", "String (enum)", "Loại xe: SUV, SEDAN, HATCHBACK, PICKUP, MPV, COUPE, CONVERTIBLE hoặc ELECTRIC", mandatory=True),
            f("licensePlate", "String", "Biển số xe"),
            f("plateNumberNormalized", "String", "Biển số đã chuẩn hóa để tìm kiếm/kiểm tra trùng"),
            f("pricePerDay", "Number", "Giá thuê cơ bản theo ngày, không âm"),
            f("pricePerHour", "Number", "Giá thuê cơ bản theo giờ, không âm"),
            f("pricing", "Object", "Cấu hình giá theo ngày thường, cuối tuần và ngày lễ"),
            f("pricing.weekdayPricePerDay", "Number", "Giá thuê ngày thường"),
            f("pricing.weekendPricePerDay", "Number", "Giá thuê cuối tuần"),
            f("pricing.holidayPricePerDay", "Number", "Giá thuê ngày lễ"),
            f("pricing.pricePerHour", "Number", "Giá thuê giờ ngày thường"),
            f("pricing.weekendPricePerHour", "Number", "Giá thuê giờ cuối tuần"),
            f("pricing.holidayPricePerHour", "Number", "Giá thuê giờ ngày lễ"),
            f("allowDailyRental", "Boolean", "Cho phép thuê theo ngày"),
            f("allowHourlyRental", "Boolean", "Cho phép thuê theo giờ"),
            f("rentalUnit", "String (enum)", "Đơn vị thuê mặc định: DAY hoặc HOUR"),
            f("seats", "Number", "Số chỗ ngồi, tối thiểu 1", mandatory=True),
            f("fuelType", "String (enum)", "Nhiên liệu: GASOLINE, DIESEL, ELECTRIC hoặc HYBRID"),
            f("transmission", "String (enum)", "Hộp số: AUTOMATIC hoặc MANUAL"),
            f("images", "Array<String>", "Danh sách đường dẫn hình ảnh xe"),
            f("description", "String", "Mô tả xe"),
            f("pickupAddress", "String", "Địa chỉ nhận xe"),
            f("pickupFormattedAddress", "String", "Địa chỉ nhận xe đã định dạng"),
            f("pickupPlaceId", "String", "Mã địa điểm từ dịch vụ bản đồ"),
            f("pickupLat", "Number", "Vĩ độ điểm nhận xe"),
            f("pickupLng", "Number", "Kinh độ điểm nhận xe"),
            f("pickupProvince", "String", "Tỉnh/thành điểm nhận xe"),
            f("pickupDistrict", "String", "Quận/huyện điểm nhận xe"),
            f("pickupWard", "String", "Phường/xã điểm nhận xe"),
            f("pickupNote", "String", "Ghi chú điểm nhận xe"),
            f("pickupLocationText", "String", "Chuỗi vị trí nhận xe hiển thị"),
            f("address", "String", "Địa chỉ xe theo cấu trúc cũ"),
            f("province", "String", "Tỉnh/thành theo cấu trúc cũ"),
            f("city", "String", "Thành phố theo cấu trúc cũ"),
            f("district", "String", "Quận/huyện theo cấu trúc cũ"),
            f("ward", "String", "Phường/xã theo cấu trúc cũ"),
            f("locationNote", "String", "Ghi chú vị trí"),
            f("latitude", "Number", "Vĩ độ hiện tại"),
            f("longitude", "Number", "Kinh độ hiện tại"),
            f("lastLocationUpdatedAt", "Date", "Thời điểm cập nhật vị trí gần nhất"),
            f("lastLocationUpdatedBy", "ObjectId", "Người cập nhật vị trí; tham chiếu users"),
            f("lastLocationUpdatedByRole", "String (enum)", "Vai trò người cập nhật: BUSINESS hoặc USER"),
            f("locationUpdateCount", "Number", "Số lần cập nhật vị trí"),
            f("locationHistory", "Array<Object>", "Lịch sử thay đổi vị trí"),
            f("locationHistory[].oldLat", "Number", "Vĩ độ cũ"),
            f("locationHistory[].oldLng", "Number", "Kinh độ cũ"),
            f("locationHistory[].newLat", "Number", "Vĩ độ mới trong phần tử lịch sử", mandatory=True),
            f("locationHistory[].newLng", "Number", "Kinh độ mới trong phần tử lịch sử", mandatory=True),
            f("locationHistory[].oldAddress", "String", "Địa chỉ cũ"),
            f("locationHistory[].newAddress", "String", "Địa chỉ mới"),
            f("locationHistory[].updatedBy", "ObjectId", "Người cập nhật; tham chiếu users", mandatory=True),
            f("locationHistory[].updatedByRole", "String (enum)", "Vai trò người cập nhật", mandatory=True),
            f("locationHistory[].updatedAt", "Date", "Thời điểm cập nhật", mandatory=True),
            f("deliveryEnabled", "Boolean", "Cho phép giao xe đến khách hàng"),
            f("deliveryBaseFee", "Number", "Phí giao xe cơ bản"),
            f("deliveryFeePerKm", "Number", "Phí giao xe theo ki-lô-mét"),
            f("deliveryMaxDistanceKm", "Number", "Khoảng cách giao xe tối đa"),
            f("deliveryNote", "String", "Ghi chú dịch vụ giao xe"),
            f("bookingRevision", "Number", "Phiên bản thay đổi phục vụ kiểm soát booking"),
            f("status", "String (enum)", "Trạng thái: PENDING, APPROVED, RENTED, REJECTED hoặc HIDDEN"),
            f("rejectReason", "String", "Lý do từ chối xe"),
            f("isHidden", "Boolean", "Trạng thái ẩn tổng hợp"),
            f("hiddenByOwner", "Boolean", "Xe bị ẩn bởi chủ xe"),
            f("hiddenByAdmin", "Boolean", "Xe bị ẩn bởi quản trị viên"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "carts",
        COMMON_FIELDS
        + [
            f("userId", "ObjectId", "Người thuê; tham chiếu users", mandatory=True),
            f("carId", "ObjectId", "Xe được giữ trong giỏ; tham chiếu cars", mandatory=True),
            f("startDate", "Date", "Thời điểm bắt đầu thuê", mandatory=True),
            f("endDate", "Date", "Thời điểm kết thúc thuê", mandatory=True),
            f("rentalMode", "String (enum)", "Hình thức thuê: DAILY hoặc HOURLY", mandatory=True),
            f("totalPrice", "Number", "Tổng tiền tạm tính", mandatory=True),
            f("pricingSnapshot", "Mixed", "Bản chụp cấu hình và chi tiết tính giá tại thời điểm thêm giỏ"),
            f("expiredAt", "Date", "Thời điểm giữ xe trong giỏ hết hạn", mandatory=True),
            f("status", "String (enum)", "Trạng thái: ACTIVE, EXPIRED, BOOKED hoặc CANCELLED"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "bookings",
        COMMON_FIELDS
        + [
            f("userId", "ObjectId", "Người thuê; tham chiếu users", mandatory=True),
            f("businessId", "ObjectId", "Doanh nghiệp sở hữu theo mô hình cũ; tham chiếu businesses"),
            f("ownerId", "ObjectId", "Chủ xe; tham chiếu động theo ownerModel", mandatory=True),
            f("ownerType", "String (enum)", "Loại chủ xe: BUSINESS hoặc USER", mandatory=True),
            f("ownerModel", "String (enum)", "Model chủ xe: User hoặc Business", mandatory=True),
            f("carId", "ObjectId", "Xe được đặt; tham chiếu cars", mandatory=True),
            f("cartId", "ObjectId", "Mục giỏ hàng nguồn; tham chiếu carts"),
            f("startDate", "Date", "Thời điểm bắt đầu thuê", mandatory=True),
            f("endDate", "Date", "Thời điểm kết thúc thuê", mandatory=True),
            f("rentalMode", "String (enum)", "Hình thức thuê: DAILY hoặc HOURLY", mandatory=True),
            f("totalPrice", "Number", "Tổng giá trị booking", mandatory=True),
            f("pricingSnapshot", "Object", "Bản chụp cấu hình tính giá"),
            f("pricingSnapshot.rentalMode", "String (enum)", "Hình thức thuê tại thời điểm đặt"),
            f("pricingSnapshot.weekdayPricePerDay", "Number", "Giá ngày thường"),
            f("pricingSnapshot.weekendPricePerDay", "Number", "Giá cuối tuần"),
            f("pricingSnapshot.holidayPricePerDay", "Number", "Giá ngày lễ"),
            f("pricingSnapshot.pricePerHour", "Number", "Giá giờ ngày thường"),
            f("pricingSnapshot.weekendPricePerHour", "Number", "Giá giờ cuối tuần"),
            f("pricingSnapshot.holidayPricePerHour", "Number", "Giá giờ ngày lễ"),
            f("pricingSnapshot.breakdown", "Array<Object>", "Chi tiết tiền theo ngày/giờ"),
            f("pricingSnapshot.breakdown[].date", "String", "Ngày tính giá"),
            f("pricingSnapshot.breakdown[].type", "String", "Loại ngày"),
            f("pricingSnapshot.breakdown[].label", "String", "Nhãn hiển thị"),
            f("pricingSnapshot.breakdown[].unitCount", "Number", "Số đơn vị thuê"),
            f("pricingSnapshot.breakdown[].unitPrice", "Number", "Đơn giá"),
            f("pricingSnapshot.breakdown[].price", "Number", "Thành tiền"),
            f("pricingSnapshot.subtotal", "Number", "Tổng tạm tính"),
            f("pricingSnapshot.rentalSubtotal", "Number", "Tiền thuê xe"),
            f("pricingSnapshot.deliveryFee", "Number", "Phí giao xe"),
            f("pricingSnapshot.totalPrice", "Number", "Tổng tiền sau phí giao xe"),
            f("pricingSnapshot.delivery", "Object", "Thông tin giao/nhận xe"),
            f("pricingSnapshot.delivery.deliveryType", "String (enum)", "Nhận tại vị trí xe hoặc giao đến khách"),
            f("pricingSnapshot.delivery.deliveryAddress", "String", "Địa chỉ giao xe"),
            f("pricingSnapshot.delivery.deliveryAddressText", "String", "Chuỗi địa chỉ giao xe"),
            f("pricingSnapshot.delivery.deliveryFormattedAddress", "String", "Địa chỉ giao xe đã định dạng"),
            f("pricingSnapshot.delivery.deliveryAddressSource", "String (enum)", "Nguồn địa chỉ: nhập tay, geocode, vị trí hiện tại hoặc ghim bản đồ"),
            f("pricingSnapshot.delivery.deliveryLat", "Number", "Vĩ độ điểm giao"),
            f("pricingSnapshot.delivery.deliveryLng", "Number", "Kinh độ điểm giao"),
            f("pricingSnapshot.delivery.deliveryDistanceKm", "Number", "Khoảng cách giao xe"),
            f("pricingSnapshot.delivery.deliveryDurationText", "String", "Thời gian giao xe dự kiến"),
            f("pricingSnapshot.delivery.deliveryBaseFee", "Number", "Phí giao cơ bản"),
            f("pricingSnapshot.delivery.deliveryFeePerKm", "Number", "Phí theo ki-lô-mét"),
            f("pricingSnapshot.delivery.deliveryMaxDistanceKm", "Number", "Khoảng cách giao tối đa"),
            f("pricingSnapshot.delivery.deliveryFee", "Number", "Tổng phí giao"),
            f("pricingSnapshot.delivery.deliveryNote", "String", "Ghi chú giao xe"),
            f("paymentOption", "String (enum)", "Lựa chọn thanh toán: DEPOSIT hoặc FULL"),
            f("depositAmount", "Number", "Số tiền đặt cọc"),
            f("remainingAmount", "Number", "Số tiền còn phải thanh toán"),
            f("paidAmount", "Number", "Tổng số tiền đã thanh toán"),
            f("isDepositRefundable", "Boolean", "Tiền cọc có thể hoàn lại"),
            f("cancellationPolicySnapshot", "Object", "Bản chụp chính sách hủy"),
            f("cancellationPolicySnapshot.fullRefundBeforeHours", "Number", "Số giờ tối thiểu để hoàn đủ"),
            f("cancellationPolicySnapshot.partialRefundBeforeHours", "Number", "Số giờ tối thiểu để hoàn một phần"),
            f("cancellationPolicySnapshot.partialRefundRate", "Number", "Tỷ lệ hoàn một phần, từ 0 đến 1"),
            f("cancellationPolicySnapshot.lateCancellationRule", "String", "Quy tắc hủy sát giờ"),
            f("cancellationPolicySnapshot.ownerCancellationRefundRate", "Number", "Tỷ lệ hoàn khi chủ xe hủy"),
            f("pickupAddressSnapshot", "String", "Địa chỉ nhận xe được chụp tại thời điểm đặt"),
            f("returnAddressSnapshot", "String", "Địa chỉ trả xe được chụp tại thời điểm đặt"),
            f("renterInfo", "Object", "Thông tin người thuê dùng cho booking/hợp đồng"),
            f("renterInfo.fullName", "String", "Họ tên người thuê"),
            f("renterInfo.phone", "String", "Số điện thoại người thuê"),
            f("renterInfo.email", "String", "Email người thuê"),
            f("renterInfo.cccdNumber", "String", "Số căn cước công dân"),
            f("renterInfo.cccdFrontImage", "String", "Ảnh mặt trước căn cước"),
            f("renterInfo.cccdBackImage", "String", "Ảnh mặt sau căn cước"),
            f("renterInfo.driverLicenseNumber", "String", "Số giấy phép lái xe"),
            f("renterInfo.driverLicenseImage", "String", "Ảnh giấy phép lái xe"),
            f("renterInfo.note", "String", "Ghi chú người thuê"),
            f("status", "String (enum)", "Trạng thái vòng đời booking"),
            f("ownerApprovedAt", "Date", "Thời điểm chủ xe duyệt"),
            f("paymentDeadlineAt", "Date", "Hạn thanh toán"),
            f("cancelReason", "String", "Lý do hủy theo cấu trúc cũ"),
            f("cancelledAt", "Date", "Thời điểm hủy"),
            f("cancelledBy", "ObjectId", "Người hủy; tham chiếu users"),
            f("cancelledByRole", "String", "Vai trò người hủy"),
            f("cancelReasonCode", "String", "Mã lý do hủy"),
            f("cancelReasonText", "String", "Nội dung lý do hủy"),
            f("cancellationSummary", "Object", "Kết quả tính phí và hoàn tiền khi hủy"),
            f("cancellationSummary.paidAmountAtCancellation", "Number", "Số tiền đã trả tại lúc hủy"),
            f("cancellationSummary.cancellationFee", "Number", "Phí hủy"),
            f("cancellationSummary.refundAmount", "Number", "Số tiền được hoàn"),
            f("cancellationSummary.policyRuleApplied", "String", "Quy tắc hoàn tiền áp dụng"),
            f("cancellationSummary.refundRequired", "Boolean", "Có yêu cầu hoàn tiền hay không"),
            f("cancellationSummary.refundId", "ObjectId", "Bản hoàn tiền; tham chiếu refunds"),
            f("noShowReason", "String", "Lý do khách không đến nhận xe"),
            f("noShowAt", "Date", "Thời điểm ghi nhận không đến"),
            f("returnReminderSentAt", "Date", "Thời điểm gửi nhắc trả xe"),
            f("note", "String", "Ghi chú booking"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "contracts",
        COMMON_FIELDS
        + [
            f("bookingId", "ObjectId", "Booking duy nhất của hợp đồng; tham chiếu bookings", unique=True, mandatory=True),
            f("userId", "ObjectId", "Người thuê; tham chiếu users", mandatory=True),
            f("carId", "ObjectId", "Xe cho thuê; tham chiếu cars", mandatory=True),
            f("businessId", "ObjectId", "Doanh nghiệp sở hữu theo mô hình cũ; tham chiếu businesses"),
            f("ownerId", "ObjectId", "Chủ xe; tham chiếu động theo ownerModel", mandatory=True),
            f("ownerType", "String (enum)", "Loại chủ xe: BUSINESS hoặc USER", mandatory=True),
            f("ownerModel", "String (enum)", "Model chủ xe: User hoặc Business", mandatory=True),
            f("renterName", "String", "Họ tên người thuê", mandatory=True),
            f("renterPhone", "String", "Số điện thoại người thuê", mandatory=True),
            f("renterIdentityNumber", "String", "Số giấy tờ định danh", mandatory=True),
            f("renterAddress", "String", "Địa chỉ người thuê", mandatory=True),
            f("note", "String", "Ghi chú hợp đồng"),
            f("startDate", "Date", "Thời điểm bắt đầu hợp đồng", mandatory=True),
            f("endDate", "Date", "Thời điểm kết thúc hợp đồng", mandatory=True),
            f("totalPrice", "Number", "Tổng giá trị hợp đồng", mandatory=True),
            f("depositAmount", "Number", "Tiền đặt cọc"),
            f("paidAmount", "Number", "Số tiền đã thanh toán"),
            f("remainingAmount", "Number", "Số tiền còn lại"),
            f("paymentStatus", "String", "Trạng thái thanh toán tổng hợp"),
            f("paymentOption", "String (enum)", "Lựa chọn DEPOSIT hoặc FULL", mandatory=True),
            f("pickupAddressSnapshot", "String", "Địa chỉ nhận xe tại thời điểm lập hợp đồng"),
            f("returnAddressSnapshot", "String", "Địa chỉ trả xe tại thời điểm lập hợp đồng"),
            f("ownerAddressSnapshot", "String", "Địa chỉ chủ xe tại thời điểm lập hợp đồng"),
            f("status", "String (enum)", "Trạng thái: DRAFT, ACTIVE, COMPLETED hoặc CANCELLED"),
            f("contractCode", "String", "Mã hợp đồng", unique=True, mandatory=True),
            f("signedAt", "Date", "Thời điểm ký hợp đồng"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "payments",
        COMMON_FIELDS
        + [
            f("bookingId", "ObjectId", "Booking được thanh toán; tham chiếu bookings", mandatory=True),
            f("extraChargeId", "ObjectId", "Phụ phí được thanh toán; tham chiếu extracharges"),
            f("userId", "ObjectId", "Người thanh toán; tham chiếu users", mandatory=True),
            f("amount", "Number", "Số tiền thanh toán", mandatory=True),
            f("method", "String (enum)", "Phương thức: CASH, MOMO hoặc VNPAY"),
            f("status", "String (enum)", "Trạng thái: PENDING, PAID, FAILED hoặc REFUNDED"),
            f("paymentType", "String (enum)", "Loại tiền: DEPOSIT, FULL, REMAINING hoặc EXTRA_CHARGE"),
            f("paidAt", "Date", "Thời điểm thanh toán thành công"),
            f("transactionCode", "String", "Mã giao dịch"),
            f("refundedAmount", "Number", "Số tiền đã hoàn"),
            f("refundStatus", "String", "Trạng thái hoàn tiền liên quan"),
            f("confirmedBy", "ObjectId", "Người xác nhận thanh toán; tham chiếu users"),
            f("confirmedByRole", "String", "Vai trò người xác nhận"),
            f("note", "String", "Ghi chú thanh toán"),
            f("remainingPaymentReminderSentAt", "Date", "Thời điểm gửi nhắc thanh toán phần còn lại"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "refunds",
        COMMON_FIELDS
        + [
            f("bookingId", "ObjectId", "Booking phát sinh hoàn tiền; tham chiếu bookings", mandatory=True),
            f("requestedBy", "ObjectId", "Người yêu cầu hoàn; tham chiếu users", mandatory=True),
            f("requestedByRole", "String (enum)", "Vai trò người yêu cầu", mandatory=True),
            f("cancelledBy", "ObjectId", "Người hủy booking; tham chiếu users", mandatory=True),
            f("cancelledByRole", "String (enum)", "Vai trò người hủy", mandatory=True),
            f("reasonCode", "String", "Mã lý do hoàn tiền", mandatory=True),
            f("reasonText", "String", "Nội dung lý do hoàn tiền"),
            f("paidAmountAtCancellation", "Number", "Số tiền đã thanh toán khi hủy", mandatory=True),
            f("cancellationFee", "Number", "Phí hủy", mandatory=True),
            f("refundAmount", "Number", "Số tiền hoàn", mandatory=True),
            f("policySnapshot", "Mixed", "Bản chụp chính sách hoàn tiền"),
            f("policyRuleApplied", "String", "Quy tắc chính sách đã áp dụng", mandatory=True),
            f("policySource", "String", "Nguồn chính sách", mandatory=True),
            f("method", "String (enum)", "Phương thức hoàn: VNPAY, MOMO, CASH, MANUAL hoặc NONE"),
            f("status", "String (enum)", "Trạng thái xử lý hoàn tiền"),
            f("paymentIds", "Array<ObjectId>", "Các giao dịch được hoàn; tham chiếu payments"),
            f("provider", "String", "Nhà cung cấp thanh toán"),
            f("providerRefundId", "String", "Mã hoàn tiền phía nhà cung cấp"),
            f("providerTransactionId", "String", "Mã giao dịch phía nhà cung cấp"),
            f("providerResponseCode", "String", "Mã phản hồi nhà cung cấp"),
            f("providerResponseMessage", "String", "Thông điệp phản hồi nhà cung cấp"),
            f("idempotencyKey", "String", "Khóa chống xử lý hoàn tiền trùng", unique=True, mandatory=True),
            f("failureReason", "String", "Lý do hoàn tiền thất bại"),
            f("retryCount", "Number", "Số lần thử lại"),
            f("recipientInfo", "Object", "Thông tin người nhận tiền hoàn"),
            f("recipientInfo.method", "String (enum)", "BANK_TRANSFER, E_WALLET hoặc CASH"),
            f("recipientInfo.bankName", "String", "Tên ngân hàng"),
            f("recipientInfo.accountNumber", "String", "Số tài khoản"),
            f("recipientInfo.accountNumberMasked", "String", "Số tài khoản đã che"),
            f("recipientInfo.accountHolderName", "String", "Tên chủ tài khoản"),
            f("recipientInfo.walletProvider", "String", "Nhà cung cấp ví điện tử"),
            f("recipientInfo.walletAccount", "String", "Tài khoản ví điện tử"),
            f("recipientInfo.walletAccountMasked", "String", "Tài khoản ví đã che"),
            f("recipientInfo.walletHolderName", "String", "Tên chủ ví"),
            f("recipientInfo.cashNote", "String", "Ghi chú hoàn tiền mặt"),
            f("recipientInfo.submittedBy", "ObjectId", "Người cung cấp thông tin; tham chiếu users"),
            f("recipientInfo.submittedAt", "Date", "Thời điểm cung cấp thông tin"),
            f("recipientInfo.updatedAt", "Date", "Thời điểm cập nhật thông tin nhận hoàn"),
            f("manualRefundEvidence", "Array<String>", "Danh sách ảnh/chứng từ hoàn thủ công"),
            f("manualRefundMethod", "String", "Phương thức hoàn thủ công"),
            f("manualRefundReference", "String", "Mã tham chiếu hoàn thủ công"),
            f("manualRefundNote", "String", "Ghi chú hoàn thủ công"),
            f("manualRefundSentAt", "Date", "Thời điểm gửi khoản hoàn thủ công"),
            f("renterConfirmedAt", "Date", "Thời điểm người thuê xác nhận đã nhận tiền"),
            f("requestedAt", "Date", "Thời điểm yêu cầu hoàn"),
            f("processingAt", "Date", "Thời điểm bắt đầu xử lý"),
            f("succeededAt", "Date", "Thời điểm hoàn thành"),
            f("failedAt", "Date", "Thời điểm thất bại"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "extracharges",
        COMMON_FIELDS
        + [
            f("bookingId", "ObjectId", "Booking phát sinh phụ phí; tham chiếu bookings", mandatory=True),
            f("carId", "ObjectId", "Xe phát sinh phụ phí; tham chiếu cars", mandatory=True),
            f("renterId", "ObjectId", "Người thuê; tham chiếu users", mandatory=True),
            f("ownerId", "ObjectId", "Chủ xe; tham chiếu động theo ownerModel", mandatory=True),
            f("ownerType", "String (enum)", "Loại chủ xe: BUSINESS hoặc USER", mandatory=True),
            f("ownerModel", "String (enum)", "Model chủ xe: User hoặc Business", mandatory=True),
            f("type", "String (enum)", "Loại phụ phí: CLEANING, DAMAGE, LATE_RETURN, FUEL hoặc OTHER", mandatory=True),
            f("amount", "Number", "Số tiền phụ phí, tối thiểu 1", mandatory=True),
            f("description", "String", "Nội dung phụ phí", mandatory=True),
            f("evidenceImages", "Array<String>", "Hình ảnh bằng chứng"),
            f("status", "String (enum)", "Trạng thái: PENDING, PAID hoặc CANCELLED"),
            f("paymentId", "ObjectId", "Giao dịch thanh toán phụ phí; tham chiếu payments"),
            f("paymentMethod", "String (enum)", "Phương thức thanh toán"),
            f("paidAt", "Date", "Thời điểm thanh toán"),
            f("confirmedBy", "ObjectId", "Người xác nhận; tham chiếu users"),
            f("confirmedByRole", "String (enum)", "Vai trò người xác nhận"),
            f("cancelReason", "String", "Lý do hủy phụ phí"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "returninspections",
        COMMON_FIELDS
        + [
            f("bookingId", "ObjectId", "Booking duy nhất được kiểm tra trả xe", unique=True, mandatory=True),
            f("carId", "ObjectId", "Xe được kiểm tra; tham chiếu cars", mandatory=True),
            f("renterId", "ObjectId", "Người thuê; tham chiếu users", mandatory=True),
            f("ownerId", "ObjectId", "Chủ xe; tham chiếu động theo ownerModel", mandatory=True),
            f("ownerType", "String (enum)", "Loại chủ xe: BUSINESS hoặc USER", mandatory=True),
            f("ownerModel", "String (enum)", "Model chủ xe: User hoặc Business", mandatory=True),
            f("receivedAt", "Date", "Thời điểm tiếp nhận xe trả", mandatory=True),
            f("receivedBy", "ObjectId", "Người tiếp nhận; tham chiếu users", mandatory=True),
            f("actualReturnAt", "Date", "Thời điểm khách thực tế trả xe", mandatory=True),
            f("returnOdometer", "Number", "Số công-tơ-mét khi trả"),
            f("returnFuelLevel", "Number", "Mức nhiên liệu khi trả, từ 0 đến 100"),
            f("returnPhotos", "Array<String>", "Ảnh xe khi trả"),
            f("conditionNotes", "String", "Ghi chú tình trạng xe"),
            f("isLate", "Boolean", "Trả xe trễ hay không"),
            f("lateMinutes", "Number", "Số phút trả trễ"),
            f("hasDamage", "Boolean", "Có hư hỏng hay không"),
            f("hasCleaningIssue", "Boolean", "Có vấn đề vệ sinh hay không"),
            f("hasFuelShortage", "Boolean", "Có thiếu nhiên liệu hay không"),
            f("inspectionStatus", "String (enum)", "RECEIVED, INSPECTING, CHARGES_PENDING hoặc CLEARED"),
            f("inspectedAt", "Date", "Thời điểm hoàn tất kiểm tra"),
            f("inspectedBy", "ObjectId", "Người kiểm tra; tham chiếu users"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "reviews",
        COMMON_FIELDS
        + [
            f("bookingId", "ObjectId", "Booking đã hoàn thành; tham chiếu bookings; thuộc chỉ mục duy nhất ghép với renterId", mandatory=True),
            f("carId", "ObjectId", "Xe được đánh giá; tham chiếu cars", mandatory=True),
            f("renterId", "ObjectId", "Người đánh giá; tham chiếu users; thuộc chỉ mục duy nhất ghép với bookingId", mandatory=True),
            f("ownerId", "ObjectId", "Chủ xe; tham chiếu động theo ownerModel", mandatory=True),
            f("ownerType", "String (enum)", "Loại chủ xe: BUSINESS hoặc USER", mandatory=True),
            f("ownerModel", "String (enum)", "Model chủ xe: Business hoặc User", mandatory=True),
            f("rating", "Number", "Điểm tổng, số nguyên từ 1 đến 5", mandatory=True),
            f("criteria", "Object", "Điểm theo từng tiêu chí"),
            f("criteria.vehicleQuality", "Number", "Chất lượng xe, từ 1 đến 5"),
            f("criteria.cleanliness", "Number", "Độ sạch, từ 1 đến 5"),
            f("criteria.descriptionAccuracy", "Number", "Độ chính xác mô tả, từ 1 đến 5"),
            f("criteria.handoverService", "Number", "Dịch vụ bàn giao, từ 1 đến 5"),
            f("criteria.ownerAttitude", "Number", "Thái độ chủ xe, từ 1 đến 5"),
            f("criteria.punctuality", "Number", "Đúng giờ, từ 1 đến 5"),
            f("comment", "String", "Nội dung đánh giá"),
            f("images", "Array<String>", "Tối đa 3 ảnh đánh giá"),
            f("ownerReply", "Object", "Phản hồi của chủ xe"),
            f("ownerReply.content", "String", "Nội dung phản hồi"),
            f("ownerReply.repliedAt", "Date", "Thời điểm phản hồi"),
            f("ownerReply.updatedAt", "Date", "Thời điểm cập nhật phản hồi"),
            f("status", "String (enum)", "Trạng thái: VISIBLE, REPORTED hoặc HIDDEN"),
            f("report", "Object", "Thông tin báo cáo đánh giá"),
            f("report.reason", "String", "Lý do báo cáo"),
            f("report.reportedBy", "ObjectId", "Người báo cáo; tham chiếu users"),
            f("report.reportedAt", "Date", "Thời điểm báo cáo"),
            f("hiddenReason", "String", "Lý do ẩn đánh giá"),
            f("hiddenBy", "ObjectId", "Người ẩn; tham chiếu users"),
            f("hiddenAt", "Date", "Thời điểm ẩn"),
            f("helpfulCount", "Number", "Số lượt đánh dấu hữu ích"),
            f("helpfulBy", "Array<ObjectId>", "Người đánh dấu hữu ích; tham chiếu users"),
            f("reviewerNameSnapshot", "String", "Tên người đánh giá tại thời điểm tạo"),
            f("carNameSnapshot", "String", "Tên xe tại thời điểm tạo"),
            f("ownerNameSnapshot", "String", "Tên chủ xe tại thời điểm tạo"),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "notifications",
        COMMON_FIELDS
        + [
            f("recipientId", "ObjectId", "Người nhận; tham chiếu users; thuộc chỉ mục duy nhất ghép với dedupeKey", mandatory=True),
            f("recipientRole", "String (enum)", "Vai trò người nhận", mandatory=True),
            f("type", "String (enum)", "Loại sự kiện thông báo", mandatory=True),
            f("title", "String", "Tiêu đề, tối đa 160 ký tự", mandatory=True),
            f("message", "String", "Nội dung, tối đa 1000 ký tự", mandatory=True),
            f("actorId", "ObjectId", "Người gây ra sự kiện; tham chiếu users"),
            f("actorRole", "String (enum)", "Vai trò người gây ra sự kiện"),
            f("entityType", "String (enum)", "Loại thực thể liên quan", mandatory=True),
            f("entityId", "ObjectId", "Mã thực thể liên quan"),
            f("bookingId", "ObjectId", "Booking liên quan; tham chiếu bookings"),
            f("carId", "ObjectId", "Xe liên quan; tham chiếu cars"),
            f("actionKey", "String (enum)", "Hành động điều hướng từ thông báo"),
            f("actionUrl", "String", "Đường dẫn điều hướng"),
            f("metadata", "Mixed", "Dữ liệu bổ sung theo từng loại thông báo"),
            f("isRead", "Boolean", "Đã đọc hay chưa"),
            f("readAt", "Date", "Thời điểm đọc"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
            f("deletedAt", "Date", "Thời điểm xóa"),
            f("dedupeKey", "String", "Khóa chống tạo thông báo trùng; duy nhất khi ghép với recipientId", mandatory=True),
        ]
        + TIMESTAMP_FIELDS,
    ),
    (
        "holidaycalendars",
        COMMON_FIELDS
        + [
            f("name", "String", "Tên ngày lễ hoặc kỳ nghỉ", mandatory=True),
            f("date", "Date", "Ngày lễ đơn theo cấu trúc tương thích"),
            f("startDate", "Date", "Ngày bắt đầu", mandatory=True),
            f("endDate", "Date", "Ngày kết thúc", mandatory=True),
            f("country", "String", "Mã quốc gia, mặc định VN"),
            f("type", "String", "Loại ngày, mặc định HOLIDAY"),
            f("isActive", "Boolean", "Lịch đang được áp dụng"),
            f("note", "String", "Ghi chú"),
            f("isDeleted", "Boolean", "Đánh dấu xóa mềm"),
        ]
        + TIMESTAMP_FIELDS,
    ),
]


INDEXES = [
    ("users", "email", "Unique", "Bảo đảm email đăng nhập duy nhất"),
    ("brands", "name", "Unique", "Bảo đảm tên hãng xe duy nhất"),
    ("cars", "plateNumberNormalized", "Single", "Tìm kiếm biển số đã chuẩn hóa"),
    ("cars", "status, isDeleted, isHidden, createdAt(-1)", "Compound", "Lọc danh sách xe công khai"),
    ("cars", "brandId, status, isDeleted", "Compound", "Lọc xe theo hãng và trạng thái"),
    ("cars", "ownerId, ownerType, isDeleted, createdAt(-1)", "Compound", "Quản lý xe theo chủ sở hữu"),
    ("carts", "userId, status, expiredAt, createdAt(-1)", "Compound", "Truy vấn giỏ thuê đang hoạt động của người dùng"),
    ("carts", "carId, status, startDate, endDate, expiredAt", "Compound", "Kiểm tra xe đang được giữ trong giỏ"),
    ("bookings", "userId, isDeleted, createdAt(-1)", "Compound", "Lịch sử booking của người thuê"),
    ("bookings", "carId, status, startDate, endDate, isDeleted", "Compound", "Kiểm tra xung đột lịch thuê xe"),
    ("bookings", "ownerId, ownerType, isDeleted, createdAt(-1)", "Compound", "Danh sách booking của chủ xe"),
    ("contracts", "bookingId", "Unique", "Mỗi booking chỉ có một hợp đồng"),
    ("contracts", "contractCode", "Unique", "Mã hợp đồng duy nhất"),
    ("payments", "extraChargeId", "Single", "Tra cứu thanh toán theo phụ phí"),
    ("refunds", "idempotencyKey", "Unique", "Ngăn xử lý yêu cầu hoàn tiền lặp"),
    ("refunds", "bookingId, status, isDeleted", "Compound", "Tra cứu hoàn tiền theo booking"),
    ("refunds", "requestedBy, createdAt(-1)", "Compound", "Lịch sử hoàn tiền của người yêu cầu"),
    ("extracharges", "bookingId / carId / renterId / ownerId / status / isDeleted", "Single", "Các chỉ mục đơn hỗ trợ lọc phụ phí"),
    ("returninspections", "bookingId", "Unique", "Mỗi booking chỉ có một lần kiểm tra trả xe"),
    ("returninspections", "carId / renterId / ownerId / inspectionStatus / isDeleted", "Single", "Các chỉ mục đơn hỗ trợ truy vấn kiểm tra"),
    ("reviews", "bookingId, renterId", "Compound unique", "Mỗi người thuê chỉ đánh giá một lần cho booking"),
    ("reviews", "carId, status, createdAt(-1)", "Compound", "Danh sách đánh giá của xe"),
    ("reviews", "ownerId, ownerType, createdAt(-1)", "Compound", "Danh sách đánh giá theo chủ xe"),
    ("reviews", "status, report.reportedAt(-1)", "Compound", "Kiểm duyệt đánh giá bị báo cáo"),
    ("notifications", "recipientId, dedupeKey", "Compound unique", "Ngăn thông báo trùng cho cùng người nhận"),
    ("notifications", "recipientId, isRead, createdAt(-1)", "Compound", "Danh sách thông báo chưa đọc"),
    ("notifications", "recipientId, createdAt(-1)", "Compound", "Lịch sử thông báo"),
    ("holidaycalendars", "country, startDate, endDate", "Compound", "Tra cứu kỳ nghỉ theo khoảng ngày"),
    ("holidaycalendars", "country, type, isActive, isDeleted", "Compound", "Lọc lịch ngày lễ đang áp dụng"),
]


def set_font(run, size: float = 10.5, bold: bool | None = None) -> None:
    run.font.name = "Times New Roman"
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), "Times New Roman")
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:hAnsi"), "Times New Roman")
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "Times New Roman")
    run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold


def set_cell_width(cell, width_dxa: int) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(width_dxa))
    tc_w.set(qn("w:type"), "dxa")


def set_cell_margins(cell, top=80, start=90, bottom=80, end=90) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin_name, margin_value in (
        ("top", top),
        ("start", start),
        ("bottom", bottom),
        ("end", end),
    ):
        node = tc_mar.find(qn(f"w:{margin_name}"))
        if node is None:
            node = OxmlElement(f"w:{margin_name}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(margin_value))
        node.set(qn("w:type"), "dxa")


def shade_cell(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shading = tc_pr.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        tc_pr.append(shading)
    shading.set(qn("w:fill"), fill)


def repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def prevent_row_split(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


def set_table_geometry(table, widths_dxa: list[int]) -> None:
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.insert(0, tbl_w)
    tbl_w.set(qn("w:w"), str(sum(widths_dxa)))
    tbl_w.set(qn("w:type"), "dxa")

    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), "90")
    tbl_ind.set(qn("w:type"), "dxa")

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        grid_col = OxmlElement("w:gridCol")
        grid_col.set(qn("w:w"), str(width))
        grid.append(grid_col)

    for row in table.rows:
        for cell, width in zip(row.cells, widths_dxa):
            set_cell_width(cell, width)


def configure_paragraph(paragraph, alignment=WD_ALIGN_PARAGRAPH.LEFT, size=10.5, bold=False):
    paragraph.alignment = alignment
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 1.0
    for run in paragraph.runs:
        set_font(run, size=size, bold=bold)


def add_schema_table(document: Document, collection: str, fields: list[Field]) -> None:
    heading = document.add_paragraph()
    heading.style = document.styles["Heading 4"]
    heading.paragraph_format.keep_with_next = True
    heading.paragraph_format.space_before = Pt(8)
    heading.paragraph_format.space_after = Pt(4)
    run = heading.add_run(f"Bảng {collection}")
    set_font(run, size=12, bold=True)

    headers = ["Thuộc tính", "Kiểu", "K", "U", "M", "Diễn giải"]
    table = document.add_table(rows=1, cols=6)
    table.style = "Table Grid"
    widths = [1900, 1700, 430, 430, 430, 4092]
    set_table_geometry(table, widths)

    header_row = table.rows[0]
    repeat_table_header(header_row)
    prevent_row_split(header_row)
    for index, (cell, text) in enumerate(zip(header_row.cells, headers)):
        cell.text = text
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_margins(cell)
        shade_cell(cell, "D9E2F3")
        configure_paragraph(
            cell.paragraphs[0],
            alignment=WD_ALIGN_PARAGRAPH.CENTER,
            size=10.5,
            bold=True,
        )
        set_cell_width(cell, widths[index])

    for field in fields:
        row = table.add_row()
        prevent_row_split(row)
        values = [
            field.name,
            field.data_type,
            "x" if field.key else "",
            "x" if field.unique else "",
            "x" if field.mandatory else "",
            field.description,
        ]
        for index, (cell, text) in enumerate(zip(row.cells, values)):
            cell.text = text
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margins(cell)
            alignment = (
                WD_ALIGN_PARAGRAPH.CENTER if index in (2, 3, 4) else WD_ALIGN_PARAGRAPH.LEFT
            )
            configure_paragraph(cell.paragraphs[0], alignment=alignment, size=10.0)
            set_cell_width(cell, widths[index])

    after = document.add_paragraph()
    after.paragraph_format.space_after = Pt(2)


def add_index_table(document: Document) -> None:
    heading = document.add_paragraph()
    heading.style = document.styles["Heading 4"]
    heading.paragraph_format.keep_with_next = True
    heading.paragraph_format.space_before = Pt(10)
    heading.paragraph_format.space_after = Pt(4)
    run = heading.add_run("Các chỉ mục vật lý chính")
    set_font(run, size=12, bold=True)

    headers = ["Collection", "Trường chỉ mục", "Loại", "Mục đích"]
    table = document.add_table(rows=1, cols=4)
    table.style = "Table Grid"
    widths = [1500, 3300, 1300, 2852]
    set_table_geometry(table, widths)
    repeat_table_header(table.rows[0])
    for index, (cell, text) in enumerate(zip(table.rows[0].cells, headers)):
        cell.text = text
        shade_cell(cell, "D9E2F3")
        set_cell_margins(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        configure_paragraph(cell.paragraphs[0], WD_ALIGN_PARAGRAPH.CENTER, 10.5, True)
        set_cell_width(cell, widths[index])

    for values in INDEXES:
        row = table.add_row()
        prevent_row_split(row)
        for index, (cell, text) in enumerate(zip(row.cells, values)):
            cell.text = text
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            alignment = WD_ALIGN_PARAGRAPH.CENTER if index == 2 else WD_ALIGN_PARAGRAPH.LEFT
            configure_paragraph(cell.paragraphs[0], alignment, 10.0)
            set_cell_width(cell, widths[index])


def configure_document(document: Document) -> None:
    if len(document.sections) > 1:
        while len(document.sections) > 1:
            # A fresh document normally has one section; this is a defensive guard.
            break
    section = document.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.left_margin = Cm(3)
    section.right_margin = Cm(2)
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.header_distance = Cm(1.2)
    section.footer_distance = Cm(1.2)

    normal = document.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Times New Roman")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Times New Roman")
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    normal.font.size = Pt(12)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1.15

    for style_name, size in (
        ("Heading 1", 16),
        ("Heading 2", 15),
        ("Heading 3", 14),
        ("Heading 4", 12),
    ):
        style = document.styles[style_name]
        style.font.name = "Times New Roman"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Times New Roman")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Times New Roman")
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)


def build(output_path: Path) -> None:
    document = Document()
    configure_document(document)

    heading = document.add_paragraph()
    heading.style = document.styles["Heading 3"]
    heading.paragraph_format.space_after = Pt(6)
    heading.paragraph_format.keep_with_next = True
    run = heading.add_run("3.1.3 Dữ liệu ở mức vật lý")
    set_font(run, size=14, bold=True)

    intro = document.add_paragraph()
    intro.paragraph_format.first_line_indent = Cm(1)
    intro.paragraph_format.space_after = Pt(6)
    intro.paragraph_format.line_spacing = 1.15
    intro_run = intro.add_run(
        "Hệ thống sử dụng MongoDB và Mongoose. Mỗi bảng dưới đây tương ứng với "
        "một collection được tạo từ model hiện có trong mã nguồn. Các thuộc tính "
        "lồng nhau được biểu diễn bằng ký pháp dấu chấm; ký hiệu [] biểu thị phần "
        "tử trong mảng."
    )
    set_font(intro_run, size=12)

    legend = document.add_paragraph()
    legend.paragraph_format.space_after = Pt(8)
    legend_run = legend.add_run(
        "Quy ước: K - khóa; U - duy nhất; M - bắt buộc theo schema; x - có áp dụng."
    )
    set_font(legend_run, size=11, bold=True)

    for collection, fields in SCHEMAS:
        add_schema_table(document, collection, fields)

    add_index_table(document)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    document.save(output_path)


if __name__ == "__main__":
    build(Path(sys.argv[1]))
