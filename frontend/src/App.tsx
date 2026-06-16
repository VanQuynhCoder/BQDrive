import { Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import ServicesPage from "./pages/ServicesPage";
import CarDetailPage from "./pages/CarDetailPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CartPage from "./pages/CartPage";
import BookingDetailPage from "./pages/BookingDetailPage";
import PaymentPage from "./pages/PaymentPage";
import BecomePrivateOwnerPage from "./pages/customer/BecomePrivateOwnerPage";
import MyContractsPage from "./pages/customer/MyContractsPage";
import ContractDetailPage from "./pages/customer/ContractDetailPage";
import MyPaymentsPage from "./pages/customer/MyPaymentsPage";

import ProtectedRoute from "./routes/ProtectedRoute";

import AdminLayout from "./layouts/AdminLayout";
import BusinessLayout from "./layouts/BusinessLayout";
import PrivateOwnerLayout from "./layouts/PrivateOwnerLayout";

import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminBusinessesPage from "./pages/admin/AdminBusinessesPage";
import AdminPrivateOwnerRequestsPage from "./pages/admin/AdminPrivateOwnerRequestsPage";
import AdminBrandsPage from "./pages/admin/AdminBrandsPage";
import AdminCarsPage from "./pages/admin/AdminCarsPage";
import BusinessDashboardPage from "./pages/business/BusinessDashboardPage";
import BusinessCarsPage from "./pages/business/BusinessCarsPage";
import BusinessBookingsPage from "./pages/business/BusinessBookingsPage";
import BusinessPaymentsPage from "./pages/business/BusinessPaymentsPage";
import BusinessProfilePage from "./pages/business/BusinessProfilePage";
import PrivateOwnerDashboardPage from "./pages/private-owner/PrivateOwnerDashboardPage";
import PrivateOwnerCarsPage from "./pages/private-owner/PrivateOwnerCarsPage";
import PrivateOwnerBookingsPage from "./pages/private-owner/PrivateOwnerBookingsPage";
import PrivateOwnerPaymentsPage from "./pages/private-owner/PrivateOwnerPaymentsPage";
import PrivateOwnerProfilePage from "./pages/private-owner/PrivateOwnerProfilePage";
import PaymentResultPage from "./pages/PaymentResultPage";

function App() {
  const renterRoles = ["CUSTOMER", "PRIVATE_OWNER"];

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<HomePage />} />

      <Route path="/services" element={<ServicesPage />} />

      <Route path="/cars/:id" element={<CarDetailPage />} />

      <Route path="/login" element={<LoginPage />} />

      <Route path="/register" element={<RegisterPage />} />

      {/* Customer */}
      <Route
        path="/cart"
        element={
          <ProtectedRoute roles={renterRoles}>
            <CartPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/bookings/:id"
        element={
          <ProtectedRoute roles={renterRoles}>
            <BookingDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/bookings/:id/payment"
        element={
          <ProtectedRoute roles={renterRoles}>
            <PaymentPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-contracts"
        element={
          <ProtectedRoute roles={["CUSTOMER", "PRIVATE_OWNER"]}>
            <MyContractsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/contracts/:id"
        element={
          <ProtectedRoute roles={["CUSTOMER", "PRIVATE_OWNER"]}>
            <ContractDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-payments"
        element={
          <ProtectedRoute roles={["CUSTOMER", "PRIVATE_OWNER"]}>
            <MyPaymentsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/become-private-owner"
        element={
          <ProtectedRoute roles={["CUSTOMER"]}>
            <BecomePrivateOwnerPage />
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
        <Route path="bookings" element={<BusinessBookingsPage />} />
        <Route path="payments" element={<BusinessPaymentsPage />} />
        <Route path="profile" element={<BusinessProfilePage />} />
      </Route>

      {/* Private Owner */}
      <Route
        path="/private-owner"
        element={
          <ProtectedRoute roles={["PRIVATE_OWNER"]}>
            <PrivateOwnerLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PrivateOwnerDashboardPage />} />
        <Route path="cars" element={<PrivateOwnerCarsPage />} />
        <Route path="bookings" element={<PrivateOwnerBookingsPage />} />
        <Route path="payments" element={<PrivateOwnerPaymentsPage />} />
        <Route path="profile" element={<PrivateOwnerProfilePage />} />
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

        <Route
          path="private-owner-requests"
          element={<AdminPrivateOwnerRequestsPage />}
        />

        <Route path="brands" element={<AdminBrandsPage />} />

        <Route path="cars" element={<AdminCarsPage />} />
      </Route>
      <Route
  path="/payment-result"
  element={
    <ProtectedRoute roles={["CUSTOMER", "PRIVATE_OWNER"]}>
      <PaymentResultPage />
    </ProtectedRoute>
  }
/>
    </Routes>
    
  );
}

export default App;
