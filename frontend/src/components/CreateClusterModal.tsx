import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import type { Cluster } from '../types';
import { Modal } from './Modal';

const KINDS = ['CLASS', 'SUBJECT', 'LAB', 'PROJECT', 'RESEARCH_GROUP', 'SEMESTER', 'GENERIC'];
const COLORS = ['#2563EB', '#0891B2', '#7C3AED', '#16A34A', '#EA580C', '#DB2777', '#0F766E', '#B45309'];

export function CreateClusterModal({
  spaceId,
  spaceName,
  onClose,
}: {
  spaceId: string;
  spaceName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('SUBJECT');
  const [color, setColor] = useState(COLORS[0]);
  const [parentClusterId, setParentClusterId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Existing clusters in this space, to allow nesting under a parent.
  const { data: clusters } = useQuery({
    queryKey: ['clusters', spaceId],
    queryFn: async () => (await api.get(`/spaces/${spaceId}/clusters`)).data.clusters as Cluster[],
  });

  const create = useMutation({
    mutationFn: async () =>
      api.post(`/spaces/${spaceId}/clusters`, {
        name: name.trim(),
        kind,
        color,
        parentClusterId: parentClusterId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clusters', spaceId] });
      qc.invalidateQueries({ queryKey: ['spaces'] });
      onClose();
    },
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setError('You need Space Admin rights on this space to add clusters.');
      } else {
        setError('Could not create the cluster. Please try again.');
      }
    },
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
    <Modal title={`New Cluster in ${spaceName}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Data Structures"
            autoFocus
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Kind</label>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Parent cluster (optional)</label>
            <select
              className="select"
              value={parentClusterId}
              onChange={(e) => setParentClusterId(e.target.value)}
            >
              <option value="">None (top level)</option>
              {clusters?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                aria-label={c}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: c,
                  cursor: 'pointer',
                  border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create cluster'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
