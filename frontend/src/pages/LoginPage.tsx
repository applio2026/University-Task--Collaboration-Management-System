import { FormEvent, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useOrgName } from '../lib/useOrgName';

export function LoginPage() {
  const login = useAuth((s) => s.login);
  const orgName = useOrgName();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [captcha, setCaptcha] = useState<{ token: string; question: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const refreshCaptcha = useCallback(async () => {
    setCaptchaAnswer('');
    try {
      const { data } = await api.get('/auth/captcha');
      setCaptcha(data);
    } catch {
      setCaptcha(null);
    }
  }, []);

  useEffect(() => {
    refreshCaptcha();
  }, [refreshCaptcha]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!captcha) {
      setError('Verification unavailable — please refresh.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password, captcha.token, captchaAnswer);
    } catch (err) {
      // Any failed attempt gets a fresh challenge.
      refreshCaptcha();
      if (axios.isAxiosError(err) && !err.response) {
        setError('Cannot reach the server. Is the backend running on port 4000?');
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError('Verification failed. Please solve the new challenge.');
      } else if (axios.isAxiosError(err) && err.response?.status === 423) {
        setError(
          err.response.data?.error?.message ??
            'Account temporarily locked after too many attempts. Try again later.',
        );
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (axios.isAxiosError(err) && err.response && err.response.status !== 401) {
        setError(`Login failed (server error ${err.response.status}). Please try again.`);
      } else {
        setError('Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100vh' }}>
      <div
        style={{
          background: 'linear-gradient(160deg, #0f766e, #134e4a)',
          color: '#fff',
          padding: 56,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
        className="login-hero"
      >
        <div style={{ fontSize: 13, letterSpacing: 2, opacity: 0.8, marginBottom: 12 }}>{orgName.toUpperCase()}</div>
        <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: '0 0 16px' }}>
          University Task &<br />Collaboration System
        </h1>
        <p style={{ opacity: 0.85, maxWidth: 420, fontSize: 15, lineHeight: 1.6 }}>
          Spaces, clusters, tasks, real-time chat and role-based access — one workspace for the whole campus.
        </p>
      </div>

      <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <form onSubmit={onSubmit} style={{ width: 340, maxWidth: '100%' }}>
          <h2 style={{ margin: '0 0 4px' }}>Welcome back</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Sign in to your workspace</p>

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
          />

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Verification</label>
          <div className="captcha-box">
            <span className="captcha-question">{captcha ? `${captcha.question} =` : '…'}</span>
            <input
              type="text"
              inputMode="numeric"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              placeholder="?"
              className="captcha-input"
              aria-label="Answer the verification challenge"
              required
            />
            <button
              type="button"
              className="captcha-refresh"
              title="New challenge"
              onClick={refreshCaptcha}
              aria-label="Refresh challenge"
            >
              ⟳
            </button>
          </div>

          {error && <div style={{ color: 'var(--p-urgent)', fontSize: 13, margin: '10px 0' }}>{error}</div>}

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            disabled={loading || !captchaAnswer.trim()}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  margin: '6px 0 14px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 14,
};
