export function orgRecordId(org) {
  if (!org) return '';
  return String(org._id || org.id || '');
}

export function findOrgBySlug(list, slug) {
  const hint = String(slug || '').trim().toLowerCase();
  if (!hint) return null;
  return (Array.isArray(list) ? list : []).find(
    (item) => String(item?.slug || '').trim().toLowerCase() === hint
  );
}

export function mergeOrganizationsList(queryList, localList) {
  const fromQuery = Array.isArray(queryList) ? queryList : [];
  const fromLocal = Array.isArray(localList) ? localList : [];
  const byId = new Map(fromQuery.map((o) => [orgRecordId(o), o]).filter(([id]) => id));
  for (const o of fromLocal) {
    const id = orgRecordId(o);
    if (id && !byId.has(id)) byId.set(id, o);
  }
  return Array.from(byId.values());
}

export function organizationsListSame(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const idsA = a.map((item) => orgRecordId(item)).sort().join(',');
  const idsB = b.map((item) => orgRecordId(item)).sort().join(',');
  return idsA === idsB;
}

export function organizationsIdsKey(list) {
  return (Array.isArray(list) ? list : [])
    .map((o) => orgRecordId(o))
    .filter(Boolean)
    .sort()
    .join(',');
}

export function workspacePayloadFromOrg(org) {
  const id = orgRecordId(org);
  const slug = String(org?.slug || '').trim();
  return {
    _id: id,
    slug: org?.slug,
    name: org?.name,
    myRole: org?.myRole || org?.role || '',
  };
}
