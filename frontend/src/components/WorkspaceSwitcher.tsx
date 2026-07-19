import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useActiveWorkspace } from '../store/workspace';
import type { Workspace } from '../types';
import { initials } from './ui';

/**
 * Sits at the top of the sidebar (right where the user lands after login) so
 * the workspace is picked once, up front — the rest of the app (sidebar's
 * space tree, Dashboard, Reports) then scopes to it automatically instead of
 * needing a repeated "Workspace" filter on every page.
 */
export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { activeWorkspaceId, setActiveWorkspace } = useActiveWorkspace();

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => (await api.get('/workspaces')).data.workspaces as Workspace[],
  });

  // Auto-pick a workspace once the list loads: keep the stored choice if it's
  // still accessible, otherwise fall back to the first accessible one.
  useEffect(() => {
    if (!workspaces || workspaces.length === 0) return;
    const stillValid = workspaces.some((w) => w.id === activeWorkspaceId);
    if (!stillValid) setActiveWorkspace(workspaces[0].id);
  }, [workspaces, activeWorkspaceId, setActiveWorkspace]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const active = workspaces?.find((w) => w.id === activeWorkspaceId);

  function pick(id: string) {
    setActiveWorkspace(id);
    setOpen(false);
    navigate('/');
  }

  if (isLoading) {
    return <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-faint)' }}>Loading workspaces…</div>;
  }

  if (!workspaces?.length) {
    return (
      <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-faint)' }}>
        No workspaces you have access to yet.
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', padding: '8px 10px' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Switch workspace"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: '100%',
          padding: '7px 8px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-2)',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        <span className="badge-square" style={{ background: active?.color ?? 'var(--accent)', width: 22, height: 22, fontSize: 10 }}>
          {active ? initials(active.name) : '?'}
        </span>
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 13 }}>
          {active?.name ?? 'Select workspace'}
        </span>
        <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          className="scroll-y"
          style={{
            position: 'absolute',
            top: '100%',
            left: 10,
            right: 10,
            marginTop: 4,
            maxHeight: 260,
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            zIndex: 20,
          }}
        >
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => pick(w.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                width: '100%',
                padding: '8px 10px',
                border: 'none',
                background: w.id === activeWorkspaceId ? 'var(--surface-2)' : 'none',
                color: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span className="badge-square" style={{ background: w.color, width: 20, height: 20, fontSize: 9 }}>
                {initials(w.name)}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                {w.name}
              </span>
              {w.id === activeWorkspaceId && <span style={{ fontSize: 12, color: 'var(--accent)' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
