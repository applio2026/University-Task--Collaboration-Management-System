import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth, touchActivity, isIdleExpired } from './store/auth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ClusterPage } from './pages/ClusterPage';
import { WorkspacePage } from './pages/WorkspacePage';
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

// Auto-logout after IDLE_LIMIT_MS of inactivity (8h). User interaction resets the timer
// (throttled); a short poll checks whether the idle limit has been exceeded and,
// if so, logs out and returns to the login screen.
function useIdleLogout(active: boolean) {
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  useEffect(() => {
    if (!active) return;
    touchActivity();

    let lastWrite = Date.now();
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite > 5000) {
        lastWrite = now;
        touchActivity();
      }
    };
    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const interval = window.setInterval(() => {
      if (isIdleExpired()) {
        void logout().finally(() => navigate('/login', { replace: true }));
      }
    }, 10_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(interval);
    };
  }, [active, logout, navigate]);
}

export default function App() {
  const { status, bootstrap, user } = useAuth();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useIdleLogout(status === 'authenticated');

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
        <Route path="/workspaces/:workspaceId" element={<WorkspacePage />} />
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
