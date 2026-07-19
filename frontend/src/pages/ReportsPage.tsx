import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useActiveWorkspace } from '../store/workspace';
import type { OverviewGroup, TaskPriority, TaskStatus } from '../types';
import { statusColor, statusLabel } from '../components/ui';

const STATUS_ORDER: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'REJECTED', 'LATE'];
const PRIORITY_ORDER: TaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: 'var(--p-low)',
  MEDIUM: 'var(--p-medium)',
  HIGH: 'var(--p-high)',
  URGENT: 'var(--p-urgent)',
};
const DONE: TaskStatus[] = ['COMPLETED'];
const CLOSED: TaskStatus[] = ['COMPLETED', 'REJECTED'];

/** One directly-labeled horizontal bar: label carries identity, not color alone. */
function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="bar-row" title={`${label}: ${value}`}>
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%`, background: color }} />
      </div>
      <span className="bar-value">{value}</span>
    </div>
  );
}

export function ReportsPage() {
  const { activeWorkspaceId } = useActiveWorkspace();

  const { data: groups, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: async () => (await api.get('/tasks/overview')).data.groups as OverviewGroup[],
  });

  // Scoped to the workspace picked in the sidebar switcher — no separate
  // "Workspace" filter needed here.
  const scopedGroups = useMemo(
    () => (groups ?? []).filter((g) => !activeWorkspaceId || g.workspace.id === activeWorkspaceId),
    [groups, activeWorkspaceId],
  );

  const report = useMemo(() => {
    const groups = scopedGroups;
    const all = groups.flatMap((g) => g.tasks);
    const now = Date.now();

    const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<TaskStatus, number>;
    const byPriority = Object.fromEntries(PRIORITY_ORDER.map((p) => [p, 0])) as Record<TaskPriority, number>;
    all.forEach((t) => {
      byStatus[t.status as TaskStatus] = (byStatus[t.status as TaskStatus] ?? 0) + 1;
      byPriority[t.priority as TaskPriority] = (byPriority[t.priority as TaskPriority] ?? 0) + 1;
    });

    const isOverdue = (t: (typeof all)[number]) =>
      !!t.dueDate && new Date(t.dueDate).getTime() < now && !CLOSED.includes(t.status as TaskStatus);

    const total = all.length;
    const completed = all.filter((t) => DONE.includes(t.status as TaskStatus)).length;
    const overdue = all.filter(isOverdue).length;

    const perCluster = (groups ?? [])
      .map((g) => {
        const t = g.tasks.length;
        const done = g.tasks.filter((x) => DONE.includes(x.status as TaskStatus)).length;
        const od = g.tasks.filter(isOverdue).length;
        return {
          id: g.cluster.id,
          cluster: g.cluster.name,
          space: g.space.name,
          total: t,
          done,
          overdue: od,
          rate: t > 0 ? Math.round((done / t) * 100) : 0,
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);

    return {
      total,
      completed,
      overdue,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      byStatus,
      byPriority,
      perCluster,
    };
  }, [scopedGroups]);

  if (isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  const statusMax = Math.max(1, ...STATUS_ORDER.map((s) => report.byStatus[s]));
  const priorityMax = Math.max(1, ...PRIORITY_ORDER.map((p) => report.byPriority[p]));

  return (
    <div>
      <div className="group-head" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Reports &amp; Analytics</h2>
      </div>

      {/* KPI headline numbers */}
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-value">{report.total}</div>
          <div className="stat-label">Total tasks</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{report.completed}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{report.completionRate}%</div>
          <div className="stat-label">Completion rate</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: report.overdue > 0 ? 'var(--p-urgent)' : undefined }}>
            {report.overdue}
          </div>
          <div className="stat-label">Overdue</div>
        </div>
      </div>

      <div className="report-cols">
        {/* Status distribution — reserved status colors, every bar labeled */}
        <div className="stat-tile">
          <div className="report-title">Tasks by status</div>
          {STATUS_ORDER.map((s) => (
            <BarRow key={s} label={statusLabel(s)} value={report.byStatus[s]} max={statusMax} color={statusColor(s)} />
          ))}
        </div>

        {/* Priority distribution */}
        <div className="stat-tile">
          <div className="report-title">Tasks by priority</div>
          {PRIORITY_ORDER.map((p) => (
            <BarRow
              key={p}
              label={p[0] + p.slice(1).toLowerCase()}
              value={report.byPriority[p]}
              max={priorityMax}
              color={PRIORITY_COLOR[p]}
            />
          ))}
        </div>
      </div>

      {/* Per-cluster completion — table view with single-hue meters */}
      <div className="report-title" style={{ marginTop: 20 }}>Completion by cluster</div>
      <table className="task-table">
        <thead>
          <tr>
            <th>Cluster</th>
            <th>Space</th>
            <th style={{ width: 70 }}>Tasks</th>
            <th style={{ width: 70 }}>Done</th>
            <th style={{ width: 80 }}>Overdue</th>
            <th style={{ width: 200 }}>Completion</th>
          </tr>
        </thead>
        <tbody>
          {report.perCluster.map((r) => (
            <tr key={r.id} className="task-row">
              <td style={{ fontWeight: 600 }}>{r.cluster}</td>
              <td style={{ color: 'var(--text-muted)' }}>{r.space}</td>
              <td>{r.total}</td>
              <td>{r.done}</td>
              <td style={{ color: r.overdue > 0 ? 'var(--p-urgent)' : 'var(--text-muted)' }}>{r.overdue}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="meter">
                    <div className="meter-fill" style={{ width: `${r.rate}%` }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 34 }}>{r.rate}%</span>
                </div>
              </td>
            </tr>
          ))}
          {report.perCluster.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: 'var(--text-faint)', textAlign: 'center', padding: 18 }}>
                No tasks to report yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
