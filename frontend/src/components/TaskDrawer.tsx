import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import axios from 'axios';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import type { Comment, Task, TaskStatus } from '../types';
import { Avatar, AvatarStack, PriorityPill, statusLabel, statusColor } from './ui';
import { TaskAttachments } from './TaskAttachments';
import { SubmissionsPanel } from './SubmissionsPanel';
import { DependenciesPanel } from './DependenciesPanel';
import { SubtasksSection } from './SubtasksSection';
import { AssigneeManager } from './AssigneeManager';
import { TaskHistory } from './TaskHistory';
import { RenameModal } from './RenameModal';
import { useAuth } from '../store/auth';

const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'REJECTED', 'LATE'];

export function TaskDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [reply, setReply] = useState('');
  const [tab, setTab] = useState<'comments' | 'history'>('comments');
  const [managingAssignees, setManagingAssignees] = useState(false);
  const [assigneesExpanded, setAssigneesExpanded] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
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
      // Surfaces the "complete subtasks first" / "assignees not done" guards (400).
      setStatusError(
        axios.isAxiosError(err) && err.response?.data?.error?.message
          ? err.response.data.error.message
          : 'Could not change status.',
      );
    },
  });

  // A student moves their own assignment status; TA/Faculty/admin may move any.
  const changeAssigneeStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) =>
      api.patch(`/tasks/${taskId}/assignees/${userId}/status`, { status }),
    onSuccess: () => {
      setStatusError(null);
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['activity', taskId] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['cluster-tasks'] });
    },
    onError: (err) => {
      setStatusError(
        axios.isAxiosError(err) && err.response?.data?.error?.message
          ? err.response.data.error.message
          : 'Could not change assignee status.',
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
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '8px 0 6px' }}>
            <h3 style={{ margin: 0, flex: 1 }}>{task?.title ?? '…'}</h3>
            {task && me?.systemRole === 'SUPER_ADMIN' && (
              <button
                className="btn btn-ghost"
                title="Rename task"
                style={{ padding: '2px 8px', flexShrink: 0 }}
                onClick={() => setRenaming(true)}
              >
                ✎
              </button>
            )}
          </div>

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

          {/* Assignees — expandable, with each student's own status */}
          {task && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <button
                  onClick={() => setAssigneesExpanded((v) => !v)}
                  disabled={task.assignees.length === 0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none',
                    padding: 0, cursor: task.assignees.length ? 'pointer' : 'default',
                    fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase',
                  }}
                >
                  {task.assignees.length > 0 && <span>{assigneesExpanded ? '▾' : '▸'}</span>}
                  Assignees
                  {task.assignees.length > 0 && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      ({task.assignees.filter((a) => (a.status ?? 'OPEN') === 'COMPLETED').length}/
                      {task.assignees.length} done)
                    </span>
                  )}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '2px 8px' }}
                  onClick={() => setManagingAssignees((v) => !v)}
                >
                  {managingAssignees ? 'Cancel' : 'Manage'}
                </button>
              </div>

              {task.assignees.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>No assignees yet.</span>
              ) : !assigneesExpanded ? (
                <button
                  onClick={() => setAssigneesExpanded(true)}
                  title="Expand to see each student's status"
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                >
                  <AvatarStack users={task.assignees.map((a) => a.user)} />
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {task.assignees.map((a) => {
                    const st = a.status ?? 'OPEN';
                    const canEdit = a.user.id === me?.id || me?.systemRole === 'SUPER_ADMIN';
                    return (
                      <div
                        key={a.user.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}
                      >
                        <Avatar user={a.user} size={24} />
                        <span style={{ flex: 1, fontSize: 13 }}>
                          {a.user.fullName}
                          {a.user.id === me?.id && (
                            <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> (you)</span>
                          )}
                        </span>
                        {canEdit ? (
                          <select
                            className="select"
                            style={{ width: 138, padding: '3px 6px', fontSize: 12 }}
                            value={st}
                            disabled={changeAssigneeStatus.isPending}
                            onChange={(e) =>
                              changeAssigneeStatus.mutate({ userId: a.user.id, status: e.target.value })
                            }
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {statusLabel(s)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className="pill"
                            style={{
                              color: statusColor(st),
                              background: `color-mix(in srgb, ${statusColor(st)} 14%, transparent)`,
                            }}
                          >
                            {statusLabel(st)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
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

      {renaming && task && (
        <RenameModal
          title="Rename task"
          label="Task title"
          currentValue={task.title}
          minLength={1}
          onSave={async (title) => {
            await api.patch(`/tasks/${taskId}`, { title });
            qc.invalidateQueries({ queryKey: ['task', taskId] });
            qc.invalidateQueries({ queryKey: ['cluster-tasks'] });
            qc.invalidateQueries({ queryKey: ['overview'] });
          }}
          onClose={() => setRenaming(false)}
        />
      )}
    </>
  );
}
