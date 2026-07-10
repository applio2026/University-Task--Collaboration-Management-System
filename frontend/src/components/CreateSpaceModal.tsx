import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import { Modal } from './Modal';

const COLORS = ['#0F766E', '#2563EB', '#7C3AED', '#B45309', '#BE123C', '#16A34A', '#0891B2', '#DB2777'];

export function CreateSpaceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      api.post('/spaces', { name: name.trim(), description: description.trim() || undefined, color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] });
      onClose();
    },
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setError('Only a Super Admin can create spaces.');
      } else {
        setError('Could not create the space. Please try again.');
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
    <Modal title="New Space" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Electrical Engineering"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
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
            {create.isPending ? 'Creating…' : 'Create space'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
