const express = require('express');
const { mongoose } = require('/shared/config/mongo');
const AiTaskExtraction = require('../models/AiTaskExtraction');
const SyncSuggestion = require('../models/SyncSuggestion');
const { logger } = require('/shared');

const router = express.Router();

router.delete('/purge-organization/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(organizationId))) {
      return res.status(400).json({ success: false, message: 'Invalid organizationId' });
    }
    const oid = new mongoose.Types.ObjectId(String(organizationId));
    const [ext, sug] = await Promise.all([
      AiTaskExtraction.deleteMany({ organizationId: oid }),
      SyncSuggestion.deleteMany({ organizationId: oid }),
    ]);
    return res.json({
      success: true,
      deletedExtractions: ext.deletedCount,
      deletedSuggestions: sug.deletedCount,
    });
  } catch (error) {
    logger.error('internal purge-organization ai-task', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
