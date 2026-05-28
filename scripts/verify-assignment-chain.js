#!/usr/bin/env node
/**
 * Verify sau migration:
 * - assignment team phải suy được department/division
 * - assignment department phải suy được division
 */
const { connectDB, disconnectDB } = require('/shared/config/mongo');
const RoleScopeAssignment = require('../services/organization-service/src/models/RoleScopeAssignment');
const Team = require('../services/organization-service/src/models/Team');
const Department = require('../services/organization-service/src/models/Department');

function id(v) {
  return v ? String(v) : '';
}

async function main() {
  await connectDB(process.env.MONGODB_URI, { exitOnFailure: false });
  const orgId = process.env.VERIFY_ORG_ID || '';
  const scope = orgId ? { organization: orgId } : {};

  const rows = await RoleScopeAssignment.find({ ...scope, active: true })
    .select('organization user scopeType scopeId')
    .lean();
  const teamIds = [...new Set(rows.filter((r) => r.scopeType === 'team').map((r) => id(r.scopeId)))];
  const deptIds = [...new Set(rows.filter((r) => r.scopeType === 'department').map((r) => id(r.scopeId)))];

  const [teams, departments] = await Promise.all([
    teamIds.length ? Team.find({ _id: { $in: teamIds } }).select('_id department division organization').lean() : [],
    deptIds.length
      ? Department.find({ _id: { $in: deptIds } }).select('_id division organization').lean()
      : [],
  ]);
  const teamById = new Map(teams.map((t) => [id(t._id), t]));
  const deptById = new Map(departments.map((d) => [id(d._id), d]));

  const invalidTeamAssignments = [];
  const invalidDepartmentAssignments = [];

  for (const row of rows) {
    if (row.scopeType === 'team') {
      const team = teamById.get(id(row.scopeId));
      if (!team || !team.department || !team.division) {
        invalidTeamAssignments.push({
          organizationId: id(row.organization),
          userId: id(row.user),
          scopeId: id(row.scopeId),
        });
      }
      continue;
    }
    if (row.scopeType === 'department') {
      const dept = deptById.get(id(row.scopeId));
      if (!dept || !dept.division) {
        invalidDepartmentAssignments.push({
          organizationId: id(row.organization),
          userId: id(row.user),
          scopeId: id(row.scopeId),
        });
      }
    }
  }

  const result = {
    checkedAssignments: rows.length,
    invalidTeamAssignments: invalidTeamAssignments.length,
    invalidDepartmentAssignments: invalidDepartmentAssignments.length,
    sample: {
      invalidTeamAssignments: invalidTeamAssignments.slice(0, 20),
      invalidDepartmentAssignments: invalidDepartmentAssignments.slice(0, 20),
    },
  };
  console.log(JSON.stringify(result, null, 2));
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[verify-assignment-chain] FAIL:', err?.message || err);
  try {
    await disconnectDB();
  } catch {
    // ignore
  }
  process.exit(1);
});
