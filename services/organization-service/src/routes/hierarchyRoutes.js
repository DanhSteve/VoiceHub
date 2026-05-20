const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const hierarchyController = require('../controllers/hierarchyController');
const organizationController = require('../controllers/organizationController');

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/branches', hierarchyController.listBranches);
router.post('/branches', authorize(['owner', 'admin']), hierarchyController.createBranch);

router.get('/branches/:branchId/divisions', hierarchyController.listDivisions);
router.post('/branches/:branchId/divisions', authorize(['owner', 'admin']), hierarchyController.createDivision);
router.put('/divisions/:divisionId', authorize(['owner', 'admin']), hierarchyController.updateDivision);

router.get('/divisions/:divisionId/departments', hierarchyController.listDepartmentsByDivision);
router.post('/divisions/:divisionId/departments', authorize(['owner', 'admin']), hierarchyController.createDepartmentByDivision);

router.get('/departments/:deptId/teams', hierarchyController.listTeamsByDepartment);
router.post('/departments/:deptId/teams', authorize(['owner', 'admin']), hierarchyController.createTeamByDepartment);
router.put('/teams/:teamId', authorize(['owner', 'admin']), hierarchyController.updateTeamByHierarchy);
router.get(
  '/teams/:teamId/role-access',
  authorize(['owner', 'admin']),
  organizationController.listTeamRoleAccess
);
router.put(
  '/teams/:teamId/role-access',
  authorize(['owner', 'admin']),
  organizationController.saveTeamRoleAccess
);

router.get('/teams/:teamId/channels', hierarchyController.listChannelsByTeam);
router.post('/teams/:teamId/channels', authorize(['owner', 'admin']), hierarchyController.createChannelByTeam);
router.put('/teams/:teamId/channels/:channelId', authorize(['owner', 'admin']), hierarchyController.updateChannelByTeam);
router.post('/channels', authorize(['owner', 'admin']), hierarchyController.createChannelByScope);
router.put('/channels/:channelId', authorize(['owner', 'admin']), hierarchyController.updateChannelByScope);

module.exports = router;
