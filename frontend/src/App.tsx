import { Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import AboutPage from "./pages/AboutPage";
import ServicesPage from "./pages/ServicesPage";
import SearchResultsPage from "./pages/SearchResultsPage";
import CarDetailPage from "./pages/CarDetailPage";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import RegisterPage from "./pages/RegisterPage";
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
import OwnerReviewsPage from "./pages/owner/OwnerReviewsPage";
import PaymentResultPage from "./pages/PaymentResultPage";

function App() {
  const userRoles = ["USER"];

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<HomePage />} />

      <Route path="/about" element={<AboutPage />} />

      <Route path="/services" element={<ServicesPage />} />

      <Route path="/cars/search" element={<SearchResultsPage />} />

      <Route path="/cars/:id" element={<CarDetailPage />} />

      <Route path="/login" element={<LoginPage />} />

      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route path="/register" element={<RegisterPage />} />

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

        <Route path="users" element={<AdminUsersPage />} />

        <Route
          path="businesses"
          element={<AdminBusinessesPage />}
        />

        <Route path="brands" element={<AdminBrandsPage />} />

        <Route path="cars" element={<AdminCarsPage />} />

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


