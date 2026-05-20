const Branch = require('../models/Branch');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Channel = require('../models/Channel');
const {
  ensureDivisionRole,
  ensureDepartmentRole,
  ensureTeamRole,
} = require('../services/hierarchyRoleSync');

const unwrapName = (v, fallback) => {
  const s = String(v || '').trim();
  return s || fallback;
};
const allowedChannelTypes = new Set(['chat', 'voice', 'announcement']);

exports.listBranches = async (req, res, next) => {
  try {
    const rows = await Branch.find({ organization: req.params.orgId, isActive: true }).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createBranch = async (req, res, next) => {
  try {
    const doc = await Branch.create({
      organization: req.params.orgId,
      name: unwrapName(req.body?.name, 'Chi nhánh mới'),
      location: String(req.body?.location || '').trim(),
    });
    res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    next(error);
  }
};

exports.listDivisions = async (req, res, next) => {
  try {
    const rows = await Division.find({
      organization: req.params.orgId,
      branch: req.params.branchId,
      isActive: true,
    }).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createDivision = async (req, res, next) => {
  try {
    const doc = await Division.create({
      organization: req.params.orgId,
      branch: req.params.branchId,
      name: unwrapName(req.body?.name, 'Khối mới'),
    });
    await ensureDivisionRole(req.params.orgId, doc._id, doc.name);
    res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    next(error);
  }
};

exports.updateDivision = async (req, res, next) => {
  try {
    const doc = await Division.findOneAndUpdate(
      {
        _id: req.params.divisionId,
        organization: req.params.orgId,
        isActive: true,
      },
      {
        $set: {
          name: unwrapName(req.body?.name, 'Khối mới'),
        },
      },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ status: 'fail', message: 'Division not found' });
    }
    await ensureDivisionRole(req.params.orgId, doc._id, doc.name);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.listDepartmentsByDivision = async (req, res, next) => {
  try {
    const rows = await Department.find({
      organization: req.params.orgId,
      division: req.params.divisionId,
    }).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createDepartmentByDivision = async (req, res, next) => {
  try {
    const division = await Division.findOne({
      _id: req.params.divisionId,
      organization: req.params.orgId,
      isActive: true,
    }).lean();
    if (!division) {
      return res.status(404).json({ status: 'fail', message: 'Division not found' });
    }
    const doc = await Department.create({
      organization: req.params.orgId,
      branch: division.branch,
      division: division._id,
      name: unwrapName(req.body?.name, 'Phòng ban mới'),
      description: String(req.body?.description || '').trim(),
      head: req.body?.head || null,
    });
    await ensureDepartmentRole(req.params.orgId, doc._id, doc.name);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.listTeamsByDepartment = async (req, res, next) => {
  try {
    const rows = await Team.find({
      organization: req.params.orgId,
      department: req.params.deptId,
      isActive: true,
    }).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createTeamByDepartment = async (req, res, next) => {
  try {
    const department = await Department.findOne({
      _id: req.params.deptId,
      organization: req.params.orgId,
    }).lean();
    if (!department) {
      return res.status(404).json({ status: 'fail', message: 'Department not found' });
    }
    const doc = await Team.create({
      organization: req.params.orgId,
      branch: department.branch || null,
      division: department.division || null,
      department: department._id,
      name: unwrapName(req.body?.name, 'Team mới'),
      description: String(req.body?.description || '').trim(),
      leader: req.body?.leader || null,
    });
    await ensureTeamRole(req.params.orgId, doc._id, doc.name);
    await Channel.insertMany([
      {
        name: 'general',
        type: 'chat',
        description: 'Team text chat',
        organization: req.params.orgId,
        branch: department.branch || null,
        division: department.division || null,
        department: department._id,
        team: doc._id,
        leader: req.body?.leader || null,
      },
      {
        name: 'voice',
        type: 'voice',
        description: 'Team voice channel',
        organization: req.params.orgId,
        branch: department.branch || null,
        division: department.division || null,
        department: department._id,
        team: doc._id,
        leader: req.body?.leader || null,
      },
    ]);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.updateTeamByHierarchy = async (req, res, next) => {
  try {
    const doc = await Team.findOneAndUpdate(
      {
        _id: req.params.teamId,
        organization: req.params.orgId,
        isActive: true,
      },
      {
        $set: {
          name: unwrapName(req.body?.name, 'Team mới'),
        },
      },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ status: 'fail', message: 'Team not found' });
    }
    await ensureTeamRole(req.params.orgId, doc._id, doc.name);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.listChannelsByTeam = async (req, res, next) => {
  try {
    const rows = await Channel.find({
      organization: req.params.orgId,
      team: req.params.teamId,
      isActive: true,
    }).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createChannelByTeam = async (req, res, next) => {
  try {
    const team = await Team.findOne({
      _id: req.params.teamId,
      organization: req.params.orgId,
      isActive: true,
    }).lean();
    if (!team) {
      return res.status(404).json({ status: 'fail', message: 'Team not found' });
    }
    const doc = await Channel.create({
      organization: req.params.orgId,
      branch: team.branch || null,
      division: team.division || null,
      department: team.department,
      team: team._id,
      name: unwrapName(req.body?.name, 'kênh-mới'),
      description: String(req.body?.description || '').trim(),
      type: ['chat', 'voice', 'announcement'].includes(req.body?.type) ? req.body.type : 'chat',
      leader: req.body?.leader || team.leader || null,
    });
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.createChannelByScope = async (req, res, next) => {
  try {
    const levelRaw = String(req.body?.level || '').trim().toLowerCase();
    const level = ['division', 'department', 'team'].includes(levelRaw) ? levelRaw : 'team';
    const type = allowedChannelTypes.has(String(req.body?.type || '').trim())
      ? String(req.body.type).trim()
      : 'chat';
    const actorId = req.user?.id || req.user?.userId || req.user?._id || null;

    if (level === 'team') {
      const teamId = req.body?.teamId || req.params.teamId;
      if (!teamId) {
        return res.status(400).json({ status: 'fail', message: 'teamId is required' });
      }
      const team = await Team.findOne({
        _id: teamId,
        organization: req.params.orgId,
        isActive: true,
      }).lean();
      if (!team) {
        return res.status(404).json({ status: 'fail', message: 'Team not found' });
      }
      const doc = await Channel.create({
        organization: req.params.orgId,
        branch: team.branch || null,
        division: team.division || null,
        department: team.department || null,
        team: team._id,
        name: unwrapName(req.body?.name, 'kênh-mới'),
        description: String(req.body?.description || '').trim(),
        type,
        leader: req.body?.leader || team.leader || actorId,
      });
      return res.status(201).json({ status: 'success', data: doc });
    }

    if (level === 'department') {
      const departmentId = req.body?.departmentId || null;
      if (!departmentId) {
        return res.status(400).json({ status: 'fail', message: 'departmentId is required' });
      }
      const department = await Department.findOne({
        _id: departmentId,
        organization: req.params.orgId,
      }).lean();
      if (!department) {
        return res.status(404).json({ status: 'fail', message: 'Department not found' });
      }
      const doc = await Channel.create({
        organization: req.params.orgId,
        branch: department.branch || null,
        division: department.division || null,
        department: department._id,
        team: null,
        name: unwrapName(req.body?.name, 'kênh-mới'),
        description: String(req.body?.description || '').trim(),
        type,
        leader: req.body?.leader || actorId,
      });
      return res.status(201).json({ status: 'success', data: doc });
    }

    const divisionId = req.body?.divisionId || null;
    if (!divisionId) {
      return res.status(400).json({ status: 'fail', message: 'divisionId is required' });
    }
    const division = await Division.findOne({
      _id: divisionId,
      organization: req.params.orgId,
      isActive: true,
    }).lean();
    if (!division) {
      return res.status(404).json({ status: 'fail', message: 'Division not found' });
    }
    const doc = await Channel.create({
      organization: req.params.orgId,
      branch: division.branch || null,
      division: division._id,
      department: null,
      team: null,
      name: unwrapName(req.body?.name, 'kênh-mới'),
      description: String(req.body?.description || '').trim(),
      type,
      leader: req.body?.leader || actorId,
    });
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.updateChannelByScope = async (req, res, next) => {
  try {
    const doc = await Channel.findOneAndUpdate(
      {
        _id: req.params.channelId,
        organization: req.params.orgId,
        isActive: true,
      },
      {
        $set: {
          name: unwrapName(req.body?.name, 'kênh-mới'),
        },
      },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ status: 'fail', message: 'Channel not found' });
    }
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.updateChannelByTeam = async (req, res, next) => {
  try {
    const doc = await Channel.findOneAndUpdate(
      {
        _id: req.params.channelId,
        organization: req.params.orgId,
        team: req.params.teamId,
        isActive: true,
      },
      {
        $set: {
          name: unwrapName(req.body?.name, 'kênh-mới'),
        },
      },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ status: 'fail', message: 'Channel not found' });
    }
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};
