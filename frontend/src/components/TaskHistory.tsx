import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../lib/api';
import type { MiniUser } from '../types';
import { Avatar } from './ui';

interface Change {
  field: string;
  from: string | null;
  to: string | null;
}
interface Activity {
  id: string;
  action: string;
  meta?: Record<string, unknown> | null;
  createdAt: string;
  actor?: MiniUser | null;
}

function pretty(v: string | null | undefined) {
  if (v == null || v === '') return '—';
  // ISO date → short date.
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString();
  return String(v).replace('_', ' ').toLowerCase();
}

function describe(a: Activity): string {
  const m = (a.meta ?? {}) as Record<string, unknown>;
  switch (a.action) {
    case 'TASK_CREATED':
      return 'created this task';
    case 'STATUS_CHANGED':
      return `changed status from “${pretty(m.from as string)}” to “${pretty(m.to as string)}”`;
    case 'ASSIGNEES_UPDATED':
      return `updated assignees (${Array.isArray(m.userIds) ? (m.userIds as string[]).length : 0})`;
    case 'SUBTASK_ADDED':
      return `added subtask “${m.title as string}”`;
    case 'SUBTASK_STATUS_CHANGED':
      return `marked subtask “${m.title as string}” ${pretty(m.status as string)}`;
    case 'SUBTASK_UPDATED':
      return `updated subtask “${m.title as string}”`;
    case 'COMMENT_ADDED':
      return 'added a comment';
    case 'REPLY_ADDED':
      return 'replied to a comment';
    case 'TASK_UPDATED': {
      const changes = (m.changes as Change[] | undefined) ?? [];
      if (changes.length === 0) return 'updated this task';
      return changes
        .map((c) => `changed ${c.field} from “${pretty(c.from)}” to “${pretty(c.to)}”`)
        .join('; ');
    }
    default:
      return a.action.replace(/_/g, ' ').toLowerCase();
  }
}

export function TaskHistory({ taskId }: { taskId: string }) {
  const { data: activity } = useQuery({
    queryKey: ['activity', taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}/activity`)).data.activity as Activity[],
  });

  if (!activity) return null;
  if (activity.length === 0) {
    return <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No history yet.</div>;
  }

  return (
    <div>
      {activity.map((a) => (
        <div key={a.id} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {a.actor ? (
            <Avatar user={a.actor} size={24} />
          ) : (
            <span className="avatar" style={{ background: 'var(--text-faint)', width: 24, height: 24 }}>
              ?
            </span>
          )}
          <div style={{ fontSize: 13, lineHeight: 1.45 }}>
            <strong>{a.actor?.fullName ?? 'System'}</strong>{' '}
            <span style={{ color: 'var(--text-muted)' }}>{describe(a)}</span>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
