# PHASE D — REJECTED BOOKING CAR RECOMMENDATION

## 1. Luồng cũ đã đọc

- Route reject booking: `POST /api/bookings/rejectBooking/:id`, hàm `BookingRoute.rejectBooking`. Chỉ owner của xe được xử lý booking `REQUESTED`; backend cập nhật `status = REJECTED`, lưu `cancelReason`, gửi mail và gọi `notificationCenterService.notifyBookingRejected`.
- Notification: model hiện có `Notification`, type `BOOKING_REJECTED`, `bookingId`, `carId`, `actionUrl`, `metadata`, dedupe key. Notification API đã có list/read/delete/summary.
- Realtime/refetch: trước Phase D notification chỉ refetch khi Header/Bell mount hoặc user mở chuông. Phase D bổ sung Socket.IO namespace `/notifications` và event `booking_rejected`; không tạo notification framework mới.
- Frontend user layout: modal được render trong `Header`, xuất hiện ở khu vực thuê xe/public customer có Header. Layout admin và `PrivateOwnerLayout` không dùng Header này nên không tự bật popup trong dashboard quản lý.
- Booking flow: `BookingRequestPage` nhận state `source = direct`, `car`, `bookingData` gồm `carId`, `startDate`, `endDate`, `rentalMode`, `paymentOption`; tạo booking qua `bookingService.createBooking` và vẫn bắt buộc quote/availability ở flow hiện có.
- Availability helper: recommendation gọi lại `expireOldCarts`, `expireAbandonedPendingBookings` và `assertCarAvailability`, do đó dùng cùng booking buffer 3 giờ, cleaning buffer 1 giờ, cart hold và extension hold.
- Pricing helper: recommendation gọi `calculateRentalPrice` theo đúng `DAILY`/`HOURLY`; giá so sánh lấy `pricingSnapshot.rentalSubtotal` hoặc `subtotal`, fallback tính lại bằng pricing helper của xe cũ.

## 2. File đã sửa

Backend:

- `backend/src/routers/apis/booking.route.ts`
- `backend/src/services/notification-center.service.ts`
- `backend/src/sockets/booking-chat.socket.ts`
- `backend/src/server.ts`

Frontend:

- `frontend/src/services/booking.service.ts`
- `frontend/src/components/Header.tsx`
- `frontend/src/components/booking/RejectedBookingRecommendationModal.tsx` (component riêng vì modal có socket, timer và 3 nhánh điều hướng; tránh làm Header quá lớn).

Không tạo collection/model/schema mới.

## 3. Recommendation API

- Route: `GET /api/bookings/:id/recommended-car`.
- Quyền: JWT + role `USER`; query booking phải thuộc `req.user.userId`. Sai owner/renter trả lỗi record not found; không lộ dữ liệu booking của user khác.
- Input: `:id` là booking bị từ chối.
- Điều kiện booking: `status === REJECTED`, `isDeleted === false`, ngày thuê hợp lệ.
- Output: `data.recommendation` là object TOP 1 hoặc `null`. Có bookingId, lịch thuê, rentalMode, giá gốc, giá candidate, chênh lệch, thông tin xe public, pickup location và review summary.
- Trường hợp null: booking chưa `REJECTED`, thiếu ngày/giá/xe, không có candidate hoặc tất cả candidate fail availability/pricing.
- Không gửi ownerId, email, CCCD, GPLX hoặc dữ liệu identity.

## 4. Thuật toán recommendation

- Loại xe vừa bị từ chối bằng `_id != booking.carId`.
- Chỉ lấy xe `APPROVED`/`RENTED`, không xóa mềm, không ẩn, không thuộc chính renter hiện tại.
- Bắt buộc cùng `seats`.
- Bắt buộc hỗ trợ cùng `rentalMode` qua `allowDailyRental`/`allowHourlyRental` hoặc `rentalUnit` tương ứng.
- Tính candidate rental subtotal bằng `calculateRentalPrice(candidate, start, end, rentalMode)`.
- Giá hợp lệ trong `[originalRentalSubtotal * 0.8, originalRentalSubtotal * 1.2]`.
- Availability gọi `assertCarAvailability` cho từng candidate, không xây công thức lịch mới.
- Xếp hạng: `abs(candidate - original)` tăng dần; nếu bằng nhau dùng rating visible cao hơn, review count cao hơn, rồi `_id` ổn định.
- V1 không dùng khoảng cách địa lý vì không cần thêm thuật toán mới.
- `estimatedTotal` là tổng tiền thuê theo pricing helper; delivery fee không được giả định lại trong recommendation. Flow booking mới sẽ quote lại đầy đủ.

## 5. Trigger popup

- Online: backend tạo notification `BOOKING_REJECTED`, sau khi lưu phát event Socket.IO `/notifications` → `booking_rejected` vào room của recipient.
- Frontend nhận event, lấy `bookingId`, gọi recommendation API. Candidate null thì không mở modal.
- Offline: notification giữ `actionUrl = /bookings/:id?recommendation=1`. Khi user bấm notification sau này, BookingDetail/Header gọi lại API tại thời điểm hiện tại.
- Không polling mỗi giây và không thêm thư viện realtime.
- Chống lặp: auto-popup dùng `sessionStorage` key `bqdrive.rejected-recommendation-shown:<bookingId>`. Cùng booking chỉ auto-open một lần trong browser session. Notification action vẫn có thể gọi thủ công lại.
- Khi ở `/admin`, `/consignment`, `/owner`, `/private-owner` hoặc prefix tương đương, component không tự mở.

