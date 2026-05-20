const express = require('express');
const callController = require('../controllers/call.controller');

const router = express.Router();

router.post('/calls/initiate', callController.initiate.bind(callController));
router.get('/calls/:callId', callController.getCall.bind(callController));
router.post('/calls/:callId/accept', callController.accept.bind(callController));
router.post('/calls/:callId/reject', callController.reject.bind(callController));
router.post('/calls/:callId/cancel', callController.cancel.bind(callController));
router.post('/calls/:callId/end', callController.end.bind(callController));

module.exports = router;
