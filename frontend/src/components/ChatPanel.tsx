import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import type { ChatMessage } from '../types';
import { Avatar } from './ui';

export function ChatPanel({ clusterId }: { clusterId: string }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useQuery({
    queryKey: ['chat', clusterId],
    queryFn: async () => (await api.get(`/clusters/${clusterId}/chat`)).data.messages as ChatMessage[],
  });

  // Live updates.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => qc.invalidateQueries({ queryKey: ['chat', clusterId] });
    socket.on('chat:new', refresh);
    socket.on('chat:deleted', refresh);
    return () => {
      socket.off('chat:new', refresh);
      socket.off('chat:deleted', refresh);
    };
  }, [clusterId, qc]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = useMutation({
    mutationFn: async (body: string) => api.post(`/clusters/${clusterId}/chat`, { body }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['chat', clusterId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/chat/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', clusterId] }),
  });

  function submit() {
    const body = text.trim();
    if (body) send.mutate(body);
  }

  return (
    <div
      style={{
        maxWidth: 720,
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 220px)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--surface)',
      }}
    >
      <div ref={listRef} className="scroll-y" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages?.length === 0 && (
          <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No messages yet — say hello 👋</div>
        )}
        {messages?.map((m) => {
          const mine = m.author.id === me?.id;
          return (
            <div
              key={m.id}
              style={{ display: 'flex', gap: 8, marginBottom: 12, flexDirection: mine ? 'row-reverse' : 'row' }}
            >
              <Avatar user={m.author} size={26} />
              <div style={{ maxWidth: '75%' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    justifyContent: mine ? 'flex-end' : 'flex-start',
                    marginBottom: 3,
                  }}
                >
                  <strong style={{ fontSize: 12 }}>{mine ? 'You' : m.author.fullName}</strong>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                  </span>
                  {mine && (
                    <button
                      title="Delete"
                      onClick={() => remove.mutate(m.id)}
                      style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11 }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div
                  className="comment-bubble"
                  style={{ whiteSpace: 'pre-wrap', background: mine ? 'var(--accent-050)' : undefined }}
                >
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="drawer-reply" style={{ borderTop: '1px solid var(--border)' }}>
        <textarea
          value={text}
          placeholder="Message the cluster…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="btn btn-primary" disabled={!text.trim() || send.isPending} onClick={submit}>
          ➤
        </button>
      </div>
    </div>
  );
}
