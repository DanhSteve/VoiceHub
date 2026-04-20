const Organization = require('../models/Organization');
const Membership = require('../models/Membership');
const Department = require('../models/Department');
const Channel = require('../models/Channel');
const { emitRealtimeEvent } = require('/shared');

const getUserId = (req) => req.user?.id || req.user?.userId || req.user?._id;
const DEFAULT_DEPARTMENTS = [
  { name: 'Human Resources', description: 'HR and workplace culture' },
  { name: 'Accounting', description: 'Finance and internal accounting' },
  { name: 'Sales', description: 'Sales and customer growth' },
  { name: 'Operations', description: 'Operations and process optimization' },
];

const buildDefaultChannels = (organizationId, departmentId, ownerId) => [
  {
    name: 'general',
    description: 'Department-wide text chat',
    type: 'chat',
    organization: organizationId,
    department: departmentId,
    leader: ownerId,
  },
  {
    name: 'voice',
    description: 'Department voice channel',
    type: 'voice',
    organization: organizationId,
    department: departmentId,
    leader: ownerId,
  },
];

const seedDefaultStructure = async (organizationId, ownerId) => {
  const departments = await Department.insertMany(
    DEFAULT_DEPARTMENTS.map((department) => ({
      ...department,
      organization: organizationId,
      head: ownerId,
    }))
  );

  const channels = departments.flatMap((department) =>
    buildDefaultChannels(organizationId, department._id, ownerId)
  );

  await Channel.insertMany(channels);
};

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
    const { name, description, logo } = req.body;
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }

    const organization = await Organization.create({
      name,
      description,
      logo,
      ownerId: userId,
    });

    // Auto-add creator as owner
    await Membership.create({
      user: userId,
      organization: organization._id,
      role: 'owner',
      status: 'active',
    });

    // Seed cấu trúc mặc định: phòng ban bắt buộc + 1 chat/1 voice cho mỗi phòng ban
    await seedDefaultStructure(organization._id, userId);

    await emitRealtimeEvent({
      event: 'organization:created',
      userId: String(userId),
      payload: {
        organizationId: String(organization._id),
        name: organization.name,
        timestamp: new Date().toISOString(),
      },
    });

    res.status(201).json({ status: 'success', data: organization });
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
    await Organization.findByIdAndUpdate(req.params.id, { isActive: false });

    await emitRealtimeEvent({
      event: 'organization:deleted',
      userId: String(getUserId(req) || ''),
      payload: {
        organizationId: String(req.params.id),
        timestamp: new Date().toISOString(),
      },
    });
    res.json({ status: 'success', message: 'Organization deactivated' });
  } catch (error) {
    next(error);
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
    const channels = await Channel.find({ organization: orgId, isActive: true }).select('_id members').lean();
    const uid = String(userId);
    const channelIds = channels
      .filter((ch) => {
        if (!ch.members || ch.members.length === 0) return true;
        return ch.members.some((m) => String(m) === uid || String(m?._id || m) === uid);
      })
      .map((ch) => String(ch._id));
    res.json({ status: 'success', data: { channelIds } });
  } catch (error) {
    next(error);
  }
};
