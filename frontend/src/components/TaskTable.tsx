import { Fragment, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../lib/api';
import type { Task, TaskPriority, TaskStatus } from '../types';
import { AvatarStack, PriorityPill, StatusDot, statusLabel, statusColor } from './ui';

const STATUS_CYCLE: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'COMPLETED'];
const ALL_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'REJECTED', 'LATE'];
const ALL_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function TaskTable({
  tasks,
  onOpen,
  invalidateKey,
  bulk = false,
}: {
  tasks: Task[];
  onOpen: (taskId: string) => void;
  invalidateKey: unknown[];
  bulk?: boolean;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const cycleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) =>
      api.patch(`/tasks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });

  const bulkApply = useMutation({
    mutationFn: async (body: { taskIds: string[]; op: string; value?: string }) =>
      (await api.post('/tasks/bulk', body)).data as { updated: number; skipped: number },
    onSuccess: (r) => {
      setMessage(`Updated ${r.updated}${r.skipped ? `, skipped ${r.skipped} (no permission)` : ''}.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ['overview'] });
      setTimeout(() => setMessage(null), 4000);
    },
    onError: () => setMessage('Bulk update failed.'),
  });

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) => (s.size === tasks.length ? new Set() : new Set(tasks.map((t) => t.id))));
  }
  function apply(op: string, value?: string) {
    if (selected.size === 0) return;
    bulkApply.mutate({ taskIds: [...selected], op, value });
  }

  const colCount = bulk ? 7 : 6;

  return (
    <>
      {bulk && selected.size > 0 && (
        <div className="bulk-bar">
          <strong>{selected.size} selected</strong>
          <select
            className="select"
            style={{ width: 150 }}
            defaultValue=""
            onChange={(e) => e.target.value && apply('status', e.target.value)}
          >
            <option value="">Set status…</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ width: 150 }}
            defaultValue=""
            onChange={(e) => e.target.value && apply('priority', e.target.value)}
          >
            <option value="">Set priority…</option>
            {ALL_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0] + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost" disabled={bulkApply.isPending} onClick={() => apply('archive')}>
            Archive
          </button>
          <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
      {message && <div className="bulk-message">{message}</div>}

      <table className="task-table">
        <thead>
          <tr>
            {bulk && (
              <th style={{ width: 30 }}>
                <input
                  type="checkbox"
                  checked={tasks.length > 0 && selected.size === tasks.length}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
            )}
            <th style={{ width: 130 }}>Status</th>
            <th>Name</th>
            <th style={{ width: 130 }}>Assignee</th>
            <th style={{ width: 100 }}>Due Date</th>
            <th style={{ width: 110 }}>Priority</th>
            <th style={{ width: 90 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr>
              <td colSpan={colCount} style={{ color: 'var(--text-faint)', textAlign: 'center', padding: 18 }}>
                No tasks yet
              </td>
            </tr>
          )}
          {tasks.map((task) => {
            const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.status as TaskStatus) + 1) % STATUS_CYCLE.length];
            const hasSubs = task.subtasks.length > 0;
            const isOpen = expanded[task.id];
            return (
              <Fragment key={task.id}>
                <tr className="task-row">
                  {bulk && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(task.id)}
                        onChange={() => toggle(task.id)}
                        aria-label={`Select ${task.title}`}
                      />
                    </td>
                  )}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <StatusDot status={task.status} onClick={() => cycleStatus.mutate({ id: task.id, status: next })} />
                      <span style={{ fontSize: 12, color: statusColor(task.status), fontWeight: 600 }}>
                        {statusLabel(task.status)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {hasSubs && (
                        <button
                          className="btn-ghost"
                          style={{ border: 'none', background: 'none', color: 'var(--text-faint)', padding: 0, width: 14 }}
                          onClick={() => setExpanded((e) => ({ ...e, [task.id]: !e[task.id] }))}
                        >
                          {isOpen ? '▾' : '▸'}
                        </button>
                      )}
                      {!hasSubs && <span style={{ width: 14, display: 'inline-block' }} />}
                      <button className="task-name-btn" onClick={() => onOpen(task.id)}>
                        {task.title}
                      </button>
                      {task._count?.comments ? (
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>💬 {task._count.comments}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>{task.assignees.length > 0 ? <AvatarStack users={task.assignees.map((a) => a.user)} /> : '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {task.dueDate ? format(new Date(task.dueDate), 'd MMM') : '—'}
                  </td>
                  <td>
                    <PriorityPill priority={task.priority} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button title="View details" onClick={() => onOpen(task.id)}>
                        👁
                      </button>
                      <button title="Notify">🔔</button>
                      <button title="Open task" onClick={() => onOpen(task.id)}>
                        ＋
                      </button>
                    </div>
                  </td>
                </tr>
                {hasSubs &&
                  isOpen &&
                  task.subtasks.map((s) => (
                    <tr className="subtask-row" key={s.id}>
                      {bulk && <td />}
                      <td>
                        <StatusDot status={s.status} />
                      </td>
                      <td>
                        <span style={{ paddingLeft: 26, color: 'var(--text-muted)' }}>{s.title}</span>
                      </td>
                      <td>{s.assignee ? <AvatarStack users={[s.assignee]} /> : '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {s.dueDate ? format(new Date(s.dueDate), 'd MMM') : '—'}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
