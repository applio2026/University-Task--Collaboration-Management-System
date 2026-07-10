import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import type { Cluster, Space } from '../types';

const SPACE_ROLES = ['MEMBER', 'SPACE_ADMIN'];
const CLUSTER_ROLES = ['STUDENT', 'TEACHING_ASSISTANT', 'CLUSTER_ADMIN'];

interface CurrentSpace { id: string; name: string; color: string; role: string }
interface CurrentCluster { id: string; name: string; color: string; spaceName: string; role: string }
interface Memberships { spaces: CurrentSpace[]; clusters: CurrentCluster[] }

function roleLabel(role: string) {
  return role.replace('_', ' ').toLowerCase();
}

/**
 * Assign an existing user to spaces and/or clusters. Uses the existing
 * membership endpoints (POST /spaces/:id/members, POST /clusters/:id/members).
 */
export function MembershipAssigner({ userId, userName }: { userId: string; userName: string }) {
  const qc = useQueryClient();
  const [spaceId, setSpaceId] = useState('');
  const [spaceRole, setSpaceRole] = useState('MEMBER');
  const [clusterId, setClusterId] = useState('');
  const [clusterRole, setClusterRole] = useState('STUDENT');
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: memberships } = useQuery({
    queryKey: ['user-memberships', userId],
    queryFn: async () => (await api.get(`/users/${userId}/memberships`)).data as Memberships,
  });

  const { data: spaces } = useQuery({
    queryKey: ['spaces'],
    queryFn: async () => (await api.get('/spaces')).data.spaces as Space[],
  });

  const { data: clusters } = useQuery({
    queryKey: ['clusters', spaceId],
    queryFn: async () => (await api.get(`/spaces/${spaceId}/clusters`)).data.clusters as Cluster[],
    enabled: !!spaceId,
  });

  function handleError(err: unknown, what: string) {
    if (axios.isAxiosError(err) && err.response?.status === 403) {
      setError(`Not allowed to add to that ${what}.`);
    } else if (axios.isAxiosError(err) && err.response?.status === 409) {
      setError('Already a member.');
    } else {
      setError(`Could not add to ${what}.`);
    }
  }

  // Refresh the user list counts + sidebar/space membership caches after a change.
  function invalidateMembershipCaches() {
    qc.invalidateQueries({ queryKey: ['user-memberships', userId] });
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['spaces'] });
    qc.invalidateQueries({ queryKey: ['clusters'] });
  }

  const removeFromSpace = useMutation({
    mutationFn: async (id: string) => api.delete(`/spaces/${id}/members/${userId}`),
    onSuccess: invalidateMembershipCaches,
  });
  const removeFromCluster = useMutation({
    mutationFn: async (id: string) => api.delete(`/clusters/${id}/members/${userId}`),
    onSuccess: invalidateMembershipCaches,
  });

  const addToSpace = useMutation({
    mutationFn: async () => api.post(`/spaces/${spaceId}/members`, { userId, role: spaceRole }),
    onSuccess: () => {
      const name = spaces?.find((s) => s.id === spaceId)?.name ?? 'space';
      setLog((l) => [`Added to space “${name}” as ${spaceRole.toLowerCase()}`, ...l]);
      setError(null);
      invalidateMembershipCaches();
    },
    onError: (e) => handleError(e, 'space'),
  });

  const addToCluster = useMutation({
    mutationFn: async () => api.post(`/clusters/${clusterId}/members`, { userId, role: clusterRole }),
    onSuccess: () => {
      const name = clusters?.find((c) => c.id === clusterId)?.name ?? 'cluster';
      setLog((l) => [`Added to cluster “${name}” as ${clusterRole.replace('_', ' ').toLowerCase()}`, ...l]);
      setError(null);
      invalidateMembershipCaches();
    },
    onError: (e) => handleError(e, 'cluster'),
  });

  const assignedSpaceIds = new Set((memberships?.spaces ?? []).map((s) => s.id));
  const assignedClusterIds = new Set((memberships?.clusters ?? []).map((c) => c.id));

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
        Assign <strong>{userName}</strong> to spaces and clusters.
      </p>

      {/* Current access — so you can see what's already assigned and add the rest. */}
      <div className="field">
        <label>Current access</label>
        {memberships && memberships.spaces.length === 0 && memberships.clusters.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Not a member of any space or cluster yet.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {memberships?.spaces.map((s) => (
              <span key={s.id} className="member-chip" title={`Space · ${roleLabel(s.role)}`}>
                <span className="badge-square" style={{ background: s.color, width: 14, height: 14, fontSize: 8 }}>
                  {s.name.slice(0, 1)}
                </span>
                {s.name}
                <span style={{ color: 'var(--text-faint)' }}>· {roleLabel(s.role)}</span>
                <button
                  className="member-chip-x"
                  title="Remove from space"
                  disabled={removeFromSpace.isPending}
                  onClick={() => removeFromSpace.mutate(s.id)}
                >
                  ✕
                </button>
              </span>
            ))}
            {memberships?.clusters.map((c) => (
              <span key={c.id} className="member-chip" title={`Cluster in ${c.spaceName} · ${roleLabel(c.role)}`}>
                <span className="badge-square" style={{ background: c.color, width: 14, height: 14, fontSize: 8 }}>
                  {c.name.slice(0, 1)}
                </span>
                {c.name}
                <span style={{ color: 'var(--text-faint)' }}>· {roleLabel(c.role)}</span>
                <button
                  className="member-chip-x"
                  title="Remove from cluster"
                  disabled={removeFromCluster.isPending}
                  onClick={() => removeFromCluster.mutate(c.id)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label>Space</label>
        <div className="field-row">
          <select className="select" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
            <option value="">Select a space…</option>
            {spaces?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {assignedSpaceIds.has(s.id) ? ' ✓ (assigned)' : ''}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ maxWidth: 150 }}
            value={spaceRole}
            onChange={(e) => setSpaceRole(e.target.value)}
          >
            {SPACE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 8 }}
          disabled={!spaceId || addToSpace.isPending}
          onClick={() => addToSpace.mutate()}
        >
          {addToSpace.isPending ? 'Adding…' : '＋ Add to space'}
        </button>
      </div>

      <div className="field">
        <label>Cluster {spaceId ? '' : '(pick a space first)'}</label>
        <div className="field-row">
          <select
            className="select"
            value={clusterId}
            onChange={(e) => setClusterId(e.target.value)}
            disabled={!spaceId}
          >
            <option value="">Select a cluster…</option>
            {clusters?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {assignedClusterIds.has(c.id) ? ' ✓ (assigned)' : ''}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ maxWidth: 150 }}
            value={clusterRole}
            onChange={(e) => setClusterRole(e.target.value)}
          >
            {CLUSTER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 8 }}
          disabled={!clusterId || addToCluster.isPending}
          onClick={() => addToCluster.mutate()}
        >
          {addToCluster.isPending ? 'Adding…' : '＋ Add to cluster'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {log.length > 0 && (
        <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', fontSize: 12, color: 'var(--s-completed)' }}>
          {log.map((entry, i) => (
            <li key={i}>✓ {entry}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
