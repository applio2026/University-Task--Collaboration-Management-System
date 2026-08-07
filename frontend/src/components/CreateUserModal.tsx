import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import type { SystemRole } from '../types';
import { Modal } from './Modal';
import { MembershipAssigner } from './MembershipAssigner';

interface CreatedUser {
  id: string;
  fullName: string;
  email: string;
  systemRole: SystemRole;
}

export function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [systemRole, setSystemRole] = useState<SystemRole>('USER');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedUser | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      (await api.post('/users', { fullName: fullName.trim(), email: email.trim(), password, systemRole }))
        .data.user as CreatedUser,
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setCreated(user);
    },
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setError('That email is already registered.');
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError('Password must be 8+ chars with an uppercase letter, a lowercase letter, and a number.');
      } else {
        setError('Could not create the user. Please try again.');
      }
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      setError('Name, email, and a password of 8+ characters are required.');
      return;
    }
    create.mutate();
  }

  if (created) {
    return (
      <Modal title={`User created — assign access`} onClose={onClose}>
        <p style={{ fontSize: 13, color: 'var(--s-completed)', marginTop: 0 }}>
          ✓ {created.fullName} ({created.email}) was created.
        </p>
        <MembershipAssigner userId={created.id} userName={created.fullName} />
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New User" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Temporary password</label>
            <input
              className="input"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ chars, upper, lower, number"
            />
          </div>
          <div className="field">
            <label>System role</label>
            <select
              className="select"
              value={systemRole}
              onChange={(e) => setSystemRole(e.target.value as SystemRole)}
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
