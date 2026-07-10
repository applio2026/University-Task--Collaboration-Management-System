import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import axios from 'axios';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import type { Comment, Task, TaskStatus } from '../types';
import { Avatar, AvatarStack, PriorityPill, statusLabel } from './ui';
import { TaskAttachments } from './TaskAttachments';
import { SubmissionsPanel } from './SubmissionsPanel';
import { DependenciesPanel } from './DependenciesPanel';
import { SubtasksSection } from './SubtasksSection';
import { AssigneeManager } from './AssigneeManager';
import { TaskHistory } from './TaskHistory';

const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'REJECTED', 'LATE'];

export function TaskDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const [tab, setTab] = useState<'comments' | 'history'>('comments');
  const [managingAssignees, setManagingAssignees] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const { data: task } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}`)).data.task as Task,
  });

  const { data: comments } = useQuery({
    queryKey: ['comments', taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}/comments`)).data.comments as Comment[],
  });

  const addComment = useMutation({
    mutationFn: async (body: string) => (await api.post(`/tasks/${taskId}/comments`, { body })).data.comment,
    onSuccess: () => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['comments', taskId] });
      qc.invalidateQueries({ queryKey: ['activity', taskId] });
    },
  });

  const changeStatus = useMutation({
    mutationFn: async (status: string) => api.patch(`/tasks/${taskId}`, { status }),
    onSuccess: () => {
      setStatusError(null);
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['activity', taskId] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['cluster-tasks'] });
    },
    onError: (err) => {
      // Surfaces the "complete subtasks first" guard (400) among others.
      setStatusError(
        axios.isAxiosError(err) && err.response?.data?.error?.message
          ? err.response.data.error.message
          : 'Could not change status.',
      );
    },
  });

  // Live updates for this task's comments.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (payload: { taskId: string }) => {
      if (payload.taskId === taskId) qc.invalidateQueries({ queryKey: ['comments', taskId] });
    };
    socket.on('comment:new', handler);
    return () => {
      socket.off('comment:new', handler);
    };
  }, [taskId, qc]);

  useEffect(() => {
    if (tab === 'comments') bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [comments, tab]);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <button className="btn-ghost" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18 }}>
              ←
            </button>
            {task && <PriorityPill priority={task.priority} />}
          </div>
          <h3 style={{ margin: '8px 0 6px' }}>{task?.title ?? '…'}</h3>

          {task && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="select"
                style={{ width: 150 }}
                value={task.status}
                onChange={(e) => changeStatus.mutate(e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
              {task.dueDate && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Due {new Date(task.dueDate).toLocaleDateString()}
                </span>
              )}
              {task.recurrenceRule && (
                <span className="chip" title="Completing this task creates the next occurrence">
                  🔁 {task.recurrenceRule[0] + task.recurrenceRule.slice(1).toLowerCase()}
                </span>
              )}
            </div>
          )}
          {statusError && <p className="form-error">{statusError}</p>}

          {task?.description && (
            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
              {task.description}
            </p>
          )}

          {/* Assignees — manageable after creation */}
          {task && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
                  Assignees
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '2px 8px' }}
                  onClick={() => setManagingAssignees((v) => !v)}
                >
                  {managingAssignees ? 'Cancel' : 'Manage'}
                </button>
              </div>
              {task.assignees.length > 0 ? (
                <AvatarStack users={task.assignees.map((a) => a.user)} />
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>No assignees yet.</span>
              )}
              {managingAssignees && (
                <AssigneeManager
                  taskId={taskId}
                  clusterId={task.clusterId}
                  currentAssigneeIds={task.assignees.map((a) => a.user.id)}
                  onClose={() => setManagingAssignees(false)}
                />
              )}
            </div>
          )}

          {task && <SubtasksSection taskId={taskId} subtasks={task.subtasks} />}
          {task && <TaskAttachments taskId={taskId} />}
          {task && <SubmissionsPanel taskId={taskId} />}
          {task && <DependenciesPanel taskId={taskId} clusterId={task.clusterId} />}
        </div>

        <div className="tab-bar" style={{ margin: 0, padding: '0 18px' }}>
          <button className={`tab ${tab === 'comments' ? 'tab-active' : ''}`} onClick={() => setTab('comments')}>
            Comments
          </button>
          <button className={`tab ${tab === 'history' ? 'tab-active' : ''}`} onClick={() => setTab('history')}>
            History
          </button>
        </div>

        <div className="drawer-body scroll-y" ref={bodyRef}>
          {tab === 'comments' ? (
            <>
              {comments?.length === 0 && (
                <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No comments yet — start the discussion.</div>
              )}
              {comments?.map((c) => (
                <div className="comment" key={c.id}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
                    <Avatar user={c.author} size={22} />
                    <strong style={{ fontSize: 13 }}>{c.author.fullName}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="comment-bubble">{c.body}</div>
                </div>
              ))}
            </>
          ) : (
            <TaskHistory taskId={taskId} />
          )}
        </div>

        {tab === 'comments' && (
          <div className="drawer-reply">
            <textarea
              value={reply}
              placeholder="Reply…"
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (reply.trim()) addComment.mutate(reply.trim());
                }
              }}
            />
            <button
              className="btn btn-primary"
              disabled={!reply.trim() || addComment.isPending}
              onClick={() => reply.trim() && addComment.mutate(reply.trim())}
            >
              ➤
            </button>
          </div>
        )}
      </div>
    </>
  );
}
