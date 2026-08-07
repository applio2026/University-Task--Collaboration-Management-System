import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useActiveWorkspace } from '../store/workspace';
import type { Space, Workspace } from '../types';
import { initials } from '../components/ui';
import { CreateSpaceModal } from '../components/CreateSpaceModal';
import { RenameModal } from '../components/RenameModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';

export function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const { activeWorkspaceId, setActiveWorkspace } = useActiveWorkspace();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: workspace } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: async () => (await api.get(`/workspaces/${workspaceId}`)).data.workspace as Workspace & { description?: string },
    enabled: !!workspaceId,
  });

  const { data: spaces, isLoading } = useQuery({
    queryKey: ['workspace-spaces', workspaceId],
    queryFn: async () => (await api.get(`/workspaces/${workspaceId}/spaces`)).data.spaces as Space[],
    enabled: !!workspaceId,
  });

  const canManage = me?.systemRole === 'SUPER_ADMIN' || me?.systemRole === 'ADMIN';

  const deleteWorkspace = useMutation({
    mutationFn: async () => api.delete(`/workspaces/${workspaceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      if (activeWorkspaceId === workspaceId) setActiveWorkspace(null);
      navigate('/');
    },
  });

  return (
    <div>
      <div className="group-head" style={{ marginBottom: 4 }}>
        <span className="badge-square" style={{ background: workspace?.color ?? 'var(--accent)', width: 28, height: 28 }}>
          {workspace ? initials(workspace.name) : '?'}
        </span>
        <h2 style={{ margin: 0 }}>{workspace?.name ?? 'Workspace'}</h2>
        {canManage && workspace && (
          <button
            className="btn btn-ghost"
            title="Rename workspace"
            style={{ padding: '2px 8px' }}
            onClick={() => setRenaming(true)}
          >
            ✎ Rename
          </button>
        )}
        {canManage && workspace && (
          <button
            className="btn btn-ghost"
            title="Delete workspace"
            style={{ padding: '2px 8px', color: 'var(--p-urgent)' }}
            onClick={() => setDeleting(true)}
          >
            🗑 Delete
          </button>
        )}
        {canManage && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}>
            ＋ New Space
          </button>
        )}
      </div>
      {workspace?.description && (
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>{workspace.description}</p>
      )}

      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 160 }}>
          <div className="spinner" />
        </div>
      ) : spaces?.length ? (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {spaces.map((s) => (
            <button
              key={s.id}
              className="stat-tile"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => navigate(`/spaces/${s.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="badge-square" style={{ background: s.color, width: 22, height: 22, fontSize: 10 }}>
                  {initials(s.name)}
                </span>
                <strong>{s.name}</strong>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {s._count?.clusters ?? 0} clusters · {s._count?.memberships ?? 0} members
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>
          No spaces in this workspace yet{canManage ? ' — create one to get started.' : '.'}
        </div>
      )}

      {creating && workspaceId && (
        <CreateSpaceModal
          workspaceId={workspaceId}
          workspaceName={workspace?.name ?? ''}
          onClose={() => setCreating(false)}
        />
      )}

      {renaming && workspace && (
        <RenameModal
          title="Rename workspace"
          label="Workspace name"
          currentValue={workspace.name}
          onSave={async (name) => {
            await api.patch(`/workspaces/${workspace.id}`, { name });
            qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
            qc.invalidateQueries({ queryKey: ['workspaces'] });
          }}
          onClose={() => setRenaming(false)}
        />
      )}

      {deleting && workspace && (
        <ConfirmDeleteModal
          title="Delete workspace"
          entityLabel="workspace"
          entityName={workspace.name}
          warning="This archives the workspace and every Space, Cluster and Task inside it. A Super Admin can restore each of them later from the Archive page, but restoring the workspace itself won't automatically bring its contents back."
          onConfirm={() => deleteWorkspace.mutateAsync().then(() => undefined)}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
