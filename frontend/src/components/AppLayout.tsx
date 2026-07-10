import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { GlobalSearch } from './GlobalSearch';
import { getSocket } from '../lib/socket';
import { showPush } from '../lib/push';
import { useAuth } from '../store/auth';
import './layout.css';

export function AppLayout() {
  const user = useAuth((s) => s.user);
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light',
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Live in-app notifications toast.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (n: { title: string; body?: string }) => {
      setToast(n.title);
      showPush(n.title, n.body);
      setTimeout(() => setToast(null), 4000);
    };
    socket.on('notification:new', handler);
    return () => {
      socket.off('notification:new', handler);
    };
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        {user?.mustChangePassword && (
          <div className="pw-banner">
            🔑 You are using a temporary password — please{' '}
            <Link to="/settings" style={{ color: 'inherit', fontWeight: 700 }}>
              change it now
            </Link>
            .
          </div>
        )}
        <header className="topbar">
          <div className="topbar-title">Overview</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <GlobalSearch />
            <button
              className="btn btn-ghost"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              title="Toggle theme"
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </header>
        <div className="app-content scroll-y">
          <Outlet />
        </div>
      </div>
      {toast && <div className="toast">🔔 {toast}</div>}
    </div>
  );
}
