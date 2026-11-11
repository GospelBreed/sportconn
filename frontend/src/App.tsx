import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LeadsPage } from "@/pages/LeadsPage";
import { PipelinePage } from "@/pages/PipelinePage";
import { SponsorsPage } from "@/pages/SponsorsPage";
import { InvestorsPage } from "@/pages/InvestorsPage";
import { PartnersPage } from "@/pages/PartnersPage";
import { UserAcquisitionPage } from "@/pages/UserAcquisitionPage";
import { FacilitiesPage } from "@/pages/FacilitiesPage";
import { FacilityDetailPage } from "@/pages/FacilityDetailPage";
import { CaptainsPage } from "@/pages/CaptainsPage";
import { ActivitiesPage } from "@/pages/ActivitiesPage";
import { TasksPage } from "@/pages/TasksPage";
import { CampaignsPage } from "@/pages/CampaignsPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { EmailQueuePage } from "@/pages/EmailQueuePage";
import { EngineDashboardPage } from "@/pages/EngineDashboardPage";
import { UnsubscribePage } from "@/pages/UnsubscribePage";

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const { session, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? (
            <FullScreenLoader />
          ) : session ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/sponsors" element={<SponsorsPage />} />
        <Route path="/email-review" element={<EmailQueuePage />} />
        <Route path="/engine" element={<EngineDashboardPage />} />
        <Route path="/investors" element={<InvestorsPage />} />
        <Route path="/partners" element={<PartnersPage />} />
        <Route path="/user-acquisition" element={<UserAcquisitionPage />} />
        <Route path="/facilities" element={<FacilitiesPage />} />
        <Route path="/facilities/:id" element={<FacilityDetailPage />} />
        <Route path="/captains" element={<CaptainsPage />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/followups" element={<Navigate to="/tasks" replace />} />
      </Route>
      {/* public: the unsubscribe link in queue emails (no login) */}
      <Route path="/unsubscribe" element={<UnsubscribePage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
