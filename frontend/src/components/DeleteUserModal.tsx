import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import { Modal } from './Modal';

export function DeleteUserModal({
  userId,
  userName,
  email,
  onClose,
}: {
  userId: string;
  userName: string;
  email: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: async () => {
      await api.delete(`/users/${userId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => {
      // Surface the server's message (e.g. "user has created content — deactivate instead").
      setError(
        axios.isAxiosError(err) && err.response?.data?.error?.message
          ? err.response.data.error.message
          : 'Could not delete the user. Please try again.',
      );
    },
  });

  return (
    <Modal title={`Delete user — ${userName}`} onClose={onClose}>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        Permanently delete <strong>{email}</strong>? This removes their memberships and task
        assignments. If they've created tasks or other content, deletion is blocked — deactivate them
        instead.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ background: '#DC2626', borderColor: '#DC2626' }}
          disabled={del.isPending}
          onClick={() => {
            setError(null);
            del.mutate();
          }}
        >
          {del.isPending ? 'Deleting…' : 'Delete user'}
        </button>
      </div>
    </Modal>
  );
}
