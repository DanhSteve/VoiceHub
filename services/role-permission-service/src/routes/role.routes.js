const express = require('express');
const router = express.Router();
const { authenticate } = require('/shared/middleware/auth');
const { requireRolePermission } = require('../middleware/requireRoleAccess');
const roleController = require('../controllers/role.controller');

router.use(authenticate);

router.post('/', requireRolePermission('role:write'), roleController.createRole.bind(roleController));
router.get(
  '/server/:serverId',
  requireRolePermission('role:read'),
  roleController.getRolesByServer.bind(roleController)
);
router.post('/assign', requireRolePermission('role:write'), roleController.assignRoleToUser.bind(roleController));
router.post('/remove', requireRolePermission('role:write'), roleController.removeRoleFromUser.bind(roleController));
router.get(
  '/user/:userId/server/:serverId',
  requireRolePermission('role:read'),
  roleController.getUserRoles.bind(roleController)
);
router.get('/:roleId', requireRolePermission('role:read'), roleController.getRoleById.bind(roleController));
router.patch('/:roleId', requireRolePermission('role:write'), roleController.updateRole.bind(roleController));
router.put('/:roleId', requireRolePermission('role:write'), roleController.updateRole.bind(roleController));
router.delete('/:roleId', requireRolePermission('role:write'), roleController.deleteRole.bind(roleController));

module.exports = router;