## 6. Modal

- Hiển thị: ảnh đại diện, tên/brand, seats, transmission, fuel, rental mode, rating/review count, giá cơ bản, tổng tiền thuê dự kiến, pickup location, thời gian thuê.
- Timer: tối đa 60 giây, countdown `00:59`, tự đóng khi hết hạn.
- X/Bỏ qua: đóng ngay; không mutation backend.
- Xem chi tiết: `/cars/:id` và giữ `startDate`, `endDate`, `rentalMode` qua query.
- Đặt xe này: chuyển `/booking-request` với `source = direct` và prefill car/lịch; không gọi create booking từ modal.
- Xem thêm xe tương tự: chuyển Search Results hiện có với lịch, mode và seats.
- Mobile: ảnh trên, nội dung dưới, modal scroll trong viewport, nút dễ bấm.

## 7. Xác nhận popup không giữ xe

- Có tạo CartHold không: Không.
- Có reserve/increment revision Car không: Không.
- Có thay đổi booking cũ không: Không; booking cũ vẫn `REJECTED`.
- Availability được kiểm tra lại ở hai điểm: recommendation API khi mở modal và `createBooking`/`bookingFromCart` hiện có trong flow đặt xe mới. Candidate có thể hết chỗ trong lúc modal mở và khi đó backend booking trả conflict bình thường.

## 8. Test

1. Có xe tương tự: booking `REJECTED`, 5 chỗ, `DAILY`, giá 1.000.000; candidate 5 chỗ, DAILY, trống, 1.050.000 → trả candidate.
2. Sai số chỗ: candidate 7 chỗ cho booking 5 chỗ → `recommendation = null`.
3. Sai rental mode: booking DAILY, candidate chỉ HOURLY → null.
4. Giá vượt ±20%: 1.000.000 và 1.400.000 → null.
5. Candidate conflict booking → bị loại.
6. Candidate bị CartHold/Extension hold → bị loại qua `assertCarAvailability`.
7. Candidate chính là xe cũ → bị loại.
8. Nhiều candidate → candidate có chênh giá nhỏ nhất là TOP 1.
9. Không có candidate → API null, modal không mở.
10. User khác gọi booking → backend từ chối.
11. Booking `REQUESTED`/`PAID`/`COMPLETED` → API null.
12. Modal mở 60 giây không thao tác → tự đóng.
13. Bấm X/Bỏ qua sau 5 giây → đóng ngay.
14. Candidate bị user khác đặt trong lúc modal mở → bấm Đặt xe này đi vào flow mới và nhận conflict; không tự chọn candidate thứ hai.
15. Offline → không có popup đang chạy; notification vẫn tồn tại; bấm notification sẽ tính lại.
16. Refresh/refetch notification cùng browser session → không auto-popup lặp.
17. Đang ở dashboard ký gửi/admin → không tự popup; notification vẫn dùng được.
18. Xem chi tiết → đúng xe, query giữ lịch và rentalMode.
19. Đặt xe này → `/booking-request`, người thuê vẫn xem/confirm form; booking mới chỉ tạo sau submit và bắt đầu `REQUESTED`.
20. Xem thêm xe tương tự → Search Results hiện có, giữ lịch/mode/seats.

Probe API:

```powershell
$headers = @{ "x-token" = "<JWT_RENTER>" }
Invoke-RestMethod -Headers $headers `
  -Uri "http://localhost:5000/api/bookings/<REJECTED_BOOKING_ID>/recommended-car"
```

## 9. Build

- Frontend: `npm run build` đạt.
- Backend recommendation-related files: type-check riêng bằng TypeScript đạt.
- Backend toàn project: vẫn fail bởi 6 lỗi legacy trong `business.route.ts` do `UserRoleEnum.BUSINESS`/`OwnerTypeEnum.BUSINESS` đã bị loại bỏ trước Phase D. Không sửa BUSINESS legacy trong phase này.
- Frontend lint: vẫn có 17 lỗi và 1 warning tồn tại từ codebase hiện tại; không phát sinh lỗi mới trong component recommendation.

## 10. Những gì không thay đổi

- Không collection mới.
- Không schema/model recommendation.
- Không thay booking lifecycle; booking cũ vẫn `REJECTED`.
- Không thay buffer booking 3 giờ.
- Không thay cleaning buffer 1 giờ.
- Không thay Payment, Refund, Contract, BookingExtension hoặc Cart.
- Không thay pricing formula.
- Không thay Search Availability.
- Không thay Safe Handover.
- Không thay role `USER`/`ADMIN`, không tạo `OWNER`, không khôi phục `BUSINESS`.
- Không tạo recommendation AI/ML và không hiển thị nhiều xe trong popup.
