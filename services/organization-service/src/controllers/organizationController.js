const Organization = require('../models/Organization');
const Membership = require('../models/Membership');
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Channel = require('../models/Channel');
const ChannelAccess = require('../models/ChannelAccess');
const axios = require('axios');
const { emitRealtimeEvent } = require('/shared');
const { syncUserOrgRole } = require('../services/rolePermissionOrgSync');
const { syncHierarchyRoles } = require('../services/hierarchyRoleSync');
const { purgeOrganizationEverywhere } = require('../services/organizationCascadePurge');

const getUserId = (req) => req.user?.id || req.user?.userId || req.user?._id;
const MAX_OWNED_ORGS_PER_USER = 3;
const RESERVED_SLUGS = new Set(['admin', 'system', 'support', 'api', 'workspace', 'root']);
const STRUCTURE_PROVISION = {
  PENDING: 'pending',
  RUNNING: 'running',
  READY: 'ready',
  FAILED: 'failed',
};
const ROLE_PERMISSION_BASE = String(
  process.env.ROLE_PERMISSION_SERVICE_URL || 'http://role-permission-service:3015'
).replace(/\/$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
const DEFAULT_STRUCTURE_BLUEPRINT = {
  branches: [
    {
      name: 'Trụ sở chính',
      location: '',
      divisions: [
        {
          name: 'Khối Công nghệ',
          departments: [
            { name: 'Phòng Backend', teams: [{ name: 'Team API' }, { name: 'Team Auth' }] },
          ],
        },
      ],
    },
  ],
};

const normalizeHierarchyBlueprint = (raw) => {
  const fallback = DEFAULT_STRUCTURE_BLUEPRINT;
  if (!raw || typeof raw !== 'object') return fallback;
  const sourceBranches = Array.isArray(raw.branches) ? raw.branches : [];
  if (sourceBranches.length === 0) return fallback;
  const branches = sourceBranches
    .map((branch, bIdx) => {
      const branchName = String(branch?.name || '').trim() || `Chi nhánh ${bIdx + 1}`;
      const divisionsRaw = Array.isArray(branch?.divisions) ? branch.divisions : [];
      const divisions = divisionsRaw
        .map((division, dIdx) => {
          const divisionName = String(division?.name || '').trim() || `Khối ${dIdx + 1}`;
          const departmentsRaw = Array.isArray(division?.departments) ? division.departments : [];
          const departments = departmentsRaw
            .map((department, depIdx) => {
              const departmentName = String(department?.name || '').trim() || `Phòng ban ${depIdx + 1}`;
              const teamsRaw = Array.isArray(department?.teams) ? department.teams : [];
              const teams = teamsRaw
                .map((team, tIdx) => ({ name: String(team?.name || '').trim() || `Team ${tIdx + 1}` }))
                .slice(0, 30);
              return { name: departmentName, teams: teams.length ? teams : [{ name: 'Team chung' }] };
            })
            .slice(0, 60);
          return {
            name: divisionName,
            departments: departments.length ? departments : [{ name: 'Phòng ban chung', teams: [{ name: 'Team chung' }] }],
          };
        })
        .slice(0, 30);
      return {
        name: branchName,
        location: String(branch?.location || '').trim(),
        divisions: divisions.length ? divisions : [{ name: 'Khối mặc định', departments: [{ name: 'Phòng ban chung', teams: [{ name: 'Team chung' }] }] }],
      };
    })
    .slice(0, 20);
  return { branches };
};

const buildDefaultChannels = ({ organizationId, branchId, divisionId, departmentId, teamId, ownerId }) => [
  {
    name: 'general',
    description: 'Team text chat',
    type: 'chat',
    organization: organizationId,
    branch: branchId,
    division: divisionId,
    department: departmentId,
    team: teamId,
    leader: ownerId,
  },
  {
    name: 'voice',
    description: 'Team voice channel',
    type: 'voice',
    organization: organizationId,
    branch: branchId,
    division: divisionId,
    department: departmentId,
    team: teamId,
    leader: ownerId,
  },
];

const shortId = (id) => String(id || '').slice(-6);

function roleInternalHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (GATEWAY_INTERNAL_TOKEN) h['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  return h;
}

async function fetchUserRoleNamesInOrg(userId, orgId) {
  if (!userId || !orgId || !GATEWAY_INTERNAL_TOKEN) return [];
  try {
    const res = await axios.get(
      `${ROLE_PERMISSION_BASE}/api/roles/user/${encodeURIComponent(String(userId))}/server/${encodeURIComponent(
        String(orgId)
      )}`,
      {
        headers: roleInternalHeaders(),
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200 || !Array.isArray(res.data?.data)) return [];
    return res.data.data.map((r) => String(r?.name || '')).filter(Boolean);
  } catch {
    return [];
  }
}

function hasScopedRoleTag(roleNames, tagPrefix, entityId) {
  const id = shortId(entityId);
  if (!id) return false;
  const token = `${String(tagPrefix)}_${id}`.toLowerCase();
  return (roleNames || []).some((name) => String(name || '').toLowerCase().includes(token));
}

const seedHierarchyStructure = async ({ organizationId, ownerId, blueprint }) => {
  const normalized = normalizeHierarchyBlueprint(blueprint);
  const branchDocs = normalized.branches.map((branchRaw, bIdx) => ({
    organization: organizationId,
    name: branchRaw.name,
    location: branchRaw.location || '',
    isDefault: bIdx === 0,
  }));
  const branches = branchDocs.length ? await Branch.insertMany(branchDocs) : [];

  const divisionsSeed = [];
  for (let bIdx = 0; bIdx < normalized.branches.length; bIdx += 1) {
    const branchRaw = normalized.branches[bIdx];
    const branch = branches[bIdx];
    if (!branch) continue;
    for (let dIdx = 0; dIdx < branchRaw.divisions.length; dIdx += 1) {
      const divisionRaw = branchRaw.divisions[dIdx];
      divisionsSeed.push({
        __key: `${bIdx}:${dIdx}`,
        organization: organizationId,
        branch: branch._id,
        name: divisionRaw.name,
        isDefault: bIdx === 0 && dIdx === 0,
      });
    }
  }
  const divisions = divisionsSeed.length
    ? await Division.insertMany(
        divisionsSeed.map((item) => ({
          organization: item.organization,
          branch: item.branch,
          name: item.name,
          isDefault: item.isDefault,
        }))
      )
    : [];
  const divisionByKey = new Map(divisionsSeed.map((item, idx) => [item.__key, divisions[idx]]));

  const departmentsSeed = [];
  for (let bIdx = 0; bIdx < normalized.branches.length; bIdx += 1) {
    const branchRaw = normalized.branches[bIdx];
    const branch = branches[bIdx];
    if (!branch) continue;
    for (let dIdx = 0; dIdx < branchRaw.divisions.length; dIdx += 1) {
      const divisionRaw = branchRaw.divisions[dIdx];
      const division = divisionByKey.get(`${bIdx}:${dIdx}`);
      if (!division) continue;
      for (let depIdx = 0; depIdx < divisionRaw.departments.length; depIdx += 1) {
        const departmentRaw = divisionRaw.departments[depIdx];
        departmentsSeed.push({
          __key: `${bIdx}:${dIdx}:${depIdx}`,
          organization: organizationId,
          branch: branch._id,
          division: division._id,
          name: departmentRaw.name,
          head: ownerId,
        });
      }
    }
  }
  const departments = departmentsSeed.length
    ? await Department.insertMany(
        departmentsSeed.map((item) => ({
          organization: item.organization,
          branch: item.branch,
          division: item.division,
          name: item.name,
          head: item.head,
        }))
      )
    : [];
  const departmentByKey = new Map(departmentsSeed.map((item, idx) => [item.__key, departments[idx]]));

  const teamsSeed = [];
  for (let bIdx = 0; bIdx < normalized.branches.length; bIdx += 1) {
    const branchRaw = normalized.branches[bIdx];
    const branch = branches[bIdx];
    if (!branch) continue;
    for (let dIdx = 0; dIdx < branchRaw.divisions.length; dIdx += 1) {
      const division = divisionByKey.get(`${bIdx}:${dIdx}`);
      const divisionRaw = branchRaw.divisions[dIdx];
      if (!division) continue;
      for (let depIdx = 0; depIdx < divisionRaw.departments.length; depIdx += 1) {
        const departmentRaw = divisionRaw.departments[depIdx];
        const department = departmentByKey.get(`${bIdx}:${dIdx}:${depIdx}`);
        if (!department) continue;
        for (let tIdx = 0; tIdx < departmentRaw.teams.length; tIdx += 1) {
          const teamRaw = departmentRaw.teams[tIdx];
          teamsSeed.push({
            organization: organizationId,
            branch: branch._id,
            division: division._id,
            department: department._id,
            name: teamRaw.name,
            leader: ownerId,
            isDefault: bIdx === 0 && dIdx === 0 && depIdx === 0 && tIdx === 0,
          });
        }
      }
    }
  }
  const teams = teamsSeed.length ? await Team.insertMany(teamsSeed) : [];

  const channelsSeed = [];
  for (const team of teams) {
    channelsSeed.push(
      ...buildDefaultChannels({
        organizationId,
        branchId: team.branch,
        divisionId: team.division,
        departmentId: team.department,
        teamId: team._id,
        ownerId,
      })
    );
  }
  if (channelsSeed.length) {
    await Channel.insertMany(channelsSeed);
  }
  return normalized;
};

const runStructureSeedInBackground = ({ organizationId, ownerId, normalizedBlueprint }) => {
  setImmediate(async () => {
    try {
      const aliveOrg = await Organization.findOne({ _id: organizationId, isActive: true })
        .select('_id')
        .lean();
      if (!aliveOrg) return;

      await Organization.updateOne(
        { _id: organizationId },
        {
          $set: {
            'provisioning.structure.status': STRUCTURE_PROVISION.RUNNING,
            'provisioning.structure.startedAt': new Date(),
            'provisioning.structure.completedAt': null,
            'provisioning.structure.error': '',
          },
        }
      );

      const existingBranchCount = await Branch.countDocuments({ organization: organizationId });
      if (existingBranchCount === 0) {
        await seedHierarchyStructure({
          organizationId,
          ownerId,
          blueprint: normalizedBlueprint,
        });
      }

      const [divisions, departments, teams] = await Promise.all([
        Division.find({ organization: organizationId, isActive: true }).select('_id name').lean(),
        Department.find({ organization: organizationId }).select('_id name').lean(),
        Team.find({ organization: organizationId, isActive: true }).select('_id name').lean(),
      ]);
      await syncHierarchyRoles(organizationId, { divisions, departments, teams });

      await Organization.updateOne(
        { _id: organizationId },
        {
          $set: {
            'provisioning.structure.status': STRUCTURE_PROVISION.READY,
            'provisioning.structure.completedAt': new Date(),
            'provisioning.structure.error': '',
          },
        }
      );

      emitRealtimeEvent({
        event: 'organization:structure_ready',
        userId: String(ownerId),
        payload: {
          organizationId: String(organizationId),
          timestamp: new Date().toISOString(),
        },
      }).catch(() => null);
    } catch (error) {
      await Organization.updateOne(
        { _id: organizationId },
        {
          $set: {
            'provisioning.structure.status': STRUCTURE_PROVISION.FAILED,
            'provisioning.structure.completedAt': new Date(),
            'provisioning.structure.error': String(error?.message || 'seed failed').slice(0, 500),
          },
        }
      ).catch(() => null);
    }
  });
};

const normalizeSlug = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

exports.getMyOrganizations = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const memberships = await Membership.find({ user: userId, status: 'active' })
      .populate({ path: 'organization', match: { isActive: true } })
      .select('organization role');

    const organizations = memberships
      .filter((membership) => !!membership.organization)
      .map((membership) => ({
        ...membership.organization.toObject(),
        myRole: membership.role,
      }));

    res.json({ status: 'success', data: organizations });
  } catch (error) {
    next(error);
  }
};

