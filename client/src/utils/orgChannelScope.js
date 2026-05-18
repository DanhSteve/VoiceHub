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
