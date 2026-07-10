import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { Avatar } from '../components/ui';

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
  actor?: { id: string; fullName: string; avatarColor: string } | null;
}
interface AuditResponse {
  logs: AuditLog[];
  actions: string[];
  entityTypes: string[];
}

function metaSummary(meta?: Record<string, unknown> | null) {
  if (!meta) return '';
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(', ');
}

export function AuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit', entityType, action],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (entityType) params.entityType = entityType;
      if (action) params.action = action;
      return (await api.get('/audit', { params })).data as AuditResponse;
    },
  });

  return (
    <div>
      <div className="group-head" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Audit Log</h2>
        <span className="chip">{data?.logs.length ?? 0}</span>
      </div>

      <div className="filter-bar">
        <div className="field">
          <label>Entity</label>
          <select className="select" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">All entities</option>
            {data?.entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Action</label>
          <select className="select" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {data?.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {(entityType || action) && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setEntityType('');
              setAction('');
            }}
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 160 }}>
          <div className="spinner" />
        </div>
      ) : (
        <table className="task-table">
          <thead>
            <tr>
              <th style={{ width: 150 }}>When</th>
              <th style={{ width: 160 }}>Actor</th>
              <th style={{ width: 180 }}>Action</th>
              <th style={{ width: 90 }}>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {data?.logs.map((log) => (
              <tr key={log.id} className="task-row">
                <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {format(new Date(log.createdAt), 'd MMM yyyy, HH:mm')}
                </td>
                <td>
                  {log.actor ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar user={log.actor} size={22} />
                      <span>{log.actor.fullName}</span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-faint)' }}>system</span>
                  )}
                </td>
                <td>
                  <span className="pill">{log.action}</span>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{log.entityType}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{metaSummary(log.meta)}</td>
              </tr>
            ))}
            {!data?.logs.length && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--text-faint)', textAlign: 'center', padding: 18 }}>
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
