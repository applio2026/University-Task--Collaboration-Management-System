import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { Cluster, Space, Workspace } from '../types';
import { initials } from './ui';
import { useOrgName } from '../lib/useOrgName';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import { CreateSpaceModal } from './CreateSpaceModal';
import { CreateClusterModal } from './CreateClusterModal';

function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => (await api.get('/workspaces')).data.workspaces as Workspace[],
  });
}

function ClusterList({ spaceId }: { spaceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['clusters', spaceId],
    queryFn: async () => (await api.get(`/spaces/${spaceId}/clusters`)).data.clusters as Cluster[],
  });
  if (isLoading) return <div style={{ padding: '4px 0 4px 58px', color: 'var(--text-faint)', fontSize: 12 }}>…</div>;
  if (!data?.length) return <div style={{ padding: '4px 0 4px 58px', color: 'var(--text-faint)', fontSize: 12 }}>No clusters</div>;
  return (
    <div>
      {data.map((c) => (
        <NavLink
          key={c.id}
          to={`/clusters/${c.id}`}
          className="side-item"
          style={({ isActive }) => ({ paddingLeft: 58, ...(isActive ? { background: 'var(--surface-2)', color: 'var(--text)' } : {}) })}
        >
          <span className="badge-square" style={{ background: c.color, width: 16, height: 16, fontSize: 9 }}>
            {initials(c.name)}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
        </NavLink>
      ))}
    </div>
  );
}

