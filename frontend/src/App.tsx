import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth } from "./auth/require-auth";

// Pages
import LoginPage from "./pages/LoginPage";

// Office
import OfficeLayout from "./pages/office/OfficeLayout";
import OfficeDashboard from "./pages/office/OfficeDashboard";
import OfficeJobs from "./pages/office/OfficeJobs";
import OfficeTechnicians from "./pages/office/OfficeTechnicians";
import OfficeCustomers from "./pages/office/OfficeCustomers";
import OfficeMessages from "./pages/office/OfficeMessages";
import OfficeRevenue from "./pages/office/OfficeRevenue";

// Technician
import TechnicianLayout from "./pages/technician/TechnicianLayout";
import TechnicianJobs from "./pages/technician/TechnicianJobs";
import TechnicianMap from "./pages/technician/TechnicianMap";
import TechnicianMessages from "./pages/technician/TechnicianMessages";
import TechnicianProfile from "./pages/technician/TechnicianProfile";

// Customer
import CustomerLayout from "./pages/customer/CustomerLayout";
import CustomerDashboard from "./pages/customer/CustomerDashboard";
import CustomerBook from "./pages/customer/CustomerBook";
import CustomerInvoices from "./pages/customer/CustomerInvoices";
import CustomerMessages from "./pages/customer/CustomerMessages";

function App() {
  return (
    <Routes>
      {/* Login */}
      <Route path="/login" element={<LoginPage />} />

      {/* Root redirects to login */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Office Dashboard — requires office role */}
      <Route
        path="/office"
        element={
          <RequireAuth role="office">
            <OfficeLayout />
          </RequireAuth>
        }
      >
        <Route index element={<OfficeDashboard />} />
        <Route path="jobs" element={<OfficeJobs />} />
        <Route path="technicians" element={<OfficeTechnicians />} />
        <Route path="customers" element={<OfficeCustomers />} />
        <Route path="messages" element={<OfficeMessages />} />
        <Route path="reports" element={<OfficeRevenue />} />
      </Route>

      {/* Technician Dashboard — requires technician role */}
      <Route
        path="/technician"
        element={
          <RequireAuth role="technician">
            <TechnicianLayout />
          </RequireAuth>
        }
      >
        <Route index element={<TechnicianJobs />} />
        <Route path="map" element={<TechnicianMap />} />
        <Route path="messages" element={<TechnicianMessages />} />
        <Route path="profile" element={<TechnicianProfile />} />
      </Route>

      {/* Customer Dashboard — requires customer role */}
      <Route
        path="/customer"
        element={
          <RequireAuth role="customer">
            <CustomerLayout />
          </RequireAuth>
        }
      >
        <Route index element={<CustomerDashboard />} />
        <Route path="book" element={<CustomerBook />} />
        <Route path="invoices" element={<CustomerInvoices />} />
        <Route path="messages" element={<CustomerMessages />} />
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
