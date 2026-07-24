import { Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import AboutPage from "./pages/AboutPage";
import ServicesPage from "./pages/ServicesPage";
import ContactPartnersPage from "./pages/ContactPartnersPage";
import SearchResultsPage from "./pages/SearchResultsPage";
import CarDetailPage from "./pages/CarDetailPage";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import RegisterPage from "./pages/RegisterPage";
import CancellationPolicyPage from "./pages/CancellationPolicyPage";
import CartPage from "./pages/CartPage";
import BookingRequestPage from "./pages/BookingRequestPage";
import BookingDetailPage from "./pages/BookingDetailPage";
import PaymentPage from "./pages/PaymentPage";
import MyContractsPage from "./pages/customer/MyContractsPage";
import ContractDetailPage from "./pages/customer/ContractDetailPage";
import MyPaymentsPage from "./pages/customer/MyPaymentsPage";
import UserProfilePage from "./pages/customer/UserProfilePage";

import ProtectedRoute from "./routes/ProtectedRoute";

import AdminLayout from "./layouts/AdminLayout";
import BusinessLayout from "./layouts/BusinessLayout";
import PrivateOwnerLayout from "./layouts/PrivateOwnerLayout";

import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminBusinessesPage from "./pages/admin/AdminBusinessesPage";
import AdminBrandsPage from "./pages/admin/AdminBrandsPage";
import AdminCarsPage from "./pages/admin/AdminCarsPage";
import AdminCarMapPage from "./pages/admin/AdminCarMapPage";
import AdminHolidaysPage from "./pages/admin/AdminHolidaysPage";
import BusinessDashboardPage from "./pages/business/BusinessDashboardPage";
import BusinessCarsPage from "./pages/business/BusinessCarsPage";
import BusinessBookingsPage from "./pages/business/BusinessBookingsPage";
import BusinessPaymentsPage from "./pages/business/BusinessPaymentsPage";
import BusinessProfilePage from "./pages/business/BusinessProfilePage";
import PrivateOwnerDashboardPage from "./pages/private-owner/PrivateOwnerDashboardPage";
import PrivateOwnerCarsPage from "./pages/private-owner/PrivateOwnerCarsPage";
import PrivateOwnerBookingsPage from "./pages/private-owner/PrivateOwnerBookingsPage";
import PrivateOwnerPaymentsPage from "./pages/private-owner/PrivateOwnerPaymentsPage";
import OwnerBookingHistoryPage from "./pages/owner/OwnerBookingHistoryPage";
import OwnerCarLocationPage from "./pages/owner/OwnerCarLocationPage";
import OwnerRefundsPage from "./pages/owner/OwnerRefundsPage";
import OwnerReviewsPage from "./pages/owner/OwnerReviewsPage";
import TaskCenterPage from "./pages/tasks/TaskCenterPage";
import NotificationCenterPage from "./pages/notifications/NotificationCenterPage";
import PaymentResultPage from "./pages/PaymentResultPage";

function App() {
  const userRoles = ["USER"];

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<HomePage />} />

      <Route path="/about" element={<AboutPage />} />

      <Route path="/services" element={<ServicesPage />} />

      <Route path="/contact" element={<ContactPartnersPage />} />

      <Route path="/cars/search" element={<SearchResultsPage />} />

      <Route path="/cars/:id" element={<CarDetailPage />} />

      <Route path="/login" element={<LoginPage />} />

      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/policies/cancellation-refund"
        element={<CancellationPolicyPage />}
      />

      {/* Customer */}
      <Route
        path="/cart"
        element={
          <ProtectedRoute roles={userRoles}>
            <CartPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/bookings/:id"
        element={
          <ProtectedRoute roles={userRoles}>
            <BookingDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/booking-request"
        element={
          <ProtectedRoute roles={userRoles}>
            <BookingRequestPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/bookings/:id/payment"
        element={
          <ProtectedRoute roles={userRoles}>
            <PaymentPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/tasks"
        element={
          <ProtectedRoute roles={userRoles}>
            <TaskCenterPage
              context="customer"
              title="Việc cần làm"
              subtitle="Theo dõi các booking cần thanh toán, chuyến thuê sắp trả xe, phí phát sinh và đánh giá sau chuyến thuê."
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedRoute roles={["USER", "BUSINESS", "ADMIN"]}>
            <NotificationCenterPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedRoute roles={userRoles}>
            <UserProfilePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-contracts"
        element={
          <ProtectedRoute roles={userRoles}>
            <MyContractsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/contracts/:id"
        element={
          <ProtectedRoute roles={userRoles}>
            <ContractDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-payments"
        element={
          <ProtectedRoute roles={userRoles}>
            <MyPaymentsPage />
          </ProtectedRoute>
        }
      />

      {/* Business */}
      <Route
        path="/business"
        element={
          <ProtectedRoute roles={["BUSINESS"]}>
            <BusinessLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<BusinessDashboardPage />} />
        <Route
          path="tasks"
          element={
            <TaskCenterPage
              context="business"
              title="Việc cần làm"
              subtitle="Tập trung các booking, xe và phí phát sinh cần doanh nghiệp xử lý."
              embedded
            />
          }
        />
        <Route
          path="notifications"
          element={
            <NotificationCenterPage
              title="Thông báo doanh nghiệp"
              subtitle="Lưu lại các sự kiện booking, thanh toán, xe, phí phát sinh và đánh giá của doanh nghiệp."
              embedded
            />
          }
        />
        <Route path="cars" element={<BusinessCarsPage />} />
        <Route
          path="map"
          element={
            <OwnerCarLocationPage
              title="Quản lý vị trí xe"
              subtitle="Theo dõi và cập nhật vị trí nhận xe của toàn bộ xe doanh nghiệp trên bản đồ."
              emptyText="Bạn chưa có xe nào để quản lý vị trí."
            />
          }
        />
        <Route path="bookings" element={<BusinessBookingsPage />} />
        <Route
          path="booking-history"
          element={
            <OwnerBookingHistoryPage
              title="Lịch sử booking"
              subtitle="Xem lại toàn bộ booking phát sinh từ xe doanh nghiệp, bao gồm booking hoàn tất, hủy, từ chối và no-show."
              carColumnLabel="Xe"
            />
          }
        />
        <Route path="payments" element={<BusinessPaymentsPage />} />
        <Route
          path="refunds"
          element={
            <OwnerRefundsPage
              title="Quản lý hoàn tiền"
              subtitle="Xử lý các hồ sơ hoàn tiền thủ công phát sinh sau khi booking bị hủy."
            />
          }
        />
        <Route
          path="reviews"
          element={
            <OwnerReviewsPage
              title="Đánh giá xe doanh nghiệp"
              subtitle="Theo dõi nhận xét khách thuê để cải thiện chất lượng xe và dịch vụ bàn giao."
            />
          }
        />
        <Route path="profile" element={<BusinessProfilePage />} />
      </Route>

      {/* User consignment */}
      <Route
        path="/consignment"
        element={
          <ProtectedRoute roles={["USER"]}>
            <PrivateOwnerLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PrivateOwnerDashboardPage />} />
        <Route
          path="tasks"
          element={
            <TaskCenterPage
              context="consignment"
              title="Việc cần làm"
              subtitle="Tập trung các xe ký gửi, booking và phí phát sinh cần bạn xử lý."
              embedded
            />
          }
        />
        <Route
          path="notifications"
          element={
            <NotificationCenterPage
              title="Thông báo xe ký gửi"
              subtitle="Theo dõi các thông báo liên quan tới xe ký gửi, booking, thanh toán, phí phát sinh và đánh giá."
              embedded
            />
          }
        />
        <Route path="cars" element={<PrivateOwnerCarsPage />} />
        <Route
          path="map"
          element={
            <OwnerCarLocationPage
              title="Bản đồ xe ký gửi của tôi"
              subtitle="Quản lý vị trí nhận xe cho các xe ký gửi thuộc tài khoản của bạn."
              emptyText="Bạn chưa có xe ký gửi nào để quản lý vị trí."
            />
          }
        />
        <Route path="bookings" element={<PrivateOwnerBookingsPage />} />
        <Route
          path="booking-history"
          element={
            <OwnerBookingHistoryPage
              title="Lịch sử booking xe ký gửi"
              subtitle="Xem lại các booking phát sinh từ xe ký gửi của bạn, tách riêng với lịch sử bạn đi thuê xe."
              carColumnLabel="Xe ký gửi"
            />
          }
        />
        <Route path="payments" element={<PrivateOwnerPaymentsPage />} />
        <Route
          path="refunds"
          element={
            <OwnerRefundsPage
              title="Hoàn tiền xe ký gửi"
              subtitle="Theo dõi và xác nhận hoàn tiền cho các booking thuộc xe ký gửi của bạn."
            />
          }
        />
        <Route
          path="reviews"
          element={
            <OwnerReviewsPage
              title="Đánh giá xe ký gửi"
              subtitle="Xem phản hồi của khách thuê dành cho các xe ký gửi thuộc tài khoản của bạn."
            />
          }
        />
      </Route>

      {/* Admin */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route
          path="tasks"
          element={
            <TaskCenterPage
              context="admin"
              title="Việc cần làm"
              subtitle="Tập trung các hồ sơ cần admin kiểm duyệt, chỉ gồm các thao tác đúng quyền quản trị."
              embedded
            />
          }
        />
        <Route
          path="notifications"
          element={
            <NotificationCenterPage
              title="Thông báo quản trị"
              subtitle="Theo dõi các thông báo hệ thống dành cho tài khoản quản trị."
              embedded
            />
          }
        />

        <Route path="users" element={<AdminUsersPage />} />

        <Route
          path="businesses"
          element={<AdminBusinessesPage />}
        />

        <Route path="brands" element={<AdminBrandsPage />} />

        <Route path="cars" element={<AdminCarsPage />} />

        <Route path="car-map" element={<AdminCarMapPage />} />

        <Route path="holidays" element={<AdminHolidaysPage />} />
      </Route>
      <Route
  path="/payment-result"
  element={
    <ProtectedRoute roles={userRoles}>
      <PaymentResultPage />
    </ProtectedRoute>
  }
/>
    </Routes>
    
  );
}

export default App;


