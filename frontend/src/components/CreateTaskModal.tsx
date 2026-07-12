import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import type { MiniUser, TaskPriority } from '../types';
import { Modal } from './Modal';
import { AssigneePicker } from './AssigneePicker';

interface Member {
  role: string;
  user: MiniUser;
}

interface Template {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  priority: TaskPriority;
  payload: { subtasks?: string[]; checklist?: string[] };
}

const TYPES = ['ASSIGNMENT', 'LAB_TASK', 'PROJECT', 'GENERIC'];
const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function CreateTaskModal({
  clusterId,
  onClose,
}: {
  clusterId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('ASSIGNMENT');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [seededSubtasks, setSeededSubtasks] = useState<string[]>([]);
  const [seededChecklist, setSeededChecklist] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: members } = useQuery({
    queryKey: ['cluster-members', clusterId],
    queryFn: async () => (await api.get(`/clusters/${clusterId}/members`)).data.members as Member[],
  });

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/templates')).data.templates as Template[],
  });

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates?.find((t) => t.id === id);
    if (!tpl) {
      setSeededSubtasks([]);
      setSeededChecklist([]);
      return;
    }
    if (!title.trim()) setTitle(tpl.name);
    if (tpl.description) setDescription(tpl.description);
    setType(tpl.type);
    setPriority(tpl.priority);
    setSeededSubtasks(tpl.payload?.subtasks ?? []);
    setSeededChecklist(tpl.payload?.checklist ?? []);
  }

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/clusters/${clusterId}/tasks`, {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        assigneeIds: assigneeIds.length ? assigneeIds : undefined,
        subtasks: seededSubtasks.length ? seededSubtasks : undefined,
        checklist: seededChecklist.length ? seededChecklist : undefined,
        recurrenceRule: recurrence || undefined,
      });
      const task = data.task as { id: string };
      if (files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        await api.post(`/tasks/${task.id}/attachments`, fd);
      }
      return task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cluster-tasks', clusterId] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      onClose();
    },
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setError('You do not have permission to create tasks in this cluster.');
      } else {
        setError('Could not create task. Please try again.');
      }
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    create.mutate();
  }

  return (
    <Modal title="New Task" onClose={onClose}>
      <form onSubmit={onSubmit}>
        {templates && templates.length > 0 && (
          <div className="field">
            <label>Start from template</label>
            <select className="select" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">— None —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {(seededSubtasks.length > 0 || seededChecklist.length > 0) && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                Adds {seededSubtasks.length} subtasks · {seededChecklist.length} checklist items
              </div>
            )}
          </div>
        )}
        <div className="field">
          <label>Title</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Assignment 2: Query Optimization"
            autoFocus
          />
        </div>

        <div className="field">
          <label>Description</label>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details…"
          />
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
            <select
              className="select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0] + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Due date</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Repeat</label>
            <select className="select" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="">Does not repeat</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Assignees ({assigneeIds.length} selected)</label>
          {members?.length ? (
            <AssigneePicker members={members} selected={assigneeIds} onChange={setAssigneeIds} />
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              No members in this cluster to assign yet.
            </div>
          )}
        </div>

        <div className="field">
          <label>Attachments</label>
          <input
            className="input"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.pdf,image/jpeg,image/png,image/gif,image/webp,image/bmp,application/pdf"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 && (
            <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', fontSize: 12, color: 'var(--text-muted)' }}>
              {files.map((f, i) => (
                <li key={i}>📎 {f.name} ({Math.ceil(f.size / 1024)} KB)</li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
