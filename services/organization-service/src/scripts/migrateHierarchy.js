const { mongoose } = require('/shared/config/mongo');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Channel = require('../models/Channel');
const Membership = require('../models/Membership');

async function ensureDefaultsForOrganization(org) {
  let branch = await Branch.findOne({ organization: org._id, isActive: true }).sort({ isDefault: -1, createdAt: 1 });
  if (!branch) {
    branch = await Branch.create({
      organization: org._id,
      name: 'Chi nhánh mặc định',
      isDefault: true,
    });
  }

  let division = await Division.findOne({ organization: org._id, branch: branch._id, isActive: true }).sort({
    isDefault: -1,
    createdAt: 1,
  });
  if (!division) {
    division = await Division.create({
      organization: org._id,
      branch: branch._id,
      name: 'Khối mặc định',
      isDefault: true,
    });
  }

  const departments = await Department.find({ organization: org._id });
  for (const department of departments) {
    let dirty = false;
    if (!department.branch) {
      department.branch = branch._id;
      dirty = true;
    }
    if (!department.division) {
      department.division = division._id;
      dirty = true;
    }
    if (dirty) await department.save();

    let team = await Team.findOne({ organization: org._id, department: department._id, isActive: true }).sort({
      isDefault: -1,
      createdAt: 1,
    });
    if (!team) {
      team = await Team.create({
        organization: org._id,
        branch: department.branch,
        division: department.division,
        department: department._id,
        name: `${department.name} Team`,
        isDefault: true,
      });
    }

    await Channel.updateMany(
      { organization: org._id, department: department._id, team: null },
      {
        $set: {
          branch: department.branch || branch._id,
          division: department.division || division._id,
          team: team._id,
        },
      }
    );
  }

  await Membership.updateMany(
    { organization: org._id, team: { $ne: null } },
    { $set: { team: null } }
  );
}

async function run() {
  await mongoose.connection.asPromise();
  const orgs = await Organization.find({ isActive: true }).select('_id name');
  for (const org of orgs) {
    // eslint-disable-next-line no-console
    console.log(`Migrating hierarchy for ${org.name} (${org._id})`);
    await ensureDefaultsForOrganization(org);
  }
  // eslint-disable-next-line no-console
  console.log('Hierarchy migration completed');
  process.exit(0);
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Hierarchy migration failed', error);
  process.exit(1);
});
