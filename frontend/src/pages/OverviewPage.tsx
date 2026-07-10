import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { OverviewGroup } from '../types';
import { TaskTable } from '../components/TaskTable';
import { TaskDrawer } from '../components/TaskDrawer';
import { initials } from '../components/ui';

function AddTaskInline({ clusterId, onDone }: { clusterId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: async () => api.post(`/clusters/${clusterId}/tasks`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overview'] });
      setTitle('');
      onDone();
    },
  });
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 4px' }}>
      <input
        autoFocus
        value={title}
        placeholder="Task title…"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && title.trim() && create.mutate()}
        style={{
          flex: 1,
          padding: '7px 10px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface)',
          color: 'var(--text)',
        }}
      />
      <button className="btn btn-primary btn-sm" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
        Add
      </button>
      <button className="btn btn-sm" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}

export function OverviewPage() {
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const { data: groups, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: async () => (await api.get('/tasks/overview')).data.groups as OverviewGroup[],
  });

  if (isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  const visible = groups?.filter((g) => g.tasks.length > 0 || adding === g.cluster.id) ?? [];

  return (
    <div>
      {groups && groups.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
          You are not a member of any cluster yet.
        </div>
      )}

      {(visible.length ? visible : groups ?? []).map((g) => (
        <div className="group" key={g.cluster.id}>
          <div className="group-head">
            <span className="group-title-chip chip" style={{ background: 'var(--surface-2)' }}>
              <span className="badge-square" style={{ background: g.space.color, width: 18, height: 18, fontSize: 9 }}>
                {initials(g.space.name)}
              </span>
              {g.space.name}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>/</span>
            <span className="group-title-chip chip" style={{ background: 'var(--surface-2)' }}>
              <span className="badge-square" style={{ background: g.cluster.color, width: 18, height: 18, fontSize: 9 }}>
                {initials(g.cluster.name)}
              </span>
              {g.cluster.name}
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={() => setAdding(adding === g.cluster.id ? null : g.cluster.id)}>
              ＋ Add Task
            </button>
          </div>

          {adding === g.cluster.id && <AddTaskInline clusterId={g.cluster.id} onDone={() => setAdding(null)} />}

          <TaskTable tasks={g.tasks} onOpen={setOpenTask} invalidateKey={['overview']} />
        </div>
      ))}

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}
