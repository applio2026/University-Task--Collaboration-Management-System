import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import type { Task, TaskStatus } from '../types';
import { StatusDot, statusLabel } from './ui';

interface DepTask {
  id: string;
  title: string;
  status: TaskStatus;
}
interface DepEdge {
  id: string;
  task: DepTask;
}
interface Deps {
  blocks: DepEdge[];
  blockedBy: DepEdge[];
}

export function DependenciesPanel({ taskId, clusterId }: { taskId: string; clusterId?: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [direction, setDirection] = useState<'blocks' | 'blocked_by'>('blocked_by');
  const [relatedTaskId, setRelatedTaskId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['dependencies', taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}/dependencies`)).data as Deps,
  });

  // Candidate tasks in the same cluster (excluding this one).
  const { data: siblings } = useQuery({
    queryKey: ['cluster-tasks', clusterId],
    queryFn: async () => (await api.get(`/clusters/${clusterId}/tasks`)).data.tasks as Task[],
    enabled: !!clusterId && adding,
  });

  const add = useMutation({
    mutationFn: async () => api.post(`/tasks/${taskId}/dependencies`, { relatedTaskId, direction }),
    onSuccess: () => {
      setAdding(false);
      setRelatedTaskId('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['dependencies', taskId] });
    },
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setError('Only Teaching Assistants or Faculty can set dependencies.');
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(err.response.data?.error?.message ?? 'Invalid dependency.');
      } else {
        setError('Could not add the dependency.');
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/tasks/${taskId}/dependencies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dependencies', taskId] }),
  });

  function row(edge: DepEdge) {
    return (
      <div
        key={edge.id}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}
      >
        <StatusDot status={edge.task.status} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {edge.task.title}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{statusLabel(edge.task.status)}</span>
        <button
          title="Remove"
          onClick={() => remove.mutate(edge.id)}
          style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
    );
  }

  const hasAny = (data?.blocks.length ?? 0) + (data?.blockedBy.length ?? 0) > 0;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
          Dependencies
        </div>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: '2px 8px' }}
          onClick={() => setAdding((a) => !a)}
        >
          {adding ? 'Cancel' : '＋ Add'}
        </button>
      </div>

      {adding && (
        <div style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 8 }}>
              <label>This task…</label>
              <select
                className="select"
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'blocks' | 'blocked_by')}
              >
                <option value="blocked_by">is blocked by</option>
                <option value="blocks">blocks</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Task</label>
              <select className="select" value={relatedTaskId} onChange={(e) => setRelatedTaskId(e.target.value)}>
                <option value="">Select a task…</option>
                {siblings
                  ?.filter((t) => t.id !== taskId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={!relatedTaskId || add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? 'Adding…' : 'Add dependency'}
            </button>
          </div>
        </div>
      )}

      {!hasAny && !adding && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No dependencies.</div>
      )}

      {(data?.blockedBy.length ?? 0) > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>⛔ Blocked by</div>
          {data?.blockedBy.map(row)}
        </div>
      )}
      {(data?.blocks.length ?? 0) > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>➡ Blocks</div>
          {data?.blocks.map(row)}
        </div>
      )}
    </div>
  );
}
