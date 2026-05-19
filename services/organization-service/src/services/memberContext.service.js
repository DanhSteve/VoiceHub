const Membership = require('../models/Membership');
const Organization = require('../models/Organization');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Channel = require('../models/Channel');
const axios = require('axios');

const USER_SERVICE_URL = (process.env.USER_SERVICE_URL || 'http://user-service:3004').replace(/\/$/, '');
const USER_SERVICE_INTERNAL_TOKEN = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();

function normalizeLabel(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

function membershipPlacementRow(membership, deptById, teamById) {
  const departmentId = membership.department ? String(membership.department) : null;
  const teamId = membership.team ? String(membership.team) : null;
  const dept = departmentId ? deptById.get(departmentId) : null;
  const team = teamId ? teamById.get(teamId) : null;
  return {
    userId: String(membership.user),
    membershipRole: membership.role || 'member',
    departmentId,
    teamId,
    divisionId: membership.division ? String(membership.division) : null,
    departmentName: dept?.name || '',
    teamName: team?.name || '',
  };
}

/**
 * Ngữ cảnh org + thành viên cho AI task extract (không để LLM đoán user/team/dept).
 */
async function buildAiTaskExtractContext({ organizationId, userIds = [], mentionLabels = [], channelId = null }) {
  const orgId = String(organizationId || '');
  if (!orgId) return null;

  const org = await Organization.findById(orgId).select('_id name').lean();
  if (!org) return null;

  const uidSet = new Set((userIds || []).map((id) => String(id)).filter(Boolean));

  if (Array.isArray(mentionLabels) && mentionLabels.length) {
    const active = await Membership.find({ organization: orgId, status: 'active' }).select('user').lean();
    const allIds = active.map((m) => String(m.user));
    const profiles = await fetchUserProfiles(allIds);
    for (const label of mentionLabels) {
      const norm = normalizeLabel(label);
      if (!norm) continue;
      for (const [uid, p] of profiles) {
        const candidates = [p.displayName, p.username].filter(Boolean).map(normalizeLabel);
        if (candidates.some((c) => c === norm || c.includes(norm) || norm.includes(c))) {
          uidSet.add(uid);
          break;
        }
      }
    }
  }

  const ids = [...uidSet];
  let memberships = [];
  if (ids.length) {
    memberships = await Membership.find({
      organization: orgId,
      status: 'active',
      user: { $in: ids },
    }).lean();
  }

  const deptIds = [...new Set(memberships.map((m) => m.department).filter(Boolean).map(String))];
  const teamIds = [...new Set(memberships.map((m) => m.team).filter(Boolean).map(String))];

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
    const placement = membershipPlacementRow(m, deptById, teamById);
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
