const express = require('express');
const router = express.Router({ mergeParams: true });
const memberController = require('../controllers/memberController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', memberController.getMembers);
router.post('/leave', memberController.leaveOrganization);
router.post('/', authorize(['owner', 'admin']), memberController.inviteMember);
router.post('/invite', authorize(['owner', 'admin']), memberController.inviteMember);
router.post('/invite-link', authorize(['owner', 'admin']), memberController.createInviteLink);
router.post('/join-link', memberController.joinViaLink);
router.put('/:userId/role', authorize(['owner', 'admin']), memberController.updateMemberRole);
router.delete('/:userId', authorize(['owner', 'admin']), memberController.removeMember);

module.exports = router;
