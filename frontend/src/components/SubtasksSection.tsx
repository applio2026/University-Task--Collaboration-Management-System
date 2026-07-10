import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Subtask } from '../types';
import { statusColor } from './ui';

export function SubtasksSection({ taskId, subtasks }: { taskId: string; subtasks: Subtask[] }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task', taskId] });
    qc.invalidateQueries({ queryKey: ['overview'] });
    qc.invalidateQueries({ queryKey: ['cluster-tasks'] });
  };

  const add = useMutation({
    mutationFn: async (t: string) => api.post(`/tasks/${taskId}/subtasks`, { title: t }),
    onSuccess: () => {
      setTitle('');
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.patch(`/tasks/${taskId}/subtasks/${id}`, { status }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/tasks/${taskId}/subtasks/${id}`),
    onSuccess: invalidate,
  });

  const done = subtasks.filter((s) => s.status === 'COMPLETED').length;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 6 }}>
        Subtasks {subtasks.length ? `(${done}/${subtasks.length})` : ''}
      </div>

      {subtasks.map((s) => {
        const isDone = s.status === 'COMPLETED';
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={isDone}
              onChange={() => toggle.mutate({ id: s.id, status: isDone ? 'OPEN' : 'COMPLETED' })}
            />
            <span
              style={{
                flex: 1,
                color: isDone ? 'var(--text-faint)' : 'var(--text)',
                textDecoration: isDone ? 'line-through' : 'none',
              }}
            >
              {s.title}
            </span>
            <span style={{ fontSize: 11, color: statusColor(s.status) }}>{isDone ? 'Completed' : 'Open'}</span>
            <button
              title="Remove subtask"
              onClick={() => remove.mutate(s.id)}
              style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        );
      })}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.mutate(title.trim());
        }}
        style={{ display: 'flex', gap: 6, marginTop: 6 }}
      >
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a subtask…"
          style={{ flex: 1 }}
        />
        <button className="btn btn-ghost" type="submit" disabled={!title.trim() || add.isPending}>
          ＋ Add
        </button>
      </form>
    </div>
  );
}
