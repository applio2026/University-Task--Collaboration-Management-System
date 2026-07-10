import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import axios from 'axios';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import type { Announcement } from '../types';
import { Avatar } from './ui';

export function AnnouncementsPanel({ clusterId, canPost }: { clusterId: string; canPost: boolean }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: announcements } = useQuery({
    queryKey: ['announcements', clusterId],
    queryFn: async () =>
      (await api.get(`/clusters/${clusterId}/announcements`)).data.announcements as Announcement[],
  });

  // Live updates.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => qc.invalidateQueries({ queryKey: ['announcements', clusterId] });
    socket.on('announcement:new', refresh);
    socket.on('announcement:deleted', refresh);
    return () => {
      socket.off('announcement:new', refresh);
      socket.off('announcement:deleted', refresh);
    };
  }, [clusterId, qc]);

  const post = useMutation({
    mutationFn: async () =>
      api.post(`/clusters/${clusterId}/announcements`, { title: title.trim(), body: body.trim() }),
    onSuccess: () => {
      setTitle('');
      setBody('');
      qc.invalidateQueries({ queryKey: ['announcements', clusterId] });
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err) && err.response?.status === 403
          ? 'You need Teaching Assistant or Faculty rights to post.'
          : 'Could not post the announcement.',
      );
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/announcements/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements', clusterId] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError('Title and message are both required.');
      return;
    }
    post.mutate();
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {canPost && (
        <form onSubmit={onSubmit} className="stat-tile" style={{ marginBottom: 18 }}>
          <div className="field">
            <label>New announcement</label>
            <input
              className="input"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <textarea
              className="input"
              placeholder="Write a message to the cluster…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={post.isPending}>
              {post.isPending ? 'Posting…' : 'Post announcement'}
            </button>
          </div>
        </form>
      )}

      {announcements?.length === 0 && (
        <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No announcements yet.</div>
      )}

      {announcements?.map((a) => (
        <div key={a.id} className="stat-tile" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Avatar user={a.author} size={24} />
            <strong style={{ fontSize: 14 }}>{a.title}</strong>
            <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>
              {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
            </span>
            {(canPost || a.author.id === me?.id) && (
              <button
                title="Delete"
                onClick={() => remove.mutate(a.id)}
                style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {a.body}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>— {a.author.fullName}</div>
        </div>
      ))}
    </div>
  );
}
