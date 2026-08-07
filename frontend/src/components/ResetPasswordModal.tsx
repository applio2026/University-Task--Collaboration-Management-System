import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import { Modal } from './Modal';

// A 12-char password guaranteed to satisfy the backend policy (upper/lower/digit).
// Ambiguous characters (0/O, 1/l/I) are omitted so it's easy to read aloud/share.
function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const all = upper + lower + digit;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(lower), pick(digit)];
  for (let i = 0; i < 9; i++) chars.push(pick(all));
  return chars.sort(() => Math.random() - 0.5).join('');
}

export function ResetPasswordModal({
  userId,
  userName,
  email,
  onClose,
}: {
  userId: string;
  userName: string;
  email: string;
  onClose: () => void;
}) {
  // Default the temporary password to the user's email — a simple, memorable
  // reset the admin can share; the user is prompted to change it on next login.
  const [password, setPassword] = useState(email);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = useMutation({
    mutationFn: async () => {
      await api.post(`/users/${userId}/reset-password`, { newPassword: password });
    },
    onSuccess: () => setDone(true),
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError('Password must be 8+ chars with an uppercase letter, a lowercase letter, and a number.');
      } else if (axios.isAxiosError(err) && err.response?.status === 403) {
        setError('Only a super admin can reset passwords.');
      } else {
        setError('Could not reset the password. Please try again.');
      }
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Enter a password of at least 6 characters.');
      return;
    }
    reset.mutate();
  }

  if (done) {
    return (
      <Modal title="Password reset" onClose={onClose}>
        <p style={{ fontSize: 13, color: 'var(--s-completed)', marginTop: 0 }}>
          ✓ Password for {userName} ({email}) was reset.
        </p>
        <div className="field">
          <label>Temporary password — share it with them</label>
          <input
            className="input"
            readOnly
            value={password}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          They'll be asked to set their own password on next login, and all their existing sessions were
          signed out.
        </p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Reset password — ${userName}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
          Temporary password for <strong>{email}</strong> — defaults to their email address. They'll be
          prompted to change it on next login, and all their current sessions will be signed out.
        </p>
        <div className="field">
          <label>New password</label>
          <input
            className="input"
            type="text"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 6 characters"
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: -4 }}
          onClick={() => setPassword(generatePassword())}
        >
          Generate strong password
        </button>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={reset.isPending}>
            {reset.isPending ? 'Resetting…' : 'Reset password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
