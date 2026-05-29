const Membership = require('../models/Membership');
const Organization = require('../models/Organization');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Channel = require('../models/Channel');
const RoleScopeAssignment = require('../models/RoleScopeAssignment');
const axios = require('axios');

const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!USER_SERVICE_URL) throw new Error('Thiếu biến môi trường: USER_SERVICE_URL');
const USER_SERVICE_INTERNAL_TOKEN = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();

function normalizeLabel(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isLooseLabelMatch(a, b) {
  const x = normalizeLabel(a);
  const y = normalizeLabel(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length < 3 || y.length < 3) return false;
  return x.includes(y) || y.includes(x);
}

function findMentionedUserIdsByText(messageText, profileRows = []) {
  const text = String(messageText || '');
  if (!text || !Array.isArray(profileRows) || !profileRows.length) return new Set();

  const labels = [];
  for (const row of profileRows) {
    const uid = String(row.userId || '');
    if (!uid) continue;
    for (const raw of [row.displayName, row.username]) {
      const label = String(raw || '').trim();
      if (!label) continue;
      labels.push({ uid, label });
    }
  }

  labels.sort((a, b) => b.label.length - a.label.length);
  const matched = new Set();

  let i = 0;
  while (i < text.length) {
    const at = text.indexOf('@', i);
    if (at === -1) break;
    let hit = false;

    for (const row of labels) {
      const mention = `@${row.label}`;
      if (!text.slice(at).startsWith(mention)) continue;
      const end = at + mention.length;
      if (end < text.length && !/[\s,.;!?]/.test(text[end])) continue;
      matched.add(row.uid);
      i = end;
      hit = true;
      break;
    }

    if (!hit) i = at + 1;
  }

  return matched;
}

async function fetchUserProfiles(userIds) {
  const map = new Map();
  if (!USER_SERVICE_INTERNAL_TOKEN || !userIds.length) return map;

  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const res = await axios.get(`${USER_SERVICE_URL}/api/users/internal/profile/${encodeURIComponent(uid)}`, {
          headers: { 'x-internal-token': USER_SERVICE_INTERNAL_TOKEN },
          timeout: 8000,
          validateStatus: () => true,
        });
        if (res.status !== 200) return;
        const body = res.data?.data ?? res.data ?? {};
        const user = body.user ?? body;
        map.set(String(uid), {
          userId: String(uid),
          displayName: user.displayName || user.fullName || user.username || '',
          username: user.username || '',
        });
      } catch {
        /* ignore */
      }
    })
  );
  return map;
}

function assignmentPlacementRow(userId, membershipRole, assignmentRows, deptById, teamById) {
  const rows = Array.isArray(assignmentRows) ? assignmentRows : [];
  const teamRow = rows.find((r) => String(r.scopeType) === 'team');
  const departmentRow = rows.find((r) => String(r.scopeType) === 'department');
  const divisionRow = rows.find((r) => String(r.scopeType) === 'division');
  const teamId = teamRow?.scopeId ? String(teamRow.scopeId) : null;
  const departmentId = departmentRow?.scopeId
    ? String(departmentRow.scopeId)
    : teamId && teamById.get(teamId)?.department
      ? String(teamById.get(teamId).department)
      : null;
  const divisionId = divisionRow?.scopeId
    ? String(divisionRow.scopeId)
    : departmentId && deptById.get(departmentId)?.division
      ? String(deptById.get(departmentId).division)
      : null;
  const dept = departmentId ? deptById.get(departmentId) : null;
  const team = teamId ? teamById.get(teamId) : null;
  return {
    userId: String(userId),
    membershipRole: membershipRole || 'member',
    departmentId,
    teamId,
    divisionId,
    departmentName: dept?.name || '',
    teamName: team?.name || '',
  };
}

/**
 * Ngữ cảnh org + thành viên cho AI task extract (không để LLM đoán user/team/dept).
 */
