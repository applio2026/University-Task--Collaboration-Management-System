import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Avatar, StatusDot } from './ui';
import type { TaskStatus } from '../types';

interface Results {
  tasks: { id: string; title: string; status: TaskStatus; clusterId: string; clusterName: string }[];
  clusters: { id: string; name: string; color: string; spaceName: string }[];
  users: { id: string; fullName: string; email: string; avatarColor: string }[];
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  // Debounce input → query term.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 200);
    return () => clearTimeout(id);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: async () => (await api.get('/search', { params: { q: debounced } })).data as Results,
    enabled: debounced.trim().length >= 2,
  });

  // Close on outside click / Escape.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  function go(path: string) {
    setOpen(false);
    setTerm('');
    navigate(path);
  }

  const hasResults =
    !!data && (data.tasks.length > 0 || data.clusters.length > 0 || data.users.length > 0);
  const showDropdown = open && debounced.trim().length >= 2;

  return (
    <div className="search-wrap" ref={boxRef}>
      <input
        className="topbar-search"
        placeholder="Search tasks, clusters, people…"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showDropdown && (
        <div className="search-dropdown">
          {isFetching && !data && <div className="search-empty">Searching…</div>}
          {data && !hasResults && !isFetching && <div className="search-empty">No matches.</div>}

          {data && data.clusters.length > 0 && (
            <div className="search-group">
              <div className="search-group-label">Clusters</div>
              {data.clusters.map((c) => (
                <button key={c.id} className="search-item" onClick={() => go(`/clusters/${c.id}`)}>
                  <span className="badge-square" style={{ background: c.color, width: 18, height: 18, fontSize: 9 }}>
                    {c.name.slice(0, 1)}
                  </span>
                  <span className="search-item-main">{c.name}</span>
                  <span className="search-item-sub">{c.spaceName}</span>
                </button>
              ))}
            </div>
          )}

          {data && data.tasks.length > 0 && (
            <div className="search-group">
              <div className="search-group-label">Tasks</div>
              {data.tasks.map((t) => (
                <button key={t.id} className="search-item" onClick={() => go(`/clusters/${t.clusterId}`)}>
                  <StatusDot status={t.status} />
                  <span className="search-item-main">{t.title}</span>
                  <span className="search-item-sub">{t.clusterName}</span>
                </button>
              ))}
            </div>
          )}

          {data && data.users.length > 0 && (
            <div className="search-group">
              <div className="search-group-label">People</div>
              {data.users.map((u) => (
                <div key={u.id} className="search-item" style={{ cursor: 'default' }}>
                  <Avatar user={u} size={18} />
                  <span className="search-item-main">{u.fullName}</span>
                  <span className="search-item-sub">{u.email}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
