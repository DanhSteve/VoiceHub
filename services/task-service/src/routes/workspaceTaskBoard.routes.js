const express = require('express');
const resolveWorkspaceContext = require('../middleware/resolveWorkspaceContext');
const taskBoardRoutes = require('./taskBoard.routes');

const router = express.Router({ mergeParams: true });

router.use(resolveWorkspaceContext);
router.use(taskBoardRoutes);

module.exports = router;
