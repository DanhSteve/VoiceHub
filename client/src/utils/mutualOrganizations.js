import { organizationAPI } from '../services/api/organizationAPI';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function unwrapList(payload) {
  const body = payload?.data ?? payload;
  const data = body?.data ?? body;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.organizations)) return data.organizations;
  if (Array.isArray(data?.friends)) return data.friends;
  return [];
}

function memberUserId(member) {
  const u = member?.user;
  if (u != null && typeof u === 'object') {
    return String(u._id || u.userId || u.id || '');
  }
  return String(member?.user || member?.userId || member?._id || '');
}

/**
 * Tổ chức chung: dùng API sẵn có (my orgs + members từng org).
 * Cùng pattern OrganizationsPage.loadChatContacts.
 * @param {string} friendUserId
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchMutualOrganizations(friendUserId, opts = {}) {
  const fid = String(friendUserId || '').trim();
  if (!fid) return { count: 0, organizations: [] };

  const force = Boolean(opts.force);
  const cached = cache.get(fid);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const orgResp = await organizationAPI.getOrganizations();
  const myOrgs = unwrapList(orgResp);
  if (!myOrgs.length) {
    const empty = { count: 0, organizations: [] };
    cache.set(fid, { at: Date.now(), data: empty });
    return empty;
  }

  const results = await Promise.all(
    myOrgs.map(async (org) => {
      const orgId = String(org._id || org.id || '');
      if (!orgId) return null;
      try {
        const memResp = await organizationAPI.getMembers(orgId);
        const members = unwrapList(memResp);
        const isMutual = members.some(
          (m) => String(m.status || 'active') === 'active' && memberUserId(m) === fid
        );
        if (!isMutual) return null;
        return {
          _id: orgId,
          name: org.name,
          slug: org.slug,
          logo: org.logo ?? null,
          description: org.description ?? '',
          myRole: org.myRole || null,
        };
      } catch {
        return null;
      }
    })
  );

  const organizations = results.filter(Boolean);
  const data = { count: organizations.length, organizations };
  cache.set(fid, { at: Date.now(), data });
  return data;
}

/** Xóa cache nhóm chung (một friend hoặc toàn bộ). */
export function invalidateMutualOrganizationsCache(friendUserId) {
  if (friendUserId == null || friendUserId === '') {
    cache.clear();
    return;
  }
  cache.delete(String(friendUserId));
}
