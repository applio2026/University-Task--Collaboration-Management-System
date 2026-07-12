import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import type { Cluster, Task } from '../types';
import { TaskTable } from '../components/TaskTable';
import { TaskDrawer } from '../components/TaskDrawer';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { AnnouncementsPanel } from '../components/AnnouncementsPanel';
import { ChatPanel } from '../components/ChatPanel';
import { ClusterFiles } from '../components/ClusterFiles';
import { ClusterMembers } from '../components/ClusterMembers';
import { RenameModal } from '../components/RenameModal';
import { initials } from '../components/ui';

type ClusterDetail = Cluster & {
  space: { name: string; color: string };
  memberships?: { role: string; user: { id: string } }[];
};

type Tab = 'tasks' | 'announcements' | 'chat' | 'files' | 'members';
const TABS: { key: Tab; label: string }[] = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'chat', label: 'Chat' },
  { key: 'members', label: 'Members' },
  { key: 'files', label: 'Files' },
];

export function ClusterPage() {
  const { clusterId } = useParams<{ clusterId: string }>();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [tab, setTab] = useState<Tab>('tasks');

  const { data: cluster } = useQuery({
    queryKey: ['cluster', clusterId],
    queryFn: async () => (await api.get(`/clusters/${clusterId}`)).data.cluster as ClusterDetail,
    enabled: !!clusterId,
  });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['cluster-tasks', clusterId],
    queryFn: async () => (await api.get(`/clusters/${clusterId}/tasks`)).data.tasks as Task[],
    enabled: !!clusterId && tab === 'tasks',
  });

  // Can the current user post announcements / add members? (Faculty / TA / Super Admin.)
  const myRole = cluster?.memberships?.find((m) => m.user.id === me?.id)?.role;
  const isSuper = me?.systemRole === 'SUPER_ADMIN';
  const canPost = isSuper || myRole === 'CLUSTER_ADMIN' || myRole === 'TEACHING_ASSISTANT';
  // Removing members / renaming the cluster stays with Faculty and admins.
  const canManageRoles = isSuper || myRole === 'CLUSTER_ADMIN';

  // Join the cluster's realtime room for live task/comment/chat/announcement updates.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !clusterId) return;
    socket.emit('cluster:join', clusterId);
    const refresh = () => qc.invalidateQueries({ queryKey: ['cluster-tasks', clusterId] });
    socket.on('task:created', refresh);
    socket.on('task:updated', refresh);
    return () => {
      socket.emit('cluster:leave', clusterId);
      socket.off('task:created', refresh);
      socket.off('task:updated', refresh);
    };
  }, [clusterId, qc]);

  return (
    <div>
      <div className="group-head" style={{ marginBottom: 4 }}>
        <span className="badge-square" style={{ background: cluster?.color ?? 'var(--accent)', width: 28, height: 28 }}>
          {cluster ? initials(cluster.name) : '?'}
        </span>
        <h2 style={{ margin: 0 }}>{cluster?.name ?? 'Cluster'}</h2>
        <span className="chip">{cluster?.kind}</span>
        {isSuper && cluster && (
          <button
            className="btn btn-ghost"
            title="Rename cluster"
            style={{ padding: '2px 8px' }}
            onClick={() => setRenaming(true)}
          >
            ✎ Rename
          </button>
        )}
        {tab === 'tasks' && (
          <button
            className="btn btn-primary"
            style={{ marginLeft: 'auto' }}
            onClick={() => setCreating(true)}
            disabled={!clusterId}
          >
            ＋ New Task
          </button>
        )}
      </div>

      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tasks' &&
        (isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', height: 160 }}>
            <div className="spinner" />
          </div>
        ) : (
          <TaskTable tasks={tasks ?? []} onOpen={setOpenTask} invalidateKey={['cluster-tasks', clusterId]} bulk />
        ))}

      {tab === 'announcements' && clusterId && (
        <AnnouncementsPanel clusterId={clusterId} canPost={canPost} />
      )}

      {tab === 'chat' && clusterId && <ChatPanel clusterId={clusterId} />}

      {tab === 'members' && clusterId && (
        <ClusterMembers clusterId={clusterId} canManage={canPost} canManageRoles={canManageRoles} />
      )}

      {tab === 'files' && clusterId && <ClusterFiles clusterId={clusterId} />}

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} />}
      {creating && clusterId && <CreateTaskModal clusterId={clusterId} onClose={() => setCreating(false)} />}

      {renaming && cluster && clusterId && (
        <RenameModal
          title="Rename cluster"
          label="Cluster name"
          currentValue={cluster.name}
          onSave={async (name) => {
            await api.patch(`/clusters/${clusterId}`, { name });
            qc.invalidateQueries({ queryKey: ['cluster', clusterId] });
            qc.invalidateQueries({ queryKey: ['clusters'] });
          }}
          onClose={() => setRenaming(false)}
        />
      )}
    </div>
  );
}
