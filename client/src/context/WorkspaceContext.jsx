import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const LAST_WORKSPACE_SLUG_KEY = 'voicehub:last-workspace-slug';

function readStoredLastWorkspaceSlug() {
  if (typeof window === 'undefined') return '';
  return String(window.localStorage.getItem(LAST_WORKSPACE_SLUG_KEY) || '').trim();
}

const WorkspaceContext = createContext({
  activeWorkspace: null,
  setActiveWorkspace: () => {},
  lastWorkspaceSlug: '',
  setLastWorkspaceSlug: () => {},
  getLastWorkspacePath: () => '/workspaces',
});

export function WorkspaceProvider({ children }) {
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [lastWorkspaceSlugState, setLastWorkspaceSlugState] = useState(() =>
    readStoredLastWorkspaceSlug()
  );

  const setLastWorkspaceSlug = useCallback((slug) => {
    const normalized = String(slug || '').trim();
    setLastWorkspaceSlugState(normalized);
    if (typeof window !== 'undefined') {
      if (normalized) window.localStorage.setItem(LAST_WORKSPACE_SLUG_KEY, normalized);
      else window.localStorage.removeItem(LAST_WORKSPACE_SLUG_KEY);
    }
  }, []);

  const setActiveWorkspaceWithPersist = useCallback((workspace) => {
    const next = workspace || null;
    setActiveWorkspace((prev) => {
      const same =
        String(prev?._id || '') === String(next?._id || '') &&
        String(prev?.slug || '') === String(next?.slug || '') &&
        String(prev?.name || '') === String(next?.name || '') &&
        String(prev?.myRole || '') === String(next?.myRole || '');
      return same ? prev : next;
    });
    const slug = workspace?.slug;
    if (slug) setLastWorkspaceSlug(slug);
  }, [setLastWorkspaceSlug]);

  const getLastWorkspacePath = useCallback(() => {
    const slug = String(lastWorkspaceSlugState || '').trim();
    return slug ? `/w/${encodeURIComponent(slug)}` : '/workspaces';
  }, [lastWorkspaceSlugState]);

  const value = useMemo(
    () => ({
      activeWorkspace,
      setActiveWorkspace: setActiveWorkspaceWithPersist,
      lastWorkspaceSlug: lastWorkspaceSlugState,
      setLastWorkspaceSlug,
      getLastWorkspacePath,
    }),
    [activeWorkspace, lastWorkspaceSlugState]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export { WorkspaceContext };
