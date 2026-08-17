# BQDrive — System Workflows & UI Testing Audit

## Phạm vi đọc source

Tài liệu này tổng hợp các luồng chính đang có trong backend/frontend và các điểm cần kiểm tra trên giao diện. Booking vẫn dùng lifecycle hiện tại; xe ký gửi thuộc role `USER`, không khôi phục `BUSINESS` hay tạo role `OWNER`.

## 1. Xác thực và phân quyền

1. Người dùng đăng nhập/đăng ký qua auth API; token được lưu ở frontend.
2. Axios interceptor gửi token cho API; backend authentication giải mã token và role guard kiểm tra `USER` hoặc `ADMIN`.
3. `USER` dùng giao diện thuê xe, booking, thanh toán, hợp đồng, thông báo và hỗ trợ.
4. `ADMIN` dùng dashboard quản trị, duyệt xe/người dùng và hỗ trợ.
5. Route owner/private-owner dùng layout quản lý riêng; không dùng popup recommendation của Header customer.

**Test:** đăng nhập từng role; thử gọi API của role khác; kiểm tra route bị redirect/403 và dữ liệu không lộ giữa người dùng.

## 2. Xe ký gửi và duyệt xe

1. `USER` tạo/cập nhật hồ sơ xe, giá, lịch, địa điểm và ảnh.
2. Xe mới đi qua trạng thái chờ duyệt; `ADMIN` duyệt/từ chối.
3. Chỉ xe công khai, không xóa mềm/ẩn và ở status cho thuê mới xuất hiện trong search.
4. Owner xem danh sách xe, booking, doanh thu, đánh giá và vị trí trong dashboard ký gửi.

**Test:** tạo xe thiếu dữ liệu, duyệt/từ chối, ẩn/xóa mềm, kiểm tra search và owner dashboard.

## 3. Tìm kiếm và availability

1. Người thuê chọn ngày/giờ, hình thức `DAILY` hoặc `HOURLY`, địa điểm và bộ lọc.
2. Search gọi pricing/availability hiện có.
3. Availability tôn trọng booking conflict, buffer nhận booking 3 giờ, cleaning buffer 1 giờ, cart hold và extension hold.
4. Kết quả chỉ hiển thị xe phù hợp mode, giá và trạng thái công khai.

**Test:** đặt lịch sát booking khác, sát thời gian cleaning, có cart hold/extension hold; xác nhận Search và API booking cho cùng kết quả.

## 4. Booking mới

1. Từ Search/Car Detail, frontend truyền `carId`, `startDate`, `endDate`, `rentalMode`, delivery/pickup và payment option vào `BookingRequestPage`.
2. Backend quote lại giá và availability; không tin tổng tiền do client gửi.
3. Submit tạo booking trạng thái `REQUESTED`; owner nhận notification.
4. Booking chưa được tạo khi người dùng chỉ xem modal hoặc chỉ mở form.

**Test:** submit hợp lệ, thiếu hồ sơ, thời gian sai, xe vừa bị đặt, đổi mode; kiểm tra booking chỉ xuất hiện sau submit.

## 5. Owner duyệt hoặc từ chối booking

1. Owner mở danh sách booking xe của mình.
2. Với booking `REQUESTED`, owner xác nhận hoặc từ chối kèm lý do.
3. Từ chối cập nhật `status = REJECTED`, lưu `cancelReason`, gửi mail và notification cho renter.
4. Không được owner khác hoặc renter khác thao tác booking không thuộc mình.

**Test:** duyệt/từ chối đúng owner; lý do rỗng; gọi API bằng user khác; kiểm tra status, reason, mail và notification.

## 6. Gợi ý xe thay thế sau khi bị từ chối

