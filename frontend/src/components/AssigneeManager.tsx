import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import { AssigneePicker, PickerMember } from './AssigneePicker';

export function AssigneeManager({
  taskId,
  clusterId,
  currentAssigneeIds,
  onClose,
}: {
  taskId: string;
  clusterId?: string;
  currentAssigneeIds: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>(currentAssigneeIds);
  const [error, setError] = useState<string | null>(null);

  const { data: members } = useQuery({
    queryKey: ['cluster-members', clusterId],
    queryFn: async () => (await api.get(`/clusters/${clusterId}/members`)).data.members as PickerMember[],
    enabled: !!clusterId,
  });

  const save = useMutation({
    mutationFn: async () => api.put(`/tasks/${taskId}/assignees`, { userIds: selected }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['cluster-tasks', clusterId] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      onClose();
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err) && err.response?.status === 403
          ? 'Only Managers or Faculty can set assignees.'
          : 'Could not update assignees.',
      );
    },
  });

  return (
    <div style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8, marginTop: 8 }}>
      <AssigneePicker members={members ?? []} selected={selected} onChange={setSelected} />

      {error && <p className="form-error">{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : `Save (${selected.length})`}
        </button>
      </div>
    </div>
  );
}
