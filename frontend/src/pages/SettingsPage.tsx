import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useOrgName } from '../lib/useOrgName';
import { disablePush, enablePush, isPushOn, showPush, supportsPush } from '../lib/push';

function ChangePassword() {
  const navigate = useNavigate();
  const logout = useAuth((s) => s.logout);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: async () => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: async () => {
      // All sessions are revoked server-side — sign out and re-authenticate.
      await logout();
      navigate('/login');
    },
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setError('Current password is incorrect.');
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError('New password must be 8+ chars with an uppercase letter, a lowercase letter, and a number.');
      } else {
        setError('Could not change the password. Please try again.');
      }
    },
  });

  function submit() {
    setError(null);
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    change.mutate();
  }

  return (
    <div className="stat-tile" style={{ marginBottom: 12 }}>
      <strong>Change password</strong>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 10px' }}>
        Changing your password signs you out of every device.
      </div>
      <div className="field" style={{ maxWidth: 320 }}>
        <label>Current password</label>
        <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="field-row" style={{ maxWidth: 480 }}>
        <div className="field">
          <label>New password</label>
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="8+ chars, upper, lower, number" />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button
        className="btn btn-primary"
        disabled={change.isPending || !current || !next || !confirm}
        onClick={submit}
      >
        {change.isPending ? 'Changing…' : 'Change password'}
      </button>
    </div>
  );
}

function OrgSettings() {
  const qc = useQueryClient();
  const orgName = useOrgName();
  const [name, setName] = useState(orgName);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: async () => (await api.patch('/config', { name: name.trim() })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  return (
    <div className="stat-tile" style={{ marginBottom: 12 }}>
      <strong>Organization name</strong>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 10px' }}>
        Shown on the login screen and in the sidebar.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <button
          className="btn btn-primary"
          disabled={save.isPending || name.trim().length < 2 || name.trim() === orgName}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {saved && <div style={{ fontSize: 12, color: 'var(--s-completed)', marginTop: 8 }}>Saved.</div>}
    </div>
  );
}

export function SettingsPage() {
  const isSuper = useAuth((s) => s.user?.systemRole) === 'SUPER_ADMIN';
  const [on, setOn] = useState(isPushOn());
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle() {
    if (on) {
      disablePush();
      setOn(false);
      setMsg('Desktop notifications turned off.');
      return;
    }
    const ok = await enablePush();
    setOn(ok);
    setMsg(
      ok
        ? 'Desktop notifications enabled.'
        : 'Permission denied — allow notifications for this site in your browser settings.',
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="group-head" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Settings</h2>
      </div>

      {isSuper && <OrgSettings />}

      <ChangePassword />

      <div className="stat-tile" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <strong>Desktop notifications</strong>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Show a browser notification when you receive an alert (mentions, assignments, grades, announcements)
              while the app is open.
            </div>
          </div>
          <button className={`btn ${on ? 'btn-ghost' : 'btn-primary'}`} onClick={toggle} disabled={!supportsPush()}>
            {on ? 'Turn off' : 'Enable'}
          </button>
        </div>
        {!supportsPush() && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>
            This browser does not support notifications.
          </div>
        )}
        {on && (
          <button
            className="btn btn-ghost"
            style={{ marginTop: 10, fontSize: 12 }}
            onClick={() => showPush('Test notification', 'This is what alerts will look like.')}
          >
            Send a test notification
          </button>
        )}
        {msg && <div style={{ fontSize: 12, color: 'var(--s-completed)', marginTop: 8 }}>{msg}</div>}
      </div>

      <div className="stat-tile">
        <strong>Email notifications</strong>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          High-signal alerts (assignments, grades, announcements) are also sent by email when the server has SMTP
          configured. Ask your administrator to set the <code>SMTP_*</code> environment variables to enable delivery.
        </div>
      </div>
    </div>
  );
}
