/** Kênh gắn team cụ thể */
export function channelsForTeam(channels, teamId) {
  return (channels || []).filter((ch) => String(ch.team || '') === String(teamId));
}

/** Kênh chung phòng ban (department có, team null) */
export function channelsForDepartment(channels, departmentId) {
  return (channels || []).filter(
    (ch) =>
      String(ch.department || '') === String(departmentId) && !String(ch.team || '')
  );
}

/** Kênh chung khối (division có, department & team null) */
export function channelsForDivision(channels, divisionId) {
  return (channels || []).filter(
    (ch) =>
      String(ch.division || '') === String(divisionId) &&
      !String(ch.department || '') &&
      !String(ch.team || '')
  );
}

export function splitChatVoiceChannels(list) {
  const arr = Array.isArray(list) ? list : [];
  return {
    chat: arr.filter((c) => String(c.type || 'chat').toLowerCase() !== 'voice'),
    voice: arr.filter((c) => String(c.type || '').toLowerCase() === 'voice'),
  };
}

/** Gộp danh sách kênh theo _id (ưu tiên bản đầu) */
export function mergeChannelsById(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const ch of list || []) {
      const id = ch?._id;
      if (!id) continue;
      if (!map.has(String(id))) map.set(String(id), ch);
    }
  }
  return [...map.values()];
}

/**
 * Lọc cây workspace theo phạm vi role hierarchy (thu hẹp dần: team → phòng → khối).
 */
export function filterWorkspaceStructureByScope(branches, scope) {
  if (!scope || scope.canSeeAllStructure) return Array.isArray(branches) ? branches : [];
  const scopedDivs = new Set((scope.scopedDivisionIds || []).map(String));
  const scopedDepts = new Set((scope.scopedDepartmentIds || []).map(String));
  const scopedTeams = new Set((scope.scopedTeamIds || []).map(String));
  const structureMode = String(scope.structureMode || 'none');
  if (!scopedDivs.size && !scopedDepts.size && !scopedTeams.size) return [];

  return (branches || [])
    .map((branch) => {
      const nextDivisions = (branch?.divisions || [])
        .map((division) => {
          const divId = String(division._id);
          const allDepartments = Array.isArray(division.departments) ? division.departments : [];

          if (structureMode === 'division' && scopedDivs.has(divId)) {
            return {
              ...division,
              departments: allDepartments.map((dept) => ({
                ...dept,
                teams: Array.isArray(dept.teams) ? dept.teams : [],
              })),
            };
          }

          const departments = allDepartments
            .map((dept) => {
              const deptId = String(dept._id);
              const allTeams = Array.isArray(dept.teams) ? dept.teams : [];

              if (structureMode === 'department' && scopedDepts.has(deptId)) {
                return { ...dept, teams: allTeams };
              }
              if (structureMode === 'team') {
                const teamsFiltered = allTeams.filter((team) =>
                  scopedTeams.has(String(team._id))
                );
                if (!teamsFiltered.length) return null;
                return { ...dept, teams: teamsFiltered };
              }

              const teamsInScope = allTeams.filter((team) =>
                scopedTeams.has(String(team._id))
              );
              if (scopedDepts.has(deptId)) {
                return {
                  ...dept,
                  teams: teamsInScope.length ? teamsInScope : allTeams,
                };
              }
              if (teamsInScope.length) {
                return { ...dept, teams: teamsInScope };
              }
              return null;
            })
            .filter(Boolean);

          if (!departments.length) return null;
          return { ...division, departments };
        })
        .filter(Boolean);
      if (!nextDivisions.length) return null;
      return { ...branch, divisions: nextDivisions };
    })
    .filter(Boolean);
}

/** Lấy kênh cấp khối từ cây workspace structure */
export function divisionChannelsFromStructure(branches, divisionId) {
  const out = [];
  for (const branch of branches || []) {
    for (const division of branch?.divisions || []) {
      if (divisionId && String(division._id) !== String(divisionId)) continue;
      if (Array.isArray(division.channels)) out.push(...division.channels);
    }
  }
  return out;
}
