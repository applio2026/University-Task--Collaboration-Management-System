import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ClusterPage } from './pages/ClusterPage';
import { SpacePage } from './pages/SpacePage';
import { DashboardPage } from './pages/DashboardPage';
import { CalendarPage } from './pages/CalendarPage';
import { ReportsPage } from './pages/ReportsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { ArchivePage } from './pages/ArchivePage';
import { SettingsPage } from './pages/SettingsPage';

function FullScreenLoader() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  );
}

export default function App() {
  const { status, bootstrap, user } = useAuth();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (status === 'idle' || status === 'loading') return <FullScreenLoader />;

  if (status === 'unauthenticated') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/spaces/:spaceId" element={<SpacePage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/clusters/:clusterId" element={<ClusterPage />} />
        <Route path="/tasks/:taskId" element={<OverviewPage />} />
        {user?.systemRole === 'SUPER_ADMIN' && (
          <Route path="/admin/users" element={<AdminUsersPage />} />
        )}
        {user?.systemRole === 'SUPER_ADMIN' && (
          <Route path="/admin/audit" element={<AuditLogPage />} />
        )}
        {user?.systemRole === 'SUPER_ADMIN' && (
          <Route path="/admin/templates" element={<TemplatesPage />} />
        )}
        {user?.systemRole === 'SUPER_ADMIN' && (
          <Route path="/admin/archive" element={<ArchivePage />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
