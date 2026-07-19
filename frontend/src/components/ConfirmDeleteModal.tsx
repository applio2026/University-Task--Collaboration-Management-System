import { FormEvent, useState } from 'react';
import axios from 'axios';
import { Modal } from './Modal';

/**
 * Confirmation dialog for a destructive delete (archive) action. Requires
 * typing the entity's exact name before the button enables, since deleting a
 * Workspace/Space can take an entire tree of Spaces/Clusters/Tasks with it —
 * a plain "Are you sure?" is too easy to click through by habit.
 */
export function ConfirmDeleteModal({
  title,
  entityLabel,
  entityName,
  warning,
  onConfirm,
  onClose,
}: {
  title: string;
  entityLabel: string;
  entityName: string;
  warning: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (typed !== entityName) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(
        axios.isAxiosError(err) && err.response?.status === 403
          ? 'You do not have permission to delete this.'
          : 'Could not delete. Please try again.',
      );
      setDeleting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>{warning}</p>
        <div className="field">
          <label>
            Type <strong>{entityName}</strong> to confirm
          </label>
          <input
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={entityLabel}
            autoFocus
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ background: 'var(--p-urgent)', borderColor: 'var(--p-urgent)' }}
            disabled={typed !== entityName || deleting}
          >
            {deleting ? 'Deleting…' : `Delete ${entityLabel}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
