import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TaskPriority } from '../types';
import { Modal } from '../components/Modal';

interface Template {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  priority: TaskPriority;
  payload: { subtasks?: string[]; checklist?: string[] };
  createdAt: string;
}

const TYPES = ['ASSIGNMENT', 'LAB_TASK', 'PROJECT', 'GENERIC'];
const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('ASSIGNMENT');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [subtasks, setSubtasks] = useState('');
  const [checklist, setChecklist] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      api.post('/templates', {
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        priority,
        subtasks: subtasks.split('\n').map((s) => s.trim()).filter(Boolean),
        checklist: checklist.split('\n').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      onClose();
    },
    onError: () => setError('Could not create the template.'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    create.mutate();
  }

  return (
    <Modal title="New Template" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly Lab Report" autoFocus />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional default description" />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Type</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Priority</label>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0] + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Subtasks (one per line)</label>
          <textarea className="input" value={subtasks} onChange={(e) => setSubtasks(e.target.value)} placeholder={'Read the material\nWrite the report\nSubmit'} />
        </div>
        <div className="field">
          <label>Checklist (one per line)</label>
          <textarea className="input" value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder={'Cite sources\nInclude diagrams'} />
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create template'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TemplatesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/templates')).data.templates as Template[],
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  return (
    <div>
      <div className="group-head" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Task Templates</h2>
        <span className="chip">{templates?.length ?? 0}</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}>
          ＋ New Template
        </button>
      </div>

      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Reusable task blueprints. Pick one in the <strong>New Task</strong> dialog to pre-fill the fields, subtasks and checklist.
      </p>

      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 160 }}>
          <div className="spinner" />
        </div>
      ) : templates?.length ? (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {templates.map((t) => (
            <div key={t.id} className="stat-tile">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <strong>{t.name}</strong>
                <button
                  title="Delete"
                  onClick={() => remove.mutate(t.id)}
                  style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <span className="chip">{t.type.replace('_', ' ')}</span>
                <span className="chip">{t.priority[0] + t.priority.slice(1).toLowerCase()}</span>
              </div>
              {t.description && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t.description}</div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {t.payload?.subtasks?.length ?? 0} subtasks · {t.payload?.checklist?.length ?? 0} checklist items
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No templates yet — create one to get started.</div>
      )}

      {creating && <CreateTemplateModal onClose={() => setCreating(false)} />}
    </div>
  );
}
