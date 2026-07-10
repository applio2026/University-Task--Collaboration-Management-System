import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SystemRole } from '../types';
import { Avatar } from '../components/ui';
import { Modal } from '../components/Modal';
import { CreateUserModal } from '../components/CreateUserModal';
import { MembershipAssigner } from '../components/MembershipAssigner';

interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  systemRole: SystemRole;
  avatarColor: string;
  isActive: boolean;
  _count: { spaceMemberships: number; clusterMemberships: number };
}

export function AdminUsersPage() {
  const [creating, setCreating] = useState(false);
  const [assignUser, setAssignUser] = useState<AdminUser | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data.users as AdminUser[],
  });

  return (
    <div>
      <div className="group-head" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <span className="chip">{users?.length ?? 0}</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}>
          ＋ New User
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 160 }}>
          <div className="spinner" />
        </div>
      ) : (
        <table className="task-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th style={{ width: 130 }}>System role</th>
              <th style={{ width: 90 }}>Spaces</th>
              <th style={{ width: 90 }}>Clusters</th>
              <th style={{ width: 90 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="task-row">
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar user={u} size={24} />
                    <span style={{ fontWeight: 600 }}>{u.fullName}</span>
                  </div>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                <td>
                  <span className="pill">{u.systemRole === 'SUPER_ADMIN' ? 'Super Admin' : 'User'}</span>
                </td>
                <td>{u._count.spaceMemberships}</td>
                <td>{u._count.clusterMemberships}</td>
                <td>
                  <button className="btn btn-ghost" onClick={() => setAssignUser(u)}>
                    Assign
                  </button>
                </td>
              </tr>
            ))}
            {!users?.length && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--text-faint)', textAlign: 'center', padding: 18 }}>
                  No users yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {creating && <CreateUserModal onClose={() => setCreating(false)} />}
      {assignUser && (
        <Modal title={`Assign access — ${assignUser.fullName}`} onClose={() => setAssignUser(null)}>
          <MembershipAssigner userId={assignUser.id} userName={assignUser.fullName} />
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => setAssignUser(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
