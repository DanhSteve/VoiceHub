const Membership = require('../models/Membership');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const {
  fetchUserRoleNamesInOrg,
  resolveUserHierarchyScopes,
} = require('../utils/memberPlacementScope');
const { upsertAssignmentsFromScopes } = require('./memberScopePolicy.service');

async function backfillRoleScopeAssignmentsForOrg(organizationId) {
  const oid = String(organizationId || '').trim();
  if (!oid) return { ok: false, reason: 'missing_org' };

  const [rows, divisions, departments, teams] = await Promise.all([
    Membership.find({ organization: oid, status: 'active' }).select('user').lean(),
    Division.find({ organization: oid, isActive: true }).select('_id name').lean(),
    Department.find({ organization: oid }).select('_id name division').lean(),
    Team.find({ organization: oid, isActive: true }).select('_id name department division').lean(),
  ]);

  let synced = 0;
  for (const row of rows) {
    const uid = row?.user ? String(row.user) : '';
    if (!uid) continue;
    const roleNames = await fetchUserRoleNamesInOrg(uid, oid);
    const scopes = resolveUserHierarchyScopes(roleNames, { divisions, departments, teams });
    await upsertAssignmentsFromScopes({
      organizationId: oid,
      userId: uid,
      roleNames,
      scopeSets: scopes,
      source: 'migration',
    });
    synced += 1;
  }

  return { ok: true, synced };
}

module.exports = { backfillRoleScopeAssignmentsForOrg };