async function buildAiTaskExtractContext({
  organizationId,
  userIds = [],
  mentionLabels = [],
  channelId = null,
  messageText = '',
}) {
  const orgId = String(organizationId || '');
  if (!orgId) return null;

  const org = await Organization.findById(orgId).select('_id name').lean();
  if (!org) return null;

  const uidSet = new Set((userIds || []).map((id) => String(id)).filter(Boolean));

  const shouldResolveByLabels = Array.isArray(mentionLabels) && mentionLabels.length > 0;
  const shouldResolveByText = String(messageText || '').includes('@');

  if (shouldResolveByLabels || shouldResolveByText) {
    const active = await Membership.find({ organization: orgId, status: 'active' }).select('user').lean();
    const allIds = active.map((m) => String(m.user));
    const profiles = await fetchUserProfiles(allIds);
    const profileRows = [...profiles.values()];

    if (shouldResolveByLabels) {
      for (const label of mentionLabels) {
        const norm = normalizeLabel(label);
        if (!norm) continue;
        for (const row of profileRows) {
          if (isLooseLabelMatch(norm, row.displayName) || isLooseLabelMatch(norm, row.username)) {
            uidSet.add(String(row.userId));
            break;
          }
        }
      }
    }

    if (shouldResolveByText) {
      const idsByText = findMentionedUserIdsByText(messageText, profileRows);
      for (const id of idsByText) uidSet.add(id);
    }
  }

  const ids = [...uidSet];
  let memberships = [];
  if (ids.length) {
    memberships = await Membership.find({
      organization: orgId,
      status: 'active',
      user: { $in: ids },
    })
      .select('user role')
      .lean();
  }

  const assignmentRows = ids.length
    ? await RoleScopeAssignment.find({
        organization: orgId,
        user: { $in: ids },
        active: true,
      })
        .select('user scopeType scopeId')
        .lean()
    : [];
  const assignmentsByUser = new Map();
  for (const row of assignmentRows) {
    const uid = String(row.user || '');
    if (!uid) continue;
    if (!assignmentsByUser.has(uid)) assignmentsByUser.set(uid, []);
    assignmentsByUser.get(uid).push(row);
  }

  const deptIds = [
    ...new Set(
      assignmentRows
        .filter((r) => String(r.scopeType) === 'department')
        .map((r) => String(r.scopeId))
        .filter(Boolean)
    ),
  ];
  const teamIds = [
    ...new Set(
      assignmentRows
        .filter((r) => String(r.scopeType) === 'team')
        .map((r) => String(r.scopeId))
        .filter(Boolean)
    ),
  ];

  const [departments, teams] = await Promise.all([
    deptIds.length
      ? Department.find({ _id: { $in: deptIds } })
          .select('_id name')
          .lean()
      : [],
    teamIds.length
      ? Team.find({ _id: { $in: teamIds } })
          .select('_id name department')
          .lean()
      : [],
  ]);

  const deptById = new Map(departments.map((d) => [String(d._id), d]));
  const teamById = new Map(teams.map((t) => [String(t._id), t]));
  const profiles = await fetchUserProfiles(ids);

  const mentionedUsers = [];
  for (const m of memberships) {
    const uid = String(m.user || '');
    const placement = assignmentPlacementRow(uid, m.role, assignmentsByUser.get(uid), deptById, teamById);
    const profile = profiles.get(String(m.user)) || {};
    mentionedUsers.push({
      ...placement,
      displayName: profile.displayName || profile.username || '',
      username: profile.username || '',
    });
  }

  let channel = null;
  if (channelId) {
    const ch = await Channel.findOne({ _id: channelId, organization: orgId, isActive: true })
      .select('_id name type department team')
      .lean();
    if (ch) {
      const chDept = ch.department ? await Department.findById(ch.department).select('name').lean() : null;
      const chTeam = ch.team ? await Team.findById(ch.team).select('name').lean() : null;
      channel = {
        channelId: String(ch._id),
        name: ch.name || '',
        type: ch.type || 'chat',
        departmentId: ch.department ? String(ch.department) : null,
        teamId: ch.team ? String(ch.team) : null,
        departmentName: chDept?.name || '',
        teamName: chTeam?.name || '',
      };
    }
  }

  return {
    organization: { id: String(org._id), name: org.name || '' },
    channel,
    mentionedUsers,
  };
}

module.exports = { buildAiTaskExtractContext, normalizeLabel };
