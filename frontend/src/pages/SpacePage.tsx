import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { Cluster, OverviewGroup, Space, TaskStatus } from '../types';
import { initials, statusLabel } from '../components/ui';
import { CreateClusterModal } from '../components/CreateClusterModal';
import { RenameModal } from '../components/RenameModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { TaskTable } from '../components/TaskTable';
import { TaskDrawer } from '../components/TaskDrawer';

const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'REJECTED', 'LATE'];

export function SpacePage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [taskStatus, setTaskStatus] = useState('');
  const [openTask, setOpenTask] = useState<string | null>(null);

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

  // Every task across all clusters in this space, so status can be filtered
  // at the space level rather than per-cluster.
  const { data: overviewGroups } = useQuery({
    queryKey: ['overview'],
    queryFn: async () => (await api.get('/tasks/overview')).data.groups as OverviewGroup[],
    enabled: !!spaceId,
  });

  const spaceTasks = useMemo(
    () => (overviewGroups ?? []).filter((g) => g.space.id === spaceId).flatMap((g) => g.tasks),
    [overviewGroups, spaceId],
  );
  const filteredTasks = useMemo(
    () => (taskStatus ? spaceTasks.filter((t) => t.status === taskStatus) : spaceTasks),
    [spaceTasks, taskStatus],
  );

  const canManage = me?.systemRole === 'SUPER_ADMIN';

  const deleteSpace = useMutation({
    mutationFn: async () => api.delete(`/spaces/${spaceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] });
      if (space?.workspace) {
        qc.invalidateQueries({ queryKey: ['workspace-spaces', space.workspace.id] });
        navigate(`/workspaces/${space.workspace.id}`);
      } else {
        navigate('/');
      }
    },
  });

  return (
    <div>
      {space?.workspace && (
        <Link
          to={`/workspaces/${space.workspace.id}`}
          style={{ fontSize: 12, color: 'var(--text-faint)', textDecoration: 'none', display: 'inline-block', marginBottom: 6 }}
        >
          ← {space.workspace.name}
        </Link>
      )}
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
        {canManage && space && (
          <button
            className="btn btn-ghost"
            title="Delete space"
            style={{ padding: '2px 8px', color: 'var(--p-urgent)' }}
            onClick={() => setDeleting(true)}
          >
            🗑 Delete
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

      <div className="group-head" style={{ margin: '20px 0 8px' }}>
        <h3 style={{ margin: 0 }}>Tasks in this space</h3>
        <div className="field" style={{ marginLeft: 'auto', marginBottom: 0 }}>
          <select className="select" value={taskStatus} onChange={(e) => setTaskStatus(e.target.value)}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TaskTable tasks={filteredTasks} onOpen={setOpenTask} invalidateKey={['overview']} />

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} />}

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
            if (space.workspace) qc.invalidateQueries({ queryKey: ['workspace-spaces', space.workspace.id] });
          }}
          onClose={() => setRenaming(false)}
        />
      )}

      {deleting && space && (
        <ConfirmDeleteModal
          title="Delete space"
          entityLabel="space"
          entityName={space.name}
          warning="This archives the space and every Cluster and Task inside it. A Super Admin can restore each of them later from the Archive page, but restoring the space itself won't automatically bring its contents back."
          onConfirm={() => deleteSpace.mutateAsync().then(() => undefined)}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
