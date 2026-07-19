import { useMemo, useState } from 'react';
import type { MiniUser } from '../types';
import { Avatar, clusterRoleLabel } from './ui';

export interface PickerMember {
  role: string; // STUDENT | TEACHING_ASSISTANT | CLUSTER_ADMIN
  user: MiniUser;
}

const ROLE_FILTERS: { key: string; label: string }[] = [
  { key: 'STUDENT', label: 'Users' },
  { key: 'TEACHING_ASSISTANT', label: 'Managers' },
  { key: 'CLUSTER_ADMIN', label: 'Faculty' },
];

/**
 * Controlled assignee picker: role-filter checkboxes + a "select all (filtered)"
 * option + per-member checkboxes. Reports the selected user ids via onChange.
 */
export function AssigneePicker({
  members,
  selected,
  onChange,
}: {
  members: PickerMember[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [roles, setRoles] = useState<Set<string>>(
    new Set(['STUDENT', 'TEACHING_ASSISTANT', 'CLUSTER_ADMIN']),
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => members.filter((m) => roles.has(m.role)), [members, roles]);
  const allVisibleSelected = visible.length > 0 && visible.every((m) => selectedSet.has(m.user.id));

  function toggleRole(r: string) {
    setRoles((s) => {
      const n = new Set(s);
      if (n.has(r)) n.delete(r);
      else n.add(r);
      return n;
    });
  }
  function toggleUser(id: string) {
    const n = new Set(selectedSet);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onChange([...n]);
  }
  function toggleSelectAllVisible() {
    const n = new Set(selectedSet);
    if (allVisibleSelected) visible.forEach((m) => n.delete(m.user.id));
    else visible.forEach((m) => n.add(m.user.id));
    onChange([...n]);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        {ROLE_FILTERS.map((r) => (
          <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <input type="checkbox" checked={roles.has(r.key)} onChange={() => toggleRole(r.key)} />
            {r.label}
          </label>
        ))}
      </div>

      <div className="multi-select">
        <label
          className="multi-option"
          style={{ fontWeight: 600, borderBottom: '1px solid var(--border)', borderRadius: 0 }}
        >
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
          Select all ({visible.length})
        </label>
        {visible.map((m) => (
          <label key={m.user.id} className="multi-option">
            <input type="checkbox" checked={selectedSet.has(m.user.id)} onChange={() => toggleUser(m.user.id)} />
            <Avatar user={m.user} size={22} />
            <span style={{ flex: 1 }}>{m.user.fullName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{clusterRoleLabel(m.role)}</span>
          </label>
        ))}
        {visible.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: 6 }}>No members match the filter.</div>
        )}
      </div>
    </div>
  );
}
