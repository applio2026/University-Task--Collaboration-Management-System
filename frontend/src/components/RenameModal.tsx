import { FormEvent, useState } from 'react';
import axios from 'axios';
import { Modal } from './Modal';

/**
 * Small reusable dialog for renaming an entity (Space / Cluster / Task).
 * `onSave` performs the PATCH and should throw on failure so the error surfaces.
 */
export function RenameModal({
  title,
  label,
  currentValue,
  minLength = 2,
  onSave,
  onClose,
}: {
  title: string;
  label: string;
  currentValue: string;
  minLength?: number;
  onSave: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(currentValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length < minLength) {
      setError(`Must be at least ${minLength} characters.`);
      return;
    }
    if (trimmed === currentValue.trim()) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      setError(
        axios.isAxiosError(err) && err.response?.status === 403
          ? 'You do not have permission to rename this.'
          : 'Could not save the new name. Please try again.',
      );
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>{label}</label>
          <input
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            onFocus={(e) => e.target.select()}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
