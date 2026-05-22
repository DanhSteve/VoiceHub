const express = require('express');
const Organization = require('../models/Organization');
const { buildAiTaskExtractContext } = require('../services/memberContext.service');
const { syncMembershipPlacementFromRoles } = require('../services/membershipPlacementSync');

const router = express.Router();

/** Tên tổ chức cho webhook / service nội bộ (serverId RBAC = organizationId). */
router.get('/org/:organizationId/summary', async (req, res) => {
  try {
    const org = await Organization.findById(req.params.organizationId).select('name').lean();
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }
    return res.json({
      success: true,
      data: { organizationId: String(req.params.organizationId), name: org.name || 'Organization' },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
});

/**
 * POST body: { organizationId, userIds?, mentionLabels?, channelId? }
 */
router.post('/ai-task-context', async (req, res) => {
  try {
    const { organizationId, userIds, mentionLabels, channelId } = req.body || {};
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }
    const data = await buildAiTaskExtractContext({
      organizationId,
      userIds,
      mentionLabels,
      channelId,
    });
    if (!data) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
});

/**
 * POST body: { organizationId, userId }
 * Đồng bộ Membership + members[] sau gán/gỡ role hierarchy.
 */
router.post('/sync-membership-placement', async (req, res) => {
  try {
    const { organizationId, userId } = req.body || {};
    if (!organizationId || !userId) {
      return res.status(400).json({ success: false, message: 'organizationId and userId are required' });
    }
    const result = await syncMembershipPlacementFromRoles(userId, organizationId);
    if (!result.ok) {
      return res.status(404).json({ success: false, message: result.reason || 'sync_failed' });
    }
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
});

/** Đồng bộ lại toàn bộ thành viên active trong org (sửa dữ liệu cũ). */
router.post('/sync-membership-placement-org', async (req, res) => {
  try {
    const { organizationId } = req.body || {};
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }
    const Membership = require('../models/Membership');
    const rows = await Membership.find({ organization: organizationId, status: 'active' })
      .select('user')
      .lean();
    const results = [];
    for (const row of rows) {
      const uid = row?.user ? String(row.user) : '';
      if (!uid) continue;
      const r = await syncMembershipPlacementFromRoles(uid, organizationId);
      results.push({ userId: uid, ok: r.ok, placement: r.placement || null });
    }
    return res.json({ success: true, data: { synced: results.length, results } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
});

module.exports = router;
