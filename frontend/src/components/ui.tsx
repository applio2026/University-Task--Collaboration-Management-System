import type { MiniUser, TaskPriority, TaskStatus } from '../types';

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
}

export function Avatar({ user, size = 26 }: { user: MiniUser; size?: number }) {
  return (
    <span
      className="avatar"
      title={user.fullName}
      style={{ background: user.avatarColor, width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(user.fullName)}
    </span>
  );
}

export function AvatarStack({ users, max = 4 }: { users: MiniUser[]; max?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={24} />
      ))}
      {extra > 0 && (
        <span className="avatar" style={{ background: 'var(--text-faint)', width: 24, height: 24 }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  LOW: { label: 'Low', color: 'var(--p-low)' },
  MEDIUM: { label: 'Medium', color: 'var(--p-medium)' },
  HIGH: { label: 'High', color: 'var(--p-high)' },
  URGENT: { label: 'Urgent', color: 'var(--p-urgent)' },
};

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  const m = PRIORITY_META[priority];
  return (
    <span className="pill" style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 14%, transparent)` }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: m.color }} />
      {m.label}
    </span>
  );
}

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  OPEN: { label: 'Open', color: 'var(--s-open)' },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--s-progress)' },
  REVIEW: { label: 'Review', color: 'var(--s-review)' },
  COMPLETED: { label: 'Completed', color: 'var(--s-completed)' },
  REJECTED: { label: 'Rejected', color: 'var(--s-rejected)' },
  LATE: { label: 'Late', color: 'var(--s-late)' },
};

export function StatusDot({ status, onClick }: { status: TaskStatus; onClick?: () => void }) {
  const m = STATUS_META[status];
  const filled = status === 'COMPLETED';
  return (
    <button
      className="btn-ghost"
      onClick={onClick}
      title={m.label}
      style={{ padding: 2, display: 'inline-flex', border: 'none', background: 'none' }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: `2px solid ${m.color}`,
          background: filled ? m.color : 'transparent',
          display: 'inline-block',
        }}
      />
    </button>
  );
}

export function statusLabel(status: TaskStatus) {
  return STATUS_META[status].label;
}
export function statusColor(status: TaskStatus) {
  return STATUS_META[status].color;
}
