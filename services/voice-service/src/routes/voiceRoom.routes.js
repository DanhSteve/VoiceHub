const express = require('express');
const router = express.Router({ mergeParams: true });
const voiceRoomController = require('../controllers/voiceRoom.controller');

router.post('/lobby/host', voiceRoomController.registerHost.bind(voiceRoomController));
router.get('/lobby', voiceRoomController.getLobby.bind(voiceRoomController));

router.post('/join-requests', voiceRoomController.createJoinRequest.bind(voiceRoomController));
router.get('/join-requests/me', voiceRoomController.getMyJoinRequest.bind(voiceRoomController));
router.get('/join-requests', voiceRoomController.listJoinRequests.bind(voiceRoomController));
router.post(
  '/join-requests/:requestId/approve',
  voiceRoomController.approveJoinRequest.bind(voiceRoomController)
);
router.post(
  '/join-requests/:requestId/reject',
  voiceRoomController.rejectJoinRequest.bind(voiceRoomController)
);

router.post('/invites', voiceRoomController.sendInvites.bind(voiceRoomController));

module.exports = router;
