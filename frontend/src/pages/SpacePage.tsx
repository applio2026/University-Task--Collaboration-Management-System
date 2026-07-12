import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { Cluster, Space } from '../types';
import { initials } from '../components/ui';
import { CreateClusterModal } from '../components/CreateClusterModal';
import { RenameModal } from '../components/RenameModal';

export function SpacePage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const { data: space } = useQuery({
    queryKey: ['space', spaceId],
    queryFn: async () => (await api.get(`/spaces/${spaceId}`)).data.space as Space & { description?: string },
    enabled: !!spaceId,
  });

  const { data: clusters, isLoading } = useQuery({
    queryKey: ['clusters', spaceId],
    queryFn: async () => (await api.get(`/spaces/${spaceId}/clusters`)).data.clusters as Cluster[],
    enabled: !!spaceId,
  });

  const canManage = me?.systemRole === 'SUPER_ADMIN';

  return (
    <div>
      <div className="group-head" style={{ marginBottom: 4 }}>
        <span className="badge-square" style={{ background: space?.color ?? 'var(--accent)', width: 28, height: 28 }}>
          {space ? initials(space.name) : '?'}
        </span>
        <h2 style={{ margin: 0 }}>{space?.name ?? 'Space'}</h2>
        {canManage && space && (
          <button
            className="btn btn-ghost"
            title="Rename space"
            style={{ padding: '2px 8px' }}
            onClick={() => setRenaming(true)}
          >
            ✎ Rename
          </button>
        )}
        {canManage && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}>
            ＋ New Cluster
          </button>
        )}
      </div>
      {space?.description && (
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>{space.description}</p>
      )}

      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 160 }}>
          <div className="spinner" />
        </div>
      ) : clusters?.length ? (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {clusters.map((c) => (
            <button
              key={c.id}
              className="stat-tile"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => navigate(`/clusters/${c.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="badge-square" style={{ background: c.color, width: 22, height: 22, fontSize: 10 }}>
                  {initials(c.name)}
                </span>
                <strong>{c.name}</strong>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                <span className="chip">{c.kind}</span>{' '}
                {c._count?.tasks ?? 0} tasks · {c._count?.childClusters ?? 0} sub-clusters
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>
          No clusters in this space yet{canManage ? ' — create one to get started.' : '.'}
        </div>
      )}

      {creating && spaceId && (
        <CreateClusterModal spaceId={spaceId} spaceName={space?.name ?? ''} onClose={() => setCreating(false)} />
      )}

      {renaming && space && (
        <RenameModal
          title="Rename space"
          label="Space name"
          currentValue={space.name}
          onSave={async (name) => {
            await api.patch(`/spaces/${space.id}`, { name });
            qc.invalidateQueries({ queryKey: ['space', spaceId] });
            qc.invalidateQueries({ queryKey: ['spaces'] });
          }}
          onClose={() => setRenaming(false)}
        />
      )}
    </div>
  );
}
