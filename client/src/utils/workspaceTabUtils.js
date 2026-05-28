/** Tab khung giữa workspace (/w/:slug?tab=…) */
export const WORKSPACE_TAB_VALUES = ['chat', 'tasks', 'documents', 'notifications'];

export function normalizeWorkspaceTab(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === 'tasks' || v === 'documents' || v === 'notifications') return v;
  return 'chat';
}

export function parseWorkspaceTabFromSearch(search) {
  const raw =
    typeof search === 'string'
      ? new URLSearchParams(search).get('tab')
      : new URLSearchParams(search || '').get('tab');
  return normalizeWorkspaceTab(raw);
}

export function isWorkspaceAuxTab(tab) {
  return tab === 'tasks' || tab === 'documents' || tab === 'notifications';
}
