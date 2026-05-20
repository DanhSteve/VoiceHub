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
 * Lọc cây workspace theo phạm vi suy ra từ kênh user được xem.
 * Chỉ cần gán quyền trên kênh — khối/phòng/team cha vẫn hiện trong sidebar.
 */
export function filterWorkspaceStructureByScope(branches, scope) {
  if (!scope || scope.canSeeAllStructure) return Array.isArray(branches) ? branches : [];
  const scopedDivs = new Set((scope.scopedDivisionIds || []).map(String));
  const scopedDepts = new Set((scope.scopedDepartmentIds || []).map(String));
  const scopedTeams = new Set((scope.scopedTeamIds || []).map(String));
  if (!scopedDivs.size && !scopedDepts.size && !scopedTeams.size) return [];

  return (branches || [])
    .map((branch) => {
      const nextDivisions = (branch?.divisions || [])
        .map((division) => {
          const divId = String(division._id);
          const divisionOpen = scopedDivs.has(divId);
          const departments = (division.departments || [])
            .map((dept) => {
              const deptId = String(dept._id);
              const deptOpen = divisionOpen || scopedDepts.has(deptId);
              const allTeams = Array.isArray(dept.teams) ? dept.teams : [];
              if (deptOpen || divisionOpen) {
                return { ...dept, teams: allTeams };
              }
              const teamsOnly = allTeams.filter((team) => scopedTeams.has(String(team._id)));
              if (!teamsOnly.length) return null;
              return { ...dept, teams: teamsOnly };
            })
            .filter(Boolean);
          if (!divisionOpen && departments.length === 0) return null;
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
