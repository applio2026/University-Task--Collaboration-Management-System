import { create } from 'zustand';

// Persists which workspace is "active" so the whole app (sidebar's space
// tree, Dashboard, Reports) scopes to it automatically — no need to re-pick a
// workspace filter on every page. Survives refresh via localStorage; cleared
// on logout by the auth store.
const STORAGE_KEY = 'uni_active_workspace';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface WorkspaceState {
  activeWorkspaceId: string | null;
  setActiveWorkspace: (id: string | null) => void;
}

export const useActiveWorkspace = create<WorkspaceState>((set) => ({
  activeWorkspaceId: readStored(),
  setActiveWorkspace: (id) => {
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — selection just won't persist across reloads */
    }
    set({ activeWorkspaceId: id });
  },
}));
