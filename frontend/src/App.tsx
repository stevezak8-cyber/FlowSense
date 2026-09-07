import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { RequireAuth } from "./auth/require-auth";
import { useNotifications } from "@/lib/websocket";
import { UpdatePrompt } from "@/components/pwa/UpdatePrompt";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { initSyncManager } from "@/lib/sync-manager";
import { Loader2 } from "lucide-react";

// Pages loaded on first paint — kept eager so the marketing site and auth
// flows render immediately with no extra network round trip.
import LoginPage from "./pages/LoginPage";
import LandingPage from "./pages/LandingPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import InvitePage from "./pages/InvitePage";
import TermsOfServicePage from "./pages/legal/TermsOfServicePage";
import PrivacyPolicyPage from "./pages/legal/PrivacyPolicyPage";
import NotFoundPage from "./pages/NotFoundPage";

// Everything below is role-gated, so it's only ever needed after a visitor
// has signed in as that role — code-split so a customer never downloads the
// office dashboard's bundle (FullCalendar, revenue charts, etc.) and vice versa.

// Office
const OfficeLayout = lazy(() => import("./pages/office/OfficeLayout"));
const OfficeDashboard = lazy(() => import("./pages/office/OfficeDashboard"));
const OfficeJobs = lazy(() => import("./pages/office/OfficeJobs"));
const OfficeTechnicians = lazy(() => import("./pages/office/OfficeTechnicians"));
const OfficeCustomers = lazy(() => import("./pages/office/OfficeCustomers"));
const OfficeMessages = lazy(() => import("./pages/office/OfficeMessages"));
const OfficeRevenue = lazy(() => import("./pages/office/OfficeRevenue"));
const OfficeSchedule = lazy(() => import("./pages/office/OfficeSchedule"));
const OfficeSettings = lazy(() => import("./pages/office/OfficeSettings"));
const OfficeCompliance = lazy(() => import("./pages/office/OfficeCompliance"));
const MaintenancePlans = lazy(() =>
  import("./pages/office/MaintenancePlans").then((m) => ({ default: m.MaintenancePlans }))
);

// Technician
const TechnicianLayout = lazy(() => import("./pages/technician/TechnicianLayout"));
const TechnicianJobs = lazy(() => import("./pages/technician/TechnicianJobs"));
const TechnicianMap = lazy(() => import("./pages/technician/TechnicianMap"));
const TechnicianMessages = lazy(() => import("./pages/technician/TechnicianMessages"));
const TechnicianProfile = lazy(() => import("./pages/technician/TechnicianProfile"));

// Customer
const CustomerLayout = lazy(() => import("./pages/customer/CustomerLayout"));
const CustomerDashboard = lazy(() => import("./pages/customer/CustomerDashboard"));
const CustomerBook = lazy(() => import("./pages/customer/CustomerBook"));
const CustomerInvoices = lazy(() => import("./pages/customer/CustomerInvoices"));
const CustomerMessages = lazy(() => import("./pages/customer/CustomerMessages"));
const CustomerEstimate = lazy(() => import("./pages/customer/CustomerEstimate"));
const CustomerEquipment = lazy(() => import("./pages/customer/CustomerEquipment"));
const CustomerAccount = lazy(() => import("./pages/customer/CustomerAccount"));
const CustomerHistory = lazy(() => import("./pages/customer/CustomerHistory"));
const CustomerMaintenancePlans = lazy(() => import("./pages/customer/CustomerMaintenancePlans"));

function RouteLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function App() {
  useNotifications();

  useEffect(() => {
    initSyncManager()
  }, [])

  return (
    <>
      <UpdatePrompt />
      <OfflineIndicator />
      <Suspense fallback={<RouteLoader />}>
      <Routes>
      {/* Auth — public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

      {/* Invite accept — public, no auth required */}
      <Route path="/invite/:token" element={<InvitePage />} />

      {/* Signup alias */}
      <Route path="/signup" element={<Navigate to="/register" replace />} />

      {/* Landing page */}
      <Route path="/" element={<LandingPage />} />

      {/* Legal — public */}
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />

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
        <Route path="schedule" element={<OfficeSchedule />} />
        <Route path="jobs" element={<OfficeJobs />} />
        <Route path="technicians" element={<OfficeTechnicians />} />
        <Route path="customers" element={<OfficeCustomers />} />
        <Route path="messages" element={<OfficeMessages />} />
        <Route path="reports" element={<OfficeRevenue />} />
        <Route path="compliance" element={<OfficeCompliance />} />
        <Route path="maintenance" element={<MaintenancePlans />} />
        <Route path="settings" element={<OfficeSettings />} />
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
        <Route path="equipment" element={<CustomerEquipment />} />
        <Route path="history" element={<CustomerHistory />} />
        <Route path="account" element={<CustomerAccount />} />
        <Route path="plans" element={<CustomerMaintenancePlans />} />
      </Route>

      {/* Customer estimate approval — public, no auth required */}
      <Route path="/customer/estimates/:token" element={<CustomerEstimate />} />

      {/* Catch-all — unknown routes get a real 404, not a silent redirect */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
    </>
  );
}

export default App;