exports.createOrganization = async (req, res, next) => {
  try {
    const { name, description, logo, slug, status, type, teamSize, industry, structureBlueprint } = req.body;
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const normalizedName = String(name || '').trim();
    if (normalizedName.length < 2) {
      return res.status(400).json({ status: 'fail', message: 'Organization name must be at least 2 characters' });
    }

    const normalizedSlug = normalizeSlug(slug || normalizedName);
    if (normalizedSlug.length < 3) {
      return res.status(400).json({ status: 'fail', message: 'Slug must be at least 3 characters' });
    }
    if (RESERVED_SLUGS.has(normalizedSlug)) {
      return res.status(422).json({ status: 'fail', message: 'Slug is reserved' });
    }

    const ownerCount = await Membership.countDocuments({
      user: userId,
      role: 'owner',
      status: 'active',
    });
    if (ownerCount >= MAX_OWNED_ORGS_PER_USER) {
      return res.status(409).json({
        status: 'fail',
        message: `Owner can create up to ${MAX_OWNED_ORGS_PER_USER} organizations`,
      });
    }

    const slugExists = await Organization.exists({ slug: normalizedSlug });
    if (slugExists) {
      return res.status(409).json({ status: 'fail', message: 'Slug already exists' });
    }

    const normalizedBlueprint = normalizeHierarchyBlueprint(structureBlueprint);
    const organization = await Organization.create({
      name: normalizedName,
      description,
      logo,
      ownerId: userId,
      slug: normalizedSlug,
      status: ['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status) ? status : 'ACTIVE',
      type: String(type || '').trim(),
      teamSize: String(teamSize || '').trim(),
      industry: String(industry || '').trim(),
      provisioning: {
        structure: {
          status: STRUCTURE_PROVISION.PENDING,
          startedAt: null,
          completedAt: null,
          error: '',
        },
      },
    });

    // Auto-add creator as owner
    await Membership.create({
      user: userId,
      organization: organization._id,
      role: 'owner',
      status: 'active',
    });

    await syncUserOrgRole(userId, organization._id, 'owner');
    runStructureSeedInBackground({
      organizationId: organization._id,
      ownerId: userId,
      normalizedBlueprint,
    });

    emitRealtimeEvent({
      event: 'organization:created',
      userId: String(userId),
      payload: {
        organizationId: String(organization._id),
        name: organization.name,
        timestamp: new Date().toISOString(),
      },
    }).catch(() => null);

    res.status(201).json({
      status: 'success',
      data: {
        ...organization.toObject(),
        structureBlueprint: normalizedBlueprint,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrganizationBySlug = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const slug = normalizeSlug(req.params.slug);
    if (!slug) {
      return res.status(400).json({ status: 'fail', message: 'Invalid slug' });
    }
    const organization = await Organization.findOne({ slug, isActive: true });
    if (!organization) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }
    const membership = await Membership.findOne({
      user: userId,
      organization: organization._id,
      status: 'active',
    });
    if (!membership) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }

    res.json({
      status: 'success',
      data: { ...organization.toObject(), myRole: membership.role },
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrganization = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }

    // Check membership
    const membership = await Membership.findOne({
      user: userId,
      organization: organization._id,
    });

    if (!membership) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }

    res.json({ status: 'success', data: { ...organization.toObject(), myRole: membership.role } });
  } catch (error) {
    next(error);
  }
};

exports.updateOrganization = async (req, res, next) => {
  try {
    const { name, description, logo, settings } = req.body;

    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { name, description, logo, settings },
      { new: true, runValidators: true }
    );

    await emitRealtimeEvent({
      event: 'organization:updated',
      userId: String(getUserId(req) || ''),
      payload: {
        organizationId: String(req.params.id),
        name: organization?.name,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ status: 'success', data: organization });
  } catch (error) {
    next(error);
  }
};

exports.deleteOrganization = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    const userId = getUserId(req);
    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }
    if (String(organization.ownerId) !== String(userId)) {
      return res.status(403).json({ status: 'fail', message: 'Only the organization owner can delete the organization' });
    }

    await purgeOrganizationEverywhere(orgId);

    await emitRealtimeEvent({
      event: 'organization:deleted',
      userId: String(userId || ''),
      payload: {
        organizationId: String(orgId),
        timestamp: new Date().toISOString(),
      },
    });
    res.json({ status: 'success', message: 'Organization and related data have been removed' });
  } catch (error) {
    next(error);
  }
};

