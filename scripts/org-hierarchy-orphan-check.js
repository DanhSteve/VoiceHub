#!/usr/bin/env node
/**
 * Kiểm tra orphan/mismatch cho cây tổ chức:
 * - Department thiếu division hợp lệ
 * - Team thiếu department hợp lệ
 * - Team.department không cùng organization với team
 * - Department.division không cùng organization với department
 */
const { connectDB, disconnectDB } = require('/shared/config/mongo');
const Department = require('../services/organization-service/src/models/Department');
const Division = require('../services/organization-service/src/models/Division');
const Team = require('../services/organization-service/src/models/Team');

function asId(x) {
  return x ? String(x) : '';
}

async function main() {
  await connectDB(process.env.MONGODB_URI, { exitOnFailure: false });

  const [divisions, departments, teams] = await Promise.all([
    Division.find({}).select('_id organization name').lean(),
    Department.find({}).select('_id organization division name').lean(),
    Team.find({}).select('_id organization department name').lean(),
  ]);

  const divisionById = new Map(divisions.map((d) => [asId(d._id), d]));
  const departmentById = new Map(departments.map((d) => [asId(d._id), d]));

  const report = {
    departmentsMissingDivision: [],
    departmentsDivisionOrgMismatch: [],
    teamsMissingDepartment: [],
    teamsDepartmentOrgMismatch: [],
  };

  for (const dept of departments) {
    const divisionId = asId(dept.division);
    const division = divisionById.get(divisionId);
    if (!divisionId || !division) {
      report.departmentsMissingDivision.push({
        departmentId: asId(dept._id),
        organizationId: asId(dept.organization),
        name: dept.name || '',
        divisionId: divisionId || null,
      });
      continue;
    }
    if (asId(division.organization) !== asId(dept.organization)) {
      report.departmentsDivisionOrgMismatch.push({
        departmentId: asId(dept._id),
        organizationId: asId(dept.organization),
        divisionId,
        divisionOrganizationId: asId(division.organization),
      });
    }
  }

  for (const team of teams) {
    const departmentId = asId(team.department);
    const department = departmentById.get(departmentId);
    if (!departmentId || !department) {
      report.teamsMissingDepartment.push({
        teamId: asId(team._id),
        organizationId: asId(team.organization),
        name: team.name || '',
        departmentId: departmentId || null,
      });
      continue;
    }
    if (asId(department.organization) !== asId(team.organization)) {
      report.teamsDepartmentOrgMismatch.push({
        teamId: asId(team._id),
        organizationId: asId(team.organization),
        departmentId,
        departmentOrganizationId: asId(department.organization),
      });
    }
  }

  const summary = {
    departmentsTotal: departments.length,
    teamsTotal: teams.length,
    ...Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.length])),
  };

  console.log(JSON.stringify({ summary, report }, null, 2));
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[org-hierarchy-orphan-check] FAIL:', err?.message || err);
  try {
    await disconnectDB();
  } catch {
    // ignore
  }
  process.exit(1);
});
