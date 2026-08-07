import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useActiveWorkspace } from '../store/workspace';
import type { OverviewGroup, Task, TaskPriority, TaskStatus } from '../types';
import { TaskTable } from '../components/TaskTable';
import { TaskDrawer } from '../components/TaskDrawer';
import { statusLabel } from '../components/ui';

const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'REJECTED', 'LATE'];
const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

type Row = {
  task: Task;
  workspaceId: string;
  spaceId: string;
  spaceName: string;
  clusterId: string;
  clusterName: string;
};

export function DashboardPage() {
  const me = useAuth((s) => s.user);
  const { activeWorkspaceId } = useActiveWorkspace();
  const isSuper = me?.systemRole === 'SUPER_ADMIN' || me?.systemRole === 'ADMIN';
  // Super Admin has no personal assignments → always the general view.
  const [scope, setScope] = useState<'mine' | 'all'>(isSuper ? 'all' : 'mine');
  const [spaceId, setSpaceId] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [openTask, setOpenTask] = useState<string | null>(null);

  const { data: groups, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: async () => (await api.get('/tasks/overview')).data.groups as OverviewGroup[],
  });

  // Flatten groups into task rows tagged with their workspace + space + cluster,
  // scoped up front to the active workspace (picked once via the sidebar
  // switcher) — no separate "Workspace" filter needed here.
  const rows = useMemo<Row[]>(
    () =>
      (groups ?? [])
        .filter((g) => !activeWorkspaceId || g.workspace.id === activeWorkspaceId)
        .flatMap((g) =>
          g.tasks.map((task) => ({
            task,
            workspaceId: g.workspace.id,
            spaceId: g.space.id,
            spaceName: g.space.name,
            clusterId: g.cluster.id,
            clusterName: g.cluster.name,
          })),
        ),
    [groups, activeWorkspaceId],
  );

  const spaceOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.spaceId, r.spaceName));
    return [...map.entries()];
  }, [rows]);

  const clusterOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.filter((r) => !spaceId || r.spaceId === spaceId).forEach((r) => map.set(r.clusterId, r.clusterName));
    return [...map.entries()];
  }, [rows, spaceId]);

  const mineActive = !isSuper && scope === 'mine';

  // Everything EXCEPT the status filter — the stat tiles count from this so the
  // status breakdown stays correct while a status is selected.
  const statusScoped = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mineActive || r.task.assignees.some((a) => a.user.id === me?.id)) &&
          (!spaceId || r.spaceId === spaceId) &&
          (!clusterId || r.clusterId === clusterId) &&
          (!priority || r.task.priority === priority),
      ),
    [rows, mineActive, me?.id, spaceId, clusterId, priority],
  );

  // The task table additionally honors the selected status.
  const filtered = useMemo(
    () => statusScoped.filter((r) => !status || r.task.status === status),
    [statusScoped, status],
  );

  const tasks = filtered.map((r) => r.task);
  const countBy = (s: TaskStatus) => statusScoped.filter((r) => r.task.status === s).length;

  return (
    <div>
      <div className="group-head" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{mineActive ? 'My Tasks' : 'Dashboard'}</h2>
        {!isSuper && (
          <div className="tab-bar" style={{ margin: 0, marginLeft: 12, border: 'none' }}>
            <button className={`tab ${scope === 'mine' ? 'tab-active' : ''}`} onClick={() => setScope('mine')}>
              Assigned to me
            </button>
            <button className={`tab ${scope === 'all' ? 'tab-active' : ''}`} onClick={() => setScope('all')}>
              All accessible
            </button>
          </div>
        )}
      </div>

      <div className="filter-bar">
        <div className="field">
          <label>Space</label>
          <select
            className="select"
            value={spaceId}
            onChange={(e) => {
              setSpaceId(e.target.value);
              setClusterId(''); // reset cluster when space changes
            }}
          >
            <option value="">All spaces</option>
            {spaceOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Cluster</label>
          <select className="select" value={clusterId} onChange={(e) => setClusterId(e.target.value)}>
            <option value="">All clusters</option>
            {clusterOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Priority</label>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0] + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        {(spaceId || clusterId || status || priority) && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setSpaceId('');
              setClusterId('');
              setStatus('');
              setPriority('');
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="stat-grid">
        {(
          [
            { label: 'Total tasks', value: statusScoped.length, filter: '' },
            { label: 'Open', value: countBy('OPEN'), filter: 'OPEN' },
            { label: 'In progress', value: countBy('IN_PROGRESS'), filter: 'IN_PROGRESS' },
            { label: 'In review', value: countBy('REVIEW'), filter: 'REVIEW' },
            { label: 'Completed', value: countBy('COMPLETED'), filter: 'COMPLETED' },
          ] as const
        ).map((tile) => (
          <button
            key={tile.label}
            className={`stat-tile stat-tile-btn ${status === tile.filter ? 'stat-tile-active' : ''}`}
            onClick={() => setStatus(tile.filter)}
            title={tile.filter ? `Filter by ${tile.label}` : 'Show all statuses'}
          >
            <div className="stat-value">{tile.value}</div>
            <div className="stat-label">{tile.label}</div>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 160 }}>
          <div className="spinner" />
        </div>
      ) : (
        <TaskTable tasks={tasks} onOpen={setOpenTask} invalidateKey={['overview']} bulk />
      )}

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}