exports.getOrganizationStructure = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { orgId } = req.params;
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const membership = await Membership.findOne({
      user: userId,
      organization: orgId,
      status: 'active',
    }).select('_id');
    if (!membership) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }

    const [branches, divisions, departments, teams, channels, organization] = await Promise.all([
      Branch.find({ organization: orgId, isActive: true }).sort({ createdAt: 1 }).lean(),
      Division.find({ organization: orgId, isActive: true }).sort({ createdAt: 1 }).lean(),
      Department.find({ organization: orgId }).sort({ createdAt: 1 }).lean(),
      Team.find({ organization: orgId, isActive: true }).sort({ createdAt: 1 }).lean(),
      Channel.find({ organization: orgId, isActive: true }).sort({ createdAt: 1 }).lean(),
      Organization.findById(orgId).select('provisioning.structure').lean(),
    ]);

    const channelsByTeam = new Map();
    const channelsByDepartment = new Map();
    const channelsByDivision = new Map();
    for (const channel of channels) {
      const teamKey = String(channel.team || '');
      const departmentKey = String(channel.department || '');
      const divisionKey = String(channel.division || '');
      if (teamKey) {
        if (!channelsByTeam.has(teamKey)) channelsByTeam.set(teamKey, []);
        channelsByTeam.get(teamKey).push(channel);
        continue;
      }
      if (departmentKey) {
        if (!channelsByDepartment.has(departmentKey)) channelsByDepartment.set(departmentKey, []);
        channelsByDepartment.get(departmentKey).push(channel);
        continue;
      }
      if (divisionKey) {
        if (!channelsByDivision.has(divisionKey)) channelsByDivision.set(divisionKey, []);
        channelsByDivision.get(divisionKey).push(channel);
      }
    }

    const teamsByDepartment = new Map();
    for (const team of teams) {
      const key = String(team.department || '');
      if (!key) continue;
      if (!teamsByDepartment.has(key)) teamsByDepartment.set(key, []);
      teamsByDepartment.get(key).push({
        ...team,
        channels: channelsByTeam.get(String(team._id)) || [],
      });
    }

    const departmentsByDivision = new Map();
    for (const department of departments) {
      const key = String(department.division || '');
      if (!key) continue;
      if (!departmentsByDivision.has(key)) departmentsByDivision.set(key, []);
      departmentsByDivision.get(key).push({
        ...department,
        channels: channelsByDepartment.get(String(department._id)) || [],
        teams: teamsByDepartment.get(String(department._id)) || [],
      });
    }

    const divisionsByBranch = new Map();
    for (const division of divisions) {
      const key = String(division.branch || '');
      if (!key) continue;
      if (!divisionsByBranch.has(key)) divisionsByBranch.set(key, []);
      divisionsByBranch.get(key).push({
        ...division,
        channels: channelsByDivision.get(String(division._id)) || [],
        departments: departmentsByDivision.get(String(division._id)) || [],
      });
    }

    const tree = branches.map((branch) => ({
      ...branch,
      divisions: divisionsByBranch.get(String(branch._id)) || [],
    }));

    // Self-heal: mỗi lần load structure sẽ cố sync lại role khối/phòng/team để bù các lần tạo hụt do lỗi mạng tạm thời.
    syncHierarchyRoles(orgId, { divisions, departments, teams }).catch(() => null);

    return res.json({
      status: 'success',
      data: {
        branches: tree,
        provisioning: organization?.provisioning?.structure || {
          status: STRUCTURE_PROVISION.READY,
          startedAt: null,
          completedAt: null,
          error: '',
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

/** Kênh (roomId tin nhắn) mà user được phép xem trong tổ chức — dùng cho chat-service search. */
exports.getAccessibleChannelIds = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { orgId } = req.params;
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const membership = await Membership.findOne({
      user: userId,
      organization: orgId,
      status: 'active',
    });
    if (!membership) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }
    const channels = await Channel.find({ organization: orgId, isActive: true })
      .select('_id members team division department')
      .lean();
    const aclRows = await ChannelAccess.find({
      organization: orgId,
      user: userId,
    })
      .select('channel permissions')
      .lean();
    const aclByChannelId = new Map(
      aclRows.map((row) => [
        String(row.channel),
        {
          canRead: Boolean(row.permissions?.canRead),
          canWrite: Boolean(row.permissions?.canWrite),
          canVoice: Boolean(row.permissions?.canVoice),
        },
      ])
    );
    const membershipTeamId = String(membership.team || '');
    const membershipDivisionId = String(membership.division || '');
    const membershipRole = Membership.normalizeRole(membership.role);
    const isOrgAdminScope = membershipRole === 'owner' || membershipRole === 'admin';
    const roleNames = await fetchUserRoleNamesInOrg(userId, orgId);
    const uid = String(userId);
    const permissionsByChannelId = {};
    const channelIds = [];

    for (const ch of channels) {
      const channelId = String(ch._id);
      const acl = aclByChannelId.get(channelId) || null;
      const isPrimaryTeam = membershipTeamId && String(ch.team || '') === membershipTeamId;
      const inMembershipDivision =
        membershipDivisionId && String(ch.division || '') === membershipDivisionId;
      const hasTeamScopedRole = hasScopedRoleTag(roleNames, 'team', ch.team);
      const hasDepartmentScopedRole = hasScopedRoleTag(roleNames, 'dep', ch.department);
      const hasDivisionScopedRole = hasScopedRoleTag(roleNames, 'div', ch.division);

      let canRead = false;
      let canWrite = false;
      let canVoice = false;

      if (isOrgAdminScope) {
        // Owner/Admin được toàn quyền trên mọi kênh trong tổ chức (xuyên khối/phòng/team).
        canRead = true;
        canWrite = true;
        canVoice = true;
      } else if (isPrimaryTeam || hasTeamScopedRole) {
        canRead = true;
        canWrite = true;
        canVoice = true;
      } else if (hasDepartmentScopedRole || hasDivisionScopedRole) {
        // Role khối/phòng ban: cho phép hoạt động chat/voice trên kênh thuộc phạm vi đã cấp.
        // Tránh tình trạng UI hiển thị khóa dù user đã được cấp role theo cấu trúc.
        canRead = true;
        canWrite = true;
        canVoice = true;
      } else if (acl) {
        canRead = Boolean(acl.canRead);
        canWrite = Boolean(acl.canWrite);
        canVoice = Boolean(acl.canVoice);
      } else if (inMembershipDivision) {
        // Trong cùng khối: chỉ hiển thị cấu trúc, chưa có ACL thì không đọc/ghi/voice.
        canRead = false;
      }

      if (ch.members && ch.members.length > 0) {
        const inLegacyMemberList = ch.members.some((m) => String(m) === uid || String(m?._id || m) === uid);
        if (inLegacyMemberList) {
          canRead = true;
          canWrite = true;
          canVoice = true;
        }
      }

      permissionsByChannelId[channelId] = { canRead, canWrite, canVoice };
      if (canRead) channelIds.push(channelId);
    }

    res.json({
      status: 'success',
      data: {
        channelIds,
        permissionsByChannelId,
        scope: {
          branchId: membership.branch ? String(membership.branch) : null,
          divisionId: membership.division ? String(membership.division) : null,
          departmentId: membership.department ? String(membership.department) : null,
          teamId: membership.team ? String(membership.team) : null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.listChannelAccess = async (req, res, next) => {
  try {
    const { orgId, channelId } = req.params;
    const channel = await Channel.findOne({
      _id: channelId,
      organization: orgId,
      isActive: true,
    })
      .select('_id name type team department division')
      .lean();
    if (!channel) {
      return res.status(404).json({ status: 'fail', message: 'Channel not found' });
    }
    const rows = await ChannelAccess.find({ organization: orgId, channel: channelId })
      .select('user permissions grantedBy grantedAt')
      .lean();
    return res.json({ status: 'success', data: { channel, accesses: rows } });
  } catch (error) {
    return next(error);
  }
};

exports.grantChannelAccess = async (req, res, next) => {
  try {
    const actorId = getUserId(req);
    const { orgId, channelId } = req.params;
    const { userId, permissions } = req.body || {};
    if (!userId) {
      return res.status(400).json({ status: 'fail', message: 'userId is required' });
    }
    const channel = await Channel.findOne({
      _id: channelId,
      organization: orgId,
      isActive: true,
    })
      .select('_id')
      .lean();
    if (!channel) {
      return res.status(404).json({ status: 'fail', message: 'Channel not found' });
    }
    const membership = await Membership.findOne({
      user: userId,
      organization: orgId,
      status: 'active',
    })
      .select('_id')
      .lean();
    if (!membership) {
      return res.status(400).json({ status: 'fail', message: 'User is not a member of organization' });
    }
    const nextPermissions = {
      canRead: permissions?.canRead !== undefined ? Boolean(permissions.canRead) : true,
      canWrite: permissions?.canWrite !== undefined ? Boolean(permissions.canWrite) : false,
      canVoice: permissions?.canVoice !== undefined ? Boolean(permissions.canVoice) : false,
    };
    const row = await ChannelAccess.findOneAndUpdate(
      { organization: orgId, channel: channelId, user: userId },
      {
        organization: orgId,
        channel: channelId,
        user: userId,
        permissions: nextPermissions,
        grantedBy: actorId || null,
        grantedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({ status: 'success', data: row });
  } catch (error) {
    return next(error);
  }
};

exports.revokeChannelAccess = async (req, res, next) => {
  try {
    const { orgId, channelId } = req.params;
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ status: 'fail', message: 'userId is required' });
    }
    await ChannelAccess.deleteOne({
      organization: orgId,
      channel: channelId,
      user: userId,
    });
    return res.json({ status: 'success', message: 'Access revoked' });
  } catch (error) {
    return next(error);
  }
};
