import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import type { MiniUser } from '../types';
import { Avatar, clusterRoleLabel } from './ui';

interface Member {
  role: string; // STUDENT | TEACHING_ASSISTANT | CLUSTER_ADMIN
  user: MiniUser;
}

const ROLE_ORDER: Record<string, number> = { CLUSTER_ADMIN: 0, TEACHING_ASSISTANT: 1, STUDENT: 2 };

/**
 * Cluster members tab. Anyone in the cluster can see the roster; everyone except
 * a plain User can enrol a new user directly here.
 */
export function ClusterMembers({
  clusterId,
  canManage,
  canManageRoles,
}: {
  clusterId: string;
  canManage: boolean; // TA / Faculty / admin — may add students
  canManageRoles: boolean; // Faculty / admin — may remove members
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: ['cluster-members', clusterId],
    queryFn: async () => (await api.get(`/clusters/${clusterId}/members`)).data.members as Member[],
  });

  // Search users to enrol. Runs once at least 2 chars are typed.
  const { data: results } = useQuery({
    queryKey: ['user-search', query],
    queryFn: async () =>
      (await api.get('/users/search', { params: { q: query } })).data.users as MiniUser[],
    enabled: canManage && query.trim().length >= 2,
  });

  const memberIds = new Set((members ?? []).map((m) => m.user.id));

  const addStudent = useMutation({
    mutationFn: async (userId: string) =>
      api.post(`/clusters/${clusterId}/members`, { userId, role: 'STUDENT' }),
    onSuccess: (_res, _userId) => {
      setError(null);
      setQuery('');
      qc.invalidateQueries({ queryKey: ['cluster-members', clusterId] });
      qc.invalidateQueries({ queryKey: ['cluster', clusterId] });
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err) && err.response?.status === 403
          ? 'You are not allowed to add members to this cluster.'
          : 'Could not add the member. Please try again.',
      );
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => api.delete(`/clusters/${clusterId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cluster-members', clusterId] });
      qc.invalidateQueries({ queryKey: ['cluster', clusterId] });
    },
  });

  const sorted = [...(members ?? [])].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.user.fullName.localeCompare(b.user.fullName),
  );

  return (
    <div>
      {canManage && (
        <div className="field" style={{ maxWidth: 460 }}>
          <label>Add a student</label>
          <input
            className="input"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setNotice(null);
            }}
          />
          {query.trim().length >= 2 && (
            <div className="multi-select" style={{ marginTop: 6 }}>
              {results
                ?.filter((u) => !memberIds.has(u.id))
                .map((u) => (
                  <div key={u.id} className="multi-option" style={{ cursor: 'default' }}>
                    <Avatar user={u} size={22} />
                    <span style={{ flex: 1 }}>
                      {u.fullName}
                      {u.email && (
                        <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> · {u.email}</span>
                      )}
                    </span>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '2px 10px', fontSize: 12 }}
                      disabled={addStudent.isPending}
                      onClick={() => {
                        addStudent.mutate(u.id);
                        setNotice(`Added ${u.fullName} as a student.`);
                      }}
                    >
                      ＋ Add
                    </button>
                  </div>
                ))}
              {results && results.filter((u) => !memberIds.has(u.id)).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: 6 }}>
                  No matching users (or all are already members).
                </div>
              )}
            </div>
          )}
          {notice && <p style={{ fontSize: 12, color: 'var(--s-completed)', margin: '6px 0 0' }}>✓ {notice}</p>}
          {error && <p className="form-error">{error}</p>}
        </div>
      )}

      <div style={{ marginTop: canManage ? 16 : 0 }}>
        {isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', height: 120 }}>
            <div className="spinner" />
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No members in this cluster yet.</div>
        ) : (
          <div className="multi-select" style={{ maxWidth: 460 }}>
            {sorted.map((m) => (
              <div key={m.user.id} className="multi-option" style={{ cursor: 'default' }}>
                <Avatar user={m.user} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.user.fullName}</div>
                  {m.user.email && (
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{m.user.email}</div>
                  )}
                </div>
                <span className="chip">{clusterRoleLabel(m.role)}</span>
                {canManageRoles && (
                  <button
                    className="member-chip-x"
                    title="Remove from cluster"
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate(m.user.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
