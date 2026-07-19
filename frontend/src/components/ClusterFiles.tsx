import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Avatar } from './ui';
import type { MiniUser } from '../types';

interface FileAsset {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  uploader?: MiniUser | null;
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ClusterFiles({ clusterId }: { clusterId: string }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const { data: files } = useQuery({
    queryKey: ['cluster-files', clusterId],
    queryFn: async () => (await api.get(`/clusters/${clusterId}/files`)).data.files as FileAsset[],
  });

  const uploadMut = useMutation({
    mutationFn: async (picked: File[]) => {
      const fd = new FormData();
      picked.forEach((f) => fd.append('files', f));
      await api.post(`/clusters/${clusterId}/files`, fd);
    },
    onSettled: () => {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['cluster-files', clusterId] });
    },
    onMutate: () => setBusy(true),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/clusters/${clusterId}/files/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cluster-files', clusterId] }),
  });

  async function download(f: FileAsset) {
    const res = await api.get(`/clusters/${clusterId}/files/${f.id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Shared files for this cluster — anyone in the cluster can upload and download.
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : '＋ Upload files'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.pdf,.txt,image/jpeg,image/png,image/gif,image/webp,image/bmp,application/pdf,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length) uploadMut.mutate(picked);
          }}
        />
      </div>

      {files?.length ? (
        <table className="task-table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 160 }}>Uploaded by</th>
              <th style={{ width: 90 }}>Size</th>
              <th style={{ width: 110 }}>Date</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id} className="task-row">
                <td>
                  <button className="task-name-btn" onClick={() => download(f)} title="Download">
                    📎 {f.fileName}
                  </button>
                </td>
                <td>
                  {f.uploader ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar user={f.uploader} size={20} />
                      <span style={{ fontSize: 12 }}>{f.uploader.fullName}</span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-faint)' }}>—</span>
                  )}
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{humanSize(f.sizeBytes)}</td>
                <td style={{ color: 'var(--text-muted)' }}>{format(new Date(f.createdAt), 'd MMM yyyy')}</td>
                <td style={{ textAlign: 'right' }}>
                  {(f.uploadedBy === me?.id || me?.systemRole === 'SUPER_ADMIN') && (
                    <button
                      title="Delete"
                      onClick={() => removeMut.mutate(f.id)}
                      style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No files yet — upload the first one.</div>
      )}
    </div>
  );
}
