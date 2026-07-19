import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploader?: { id: string; fullName: string };
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskAttachments({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const { data: attachments } = useQuery({
    queryKey: ['attachments', taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}/attachments`)).data.attachments as Attachment[],
  });

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      await api.post(`/tasks/${taskId}/attachments`, fd);
    },
    onSettled: () => {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['attachments', taskId] });
    },
    onMutate: () => setBusy(true),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', taskId] }),
  });

  // Download needs the Bearer token, so fetch as a blob then trigger a save.
  async function download(att: Attachment) {
    const res = await api.get(`/attachments/${att.id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
          Attachments {attachments?.length ? `(${attachments.length})` : ''}
        </div>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: '2px 8px' }}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Uploading…' : '＋ Add'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.pdf,.txt,image/jpeg,image/png,image/gif,image/webp,image/bmp,application/pdf,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) uploadMut.mutate(files);
          }}
        />
      </div>

      {attachments?.length ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {attachments.map((att) => (
            <li
              key={att.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 6,
                fontSize: 13,
              }}
            >
              <span>📎</span>
              <button
                className="task-name-btn"
                title="Download"
                onClick={() => download(att)}
                style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {att.fileName}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{humanSize(att.sizeBytes)}</span>
              <button
                title="Remove"
                onClick={() => removeMut.mutate(att.id)}
                style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No files attached.</div>
      )}
    </div>
  );
}
