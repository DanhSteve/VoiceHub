/** Tab workspace — URL path /w/:slug/:tab */
export const WORKSPACE_TAB_VALUES = ['chat', 'tasks', 'documents', 'notifications'];
export const WORKSPACE_TAB_SEGMENTS = WORKSPACE_TAB_VALUES;

const WORKSPACE_PATH_RE = /^\/w\/([^/]+)(?:\/([^/?]+))?\/?$/;

export function normalizeWorkspaceTab(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (WORKSPACE_TAB_VALUES.includes(v)) return v;
  return 'chat';
}

export function parseWorkspaceTabFromSearch(search) {
  const raw =
    typeof search === 'string'
      ? new URLSearchParams(search).get('tab')
      : new URLSearchParams(search || '').get('tab');
  return normalizeWorkspaceTab(raw);
}

/** Đọc segment tab từ pathname /w/:slug/:tab (null nếu không phải workspace path). */
export function parseWorkspaceTabSegmentFromPath(pathname) {
  const match = String(pathname || '')
    .replace(/\/+/g, '/')
    .match(WORKSPACE_PATH_RE);
  if (!match) return null;
  const segment = String(match[2] || '')
    .trim()
    .toLowerCase();
  if (!segment) return 'chat';
  if (WORKSPACE_TAB_VALUES.includes(segment)) return segment;
  return null;
}

export function extractWorkspaceSlugFromPath(pathname) {
  const match = String(pathname || '')
    .replace(/\/+/g, '/')
    .match(WORKSPACE_PATH_RE);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return String(match[1] || '');
  }
}

/** Tab hiện tại từ pathname (ưu tiên segment) + fallback ?tab= khi path chưa có segment. */
export function parseWorkspaceTabFromLocation(pathname, search) {
  const path = String(pathname || '').replace(/\/+/g, '/');
  const match = path.match(WORKSPACE_PATH_RE);
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');

  if (!match) {
    if (params.has('tab')) return parseWorkspaceTabFromSearch(search);
    return 'chat';
  }

  const segment = String(match[2] || '')
    .trim()
    .toLowerCase();
  if (!segment) {
    if (params.has('tab')) return parseWorkspaceTabFromSearch(search);
    return 'chat';
  }
  if (WORKSPACE_TAB_VALUES.includes(segment)) return segment;
  return 'chat';
}

export function buildWorkspacePath(slug, tab, queryRecord = {}) {
  const s = String(slug || '').trim();
  const t = normalizeWorkspaceTab(tab);
  if (!s) return '/workspaces';
  const base = `/w/${encodeURIComponent(s)}/${t}`;
  const params = new URLSearchParams();
  Object.entries(queryRecord || {}).forEach(([k, v]) => {
    if (k === 'tab') return;
    if (v != null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Trả path đích nếu URL cần chuẩn hóa (legacy ?tab= hoặc /w/:slug không segment).
 * Ngược lại null — không redirect.
 */
export function resolveLegacyWorkspaceRedirect(pathname, search) {
  const path = String(pathname || '').replace(/\/+/g, '/');
  const match = path.match(WORKSPACE_PATH_RE);
  if (!match) return null;

  const slug = extractWorkspaceSlugFromPath(path);
  if (!slug) return null;

  const segment = String(match[2] || '')
    .trim()
    .toLowerCase();
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  const tabQuery = params.get('tab');

  const restQuery = {};
  params.forEach((v, k) => {
    if (k !== 'tab') restQuery[k] = v;
  });

  if (tabQuery) {
    const tab = normalizeWorkspaceTab(tabQuery);
    const target = buildWorkspacePath(slug, tab, restQuery);
    if (target !== `${path}${params.toString() ? `?${params.toString()}` : ''}`) {
      return target;
    }
  }

  if (!segment) {
    return buildWorkspacePath(slug, 'chat', restQuery);
  }

  if (!WORKSPACE_TAB_VALUES.includes(segment)) {
    return buildWorkspacePath(slug, 'chat', restQuery);
  }

  if (params.has('tab')) {
    return buildWorkspacePath(slug, segment, restQuery);
  }

  return null;
}

export function isWorkspaceAuxTab(tab) {
  return tab === 'tasks' || tab === 'documents' || tab === 'notifications';
}