function SpaceRow({
  space,
  canAddCluster,
  onAddCluster,
}: {
  space: Space;
  canAddCluster: boolean;
  onAddCluster: () => void;
}) {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  return (
    <div>
      <div className="side-item" style={{ padding: '4px 6px 4px 24px', gap: 4 }}>
        <button
          title={open ? 'Collapse' : 'Expand'}
          onClick={() => setOpen((o) => !o)}
          style={{ width: 14, border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 0 }}
        >
          {open ? '▾' : '▸'}
        </button>
        <button
          onClick={() => navigate(`/spaces/${space.id}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
        >
          <span className="badge-square" style={{ background: space.color }}>
            {initials(space.name)}
          </span>
          <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {space.name}
          </span>
          <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{space._count?.clusters ?? 0}</span>
        </button>
        {canAddCluster && (
          <button
            title="New cluster"
            onClick={onAddCluster}
            style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 15, padding: '0 2px' }}
          >
            ＋
          </button>
        )}
      </div>
      {open && <ClusterList spaceId={space.id} />}
    </div>
  );
}

function SpaceList({
  workspaceId,
  canAddSpace,
  canAddCluster,
  onAddCluster,
}: {
  workspaceId: string;
  canAddSpace: boolean;
  canAddCluster: boolean;
  onAddCluster: (space: Space) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-spaces', workspaceId],
    queryFn: async () => (await api.get(`/workspaces/${workspaceId}/spaces`)).data.spaces as Space[],
  });
  if (isLoading) return <div style={{ padding: '4px 0 4px 34px', color: 'var(--text-faint)', fontSize: 12 }}>…</div>;
  if (!data?.length)
    return (
      <div style={{ padding: '4px 0 4px 34px', color: 'var(--text-faint)', fontSize: 12 }}>
        No spaces{canAddSpace ? ' yet' : ''}
      </div>
    );
  return (
    <div>
      {data.map((s) => (
        <SpaceRow key={s.id} space={s} canAddCluster={canAddCluster} onAddCluster={() => onAddCluster(s)} />
      ))}
    </div>
  );
}

function WorkspaceRow({
  workspace,
  canAddSpace,
  canAddCluster,
  onAddSpace,
  onAddCluster,
}: {
  workspace: Workspace;
  canAddSpace: boolean;
  canAddCluster: boolean;
  onAddSpace: () => void;
  onAddCluster: (space: Space) => void;
}) {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  return (
    <div>
      <div className="side-item" style={{ padding: '4px 6px', gap: 4 }}>
        <button
          title={open ? 'Collapse' : 'Expand'}
          onClick={() => setOpen((o) => !o)}
          style={{ width: 14, border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 0 }}
        >
          {open ? '▾' : '▸'}
        </button>
        <button
          onClick={() => navigate(`/workspaces/${workspace.id}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
        >
          <span className="badge-square" style={{ background: workspace.color }}>
            {initials(workspace.name)}
          </span>
          <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
            {workspace.name}
          </span>
          <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{workspace._count?.spaces ?? 0}</span>
        </button>
        {canAddSpace && (
          <button
            title="New space"
            onClick={onAddSpace}
            style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 15, padding: '0 2px' }}
          >
            ＋
          </button>
        )}
      </div>
      {open && (
        <SpaceList
          workspaceId={workspace.id}
          canAddSpace={canAddSpace}
          canAddCluster={canAddCluster}
          onAddCluster={onAddCluster}
        />
      )}
    </div>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: workspaces } = useWorkspaces();
  const isSuper = user?.systemRole === 'SUPER_ADMIN';
  const orgName = useOrgName();
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [spaceWorkspace, setSpaceWorkspace] = useState<Workspace | null>(null);
  const [clusterSpace, setClusterSpace] = useState<Space | null>(null);

  return (
    <aside className="sidebar scroll-y">
      <div className="side-brand">
        <span className="badge-square" style={{ background: 'var(--accent)', width: 26, height: 26 }}>
          {initials(orgName)}
        </span>
        <strong>{orgName}</strong>
      </div>

      <nav style={{ padding: '4px 8px' }}>
        <NavLink to="/" end className="side-item" style={({ isActive }) => (isActive ? { background: 'var(--surface-2)', color: 'var(--text)' } : {})}>
          <span>▦</span> Dashboard
        </NavLink>
        <NavLink to="/reports" className="side-item" style={({ isActive }) => (isActive ? { background: 'var(--surface-2)', color: 'var(--text)' } : {})}>
          <span>📊</span> Reports
        </NavLink>
        {user?.systemRole === 'SUPER_ADMIN' && (
          <NavLink to="/admin/users" className="side-item" style={({ isActive }) => (isActive ? { background: 'var(--surface-2)', color: 'var(--text)' } : {})}>
            <span>👥</span> Users
          </NavLink>
        )}
        {user?.systemRole === 'SUPER_ADMIN' && (
          <NavLink to="/admin/audit" className="side-item" style={({ isActive }) => (isActive ? { background: 'var(--surface-2)', color: 'var(--text)' } : {})}>
            <span>🕓</span> Audit Log
          </NavLink>
        )}
        {user?.systemRole === 'SUPER_ADMIN' && (
          <NavLink to="/admin/templates" className="side-item" style={({ isActive }) => (isActive ? { background: 'var(--surface-2)', color: 'var(--text)' } : {})}>
            <span>🧩</span> Templates
          </NavLink>
        )}
        {user?.systemRole === 'SUPER_ADMIN' && (
          <NavLink to="/admin/archive" className="side-item" style={({ isActive }) => (isActive ? { background: 'var(--surface-2)', color: 'var(--text)' } : {})}>
            <span>🗄️</span> Archive
          </NavLink>
        )}
        <NavLink to="/calendar" className="side-item" style={({ isActive }) => (isActive ? { background: 'var(--surface-2)', color: 'var(--text)' } : {})}>
          <span>▤</span> Calendar
        </NavLink>
      </nav>

      <div className="side-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Workspaces</span>
        {isSuper && (
          <button
            title="New workspace"
            onClick={() => setCreatingWorkspace(true)}
            style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 15, padding: 0 }}
          >
            ＋
          </button>
        )}
      </div>
      <div style={{ padding: '0 8px' }}>
        {workspaces?.map((w) => (
          <WorkspaceRow
            key={w.id}
            workspace={w}
            canAddSpace={isSuper}
            canAddCluster={isSuper}
            onAddSpace={() => setSpaceWorkspace(w)}
            onAddCluster={setClusterSpace}
          />
        ))}
        {!workspaces?.length && (
          <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: 8 }}>
            No workspaces yet{isSuper ? ' — create one to get started.' : ' you have access to.'}
          </div>
        )}
      </div>

      {creatingWorkspace && <CreateWorkspaceModal onClose={() => setCreatingWorkspace(false)} />}
      {spaceWorkspace && (
        <CreateSpaceModal
          workspaceId={spaceWorkspace.id}
          workspaceName={spaceWorkspace.name}
          onClose={() => setSpaceWorkspace(null)}
        />
      )}
      {clusterSpace && (
        <CreateClusterModal
          spaceId={clusterSpace.id}
          spaceName={clusterSpace.name}
          onClose={() => setClusterSpace(null)}
        />
      )}

      <div className="side-footer">
        <NavLink to="/settings" className="side-item" style={({ isActive }) => (isActive ? { background: 'var(--surface-2)', color: 'var(--text)' } : {})}>
          <span>⚙</span> Settings
        </NavLink>
        <div className="side-profile">
          <span className="avatar" style={{ background: user?.avatarColor }}>
            {user ? initials(user.fullName) : '?'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.fullName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </div>
          </div>
          <button
            className="btn-ghost"
            title="Log out"
            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 16 }}
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            ⏻
          </button>
        </div>
      </div>
    </aside>
  );
}
