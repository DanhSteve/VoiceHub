const express = require('express');
const internalGatewayAuth = require('/shared/middleware/internalGatewayAuth');
const router = express.Router();
const meetingController = require('../controllers/meeting.controller');
const { authenticate } = require('/shared/middleware/auth');

router.delete(
  '/internal/purge-organization/:organizationId',
  internalGatewayAuth,
  meetingController.purgeOrganizationMeetings.bind(meetingController)
);

router.use(authenticate);

// Cuộc gọi 1-1 bạn bè — đặt trước route động `/:meetingId`
const callRoutes = require('./call.routes');
router.use(callRoutes);

// Tạo meeting mới
router.post('/', meetingController.createMeeting.bind(meetingController));

// Lấy danh sách meetings
router.get('/', meetingController.getMeetings.bind(meetingController));

// Bootstrap dữ liệu room cho WebRTC client (đặt trước dynamic route để tránh shadow route)
router.get('/rooms/:roomId/bootstrap', meetingController.bootstrapRoom.bind(meetingController));

// Lấy meeting theo ID
router.get('/:meetingId', meetingController.getMeetingById.bind(meetingController));

// Bootstrap dữ liệu room cho WebRTC client
router.get('/:meetingId/bootstrap', meetingController.bootstrapMeetingRoom.bind(meetingController));

// Bắt đầu meeting
router.post('/:meetingId/start', meetingController.startMeeting.bind(meetingController));

// Kết thúc meeting
router.post('/:meetingId/end', meetingController.endMeeting.bind(meetingController));

// Thêm participant
router.post('/:meetingId/participants', meetingController.addParticipant.bind(meetingController));

// Xóa participant
router.delete('/:meetingId/participants/:userId', meetingController.removeParticipant.bind(meetingController));

module.exports = router;