1. `GET /api/bookings/:id/recommended-car` chỉ cho renter sở hữu booking.
2. Chỉ booking `REJECTED` mới được tính recommendation; dữ liệu được tính động, không có collection mới.
3. Candidate loại xe cũ, xe của chính renter, xe ẩn/xóa/chưa duyệt, sai số chỗ, sai rental mode, sai khoảng giá ±20%.
4. Candidate phải còn trống đúng lịch qua `assertCarAvailability` hiện có.
5. Xếp TOP1 theo chênh lệch rental subtotal nhỏ nhất, sau đó rating/review count và id ổn định.
6. Socket `/notifications` phát event sau khi notification được lưu. Frontend customer Header gọi API rồi mở modal tối đa 60 giây.
7. Modal không giữ xe, không tạo cart/booking; nút đặt xe chỉ prefill flow hiện có. Notification offline có link mở lại recommendation và tính lại tại thời điểm bấm.

Chi tiết API, modal và 20 test case xem [PHASE_D_REJECTED_BOOKING_RECOMMENDATION.md](PHASE_D_REJECTED_BOOKING_RECOMMENDATION.md).

## 7. Thanh toán, hoàn tiền và hợp đồng

1. Owner duyệt xong, renter thanh toán theo payment option hiện có.
2. Backend lưu payment/pricing snapshot; redirect/callback cập nhật trạng thái server-side.
3. Hủy booking dùng cancellation policy hiện có; nếu đủ điều kiện tạo refund.
4. Booking đủ điều kiện tạo contract; contract theo dõi ký, thanh toán và bàn giao.

**Test:** thanh toán success/fail/callback lặp, hủy trước và sau mốc policy, refund, contract không tạo trùng.

## 8. Bàn giao, chuyến thuê, trả xe và phí phát sinh

1. Chỉ booking đúng trạng thái và đúng participant mới được handover.
2. Handover kiểm tra thời gian, xe, giấy tờ/ảnh và cập nhật trạng thái chuyến.
3. Return inspection ghi nhận tình trạng xe; extra charge đi qua trạng thái pending/approved/paid/cancelled hiện có.
4. Hoàn tất chuyến cập nhật booking, payment, contract và thông báo liên quan.

**Test:** thao tác sớm, thao tác sai role, thiếu ảnh/biên bản, phí phát sinh, thanh toán phí và hoàn tất chuyến.

## 9. Gia hạn và chuyển gói

1. Renter gửi extension/plan conversion từ booking đang chạy.
2. Backend kiểm tra availability, pricing snapshot và thời hạn thanh toán.
3. Owner duyệt/từ chối; thanh toán thành công mới áp dụng thời gian/gói mới.
4. Hết hạn thanh toán giữ lịch cũ và phát notification.

**Test:** overlap lịch, duyệt rồi hết hạn, thanh toán lặp, từ chối và kiểm tra lịch cũ.

## 10. Thông báo, chat và hỗ trợ

1. Notification lưu trong collection hiện có, có `bookingId`, `carId`, `actionUrl`, metadata và dedupe key.
2. NotificationBell lấy danh sách/unread, đánh dấu đọc và điều hướng action URL.
3. Booking chat dùng socket và kiểm tra participant; support chat dùng luồng hỗ trợ riêng.
4. Admin có trang xử lý support; customer có panel hỗ trợ trong Header.

**Test:** notification đúng recipient, dedupe, action URL, reconnect socket, user không thuộc booking không đọc/gửi được chat.

## UI còn thiếu hoặc cần xác nhận

- Full backend type-check hiện còn 6 lỗi legacy trong `business.route.ts` do enum `BUSINESS` đã bị loại bỏ; đây không phải lỗi của recommendation.
- Frontend lint còn lỗi tồn tại từ codebase (setState trong effect, fast-refresh, biến auth chưa dùng); build frontend vẫn đạt.
- Cần QA thủ công responsive modal recommendation trên desktop/mobile và xác nhận notification offline sau refresh.
- Không phát hiện UI customer nào cần thêm popup ngoài Header; admin/consignment/owner/private-owner chỉ giữ notification.

## Lệnh kiểm tra

```powershell
cd frontend
npm run build

cd ..\backend
npx tsc --noEmit
```

Recommendation-related type-check riêng và 20 test case được ghi trong báo cáo Phase D.
