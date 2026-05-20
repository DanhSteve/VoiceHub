const Department = require('../models/Department');
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const { ensureDepartmentRole } = require('../services/hierarchyRoleSync');

exports.getDepartments = async (req, res, next) => {
  try {
    const departments = await Department.find({ organization: req.params.orgId });

    res.json({ status: 'success', data: departments });
  } catch (error) {
    next(error);
  }
};

exports.createDepartment = async (req, res, next) => {
  try {
    const { name, description, head } = req.body;
    let branchId = req.body?.branch || null;
    let divisionId = req.body?.division || null;

    if (!branchId || !divisionId) {
      const defaultBranch = await Branch.findOne({
        organization: req.params.orgId,
        isActive: true,
      })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean();
      if (defaultBranch && !branchId) branchId = defaultBranch._id;
      if (!divisionId && defaultBranch) {
        const defaultDivision = await Division.findOne({
          organization: req.params.orgId,
          branch: defaultBranch._id,
          isActive: true,
        })
          .sort({ isDefault: -1, createdAt: 1 })
          .lean();
        if (defaultDivision) divisionId = defaultDivision._id;
      }
    }

    const department = await Department.create({
      name,
      description,
      organization: req.params.orgId,
      branch: branchId,
      division: divisionId,
      head,
    });
    await ensureDepartmentRole(req.params.orgId, department._id, department.name);

    res.status(201).json({ status: 'success', data: department });
  } catch (error) {
    next(error);
  }
};

exports.updateDepartment = async (req, res, next) => {
  try {
    const { name, description, head } = req.body;

    const department = await Department.findByIdAndUpdate(
      req.params.id,
      { name, description, head },
      { new: true }
    );
    if (department) {
      await ensureDepartmentRole(req.params.orgId, department._id, department.name);
    }

    res.json({ status: 'success', data: department });
  } catch (error) {
    next(error);
  }
};

exports.deleteDepartment = async (req, res, next) => {
  try {
    await Department.findByIdAndDelete(req.params.id);
    res.json({ status: 'success', message: 'Department deleted' });
  } catch (error) {
    next(error);
  }
};
