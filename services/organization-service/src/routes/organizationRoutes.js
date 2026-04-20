const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const memberController = require('../controllers/memberController');
const joinApplicationController = require('../controllers/joinApplicationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // All routes require authentication

router.get('/my', organizationController.getMyOrganizations);
router.get(
  '/my/pending-join-applications',
  joinApplicationController.listMyPendingJoinApplications
);
router.get(
  '/my/join-applications-to-review',
  joinApplicationController.listJoinApplicationsToReview
);
router.get('/invitations', memberController.getMyInvitations);
router.post('/invitations/:invitationId/respond', memberController.respondToInvitation);
router.post('/', organizationController.createOrganization);

/** Đơn gia nhập — đặt trước /:id để không bị nuốt bởi route một phân đoạn */
router.get(
  '/:orgId/join-application-form/public',
  joinApplicationController.getJoinApplicationFormPublic
);
router.get(
  '/:orgId/join-application-form',
  authorize(['owner', 'admin']),
  joinApplicationController.getJoinApplicationForm
);
router.put(
  '/:orgId/join-application-form',
  authorize(['owner', 'admin']),
  joinApplicationController.updateJoinApplicationForm
);
router.post('/:orgId/join-applications', joinApplicationController.submitJoinApplication);
router.get(
  '/:orgId/join-applications',
  authorize(['owner', 'admin']),
  joinApplicationController.listJoinApplications
);
router.patch(
  '/:orgId/join-applications/:applicationId',
  authorize(['owner', 'admin']),
  joinApplicationController.reviewJoinApplication
);

router.get('/:orgId/accessible-channel-ids', organizationController.getAccessibleChannelIds);

router.get('/:id', organizationController.getOrganization);
router.put('/:id', authorize(['owner', 'admin']), organizationController.updateOrganization);
router.delete('/:id', authorize(['owner']), organizationController.deleteOrganization);

module.exports = router;
