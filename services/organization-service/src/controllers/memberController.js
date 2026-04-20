const Membership = require('../models/Membership');
const Organization = require('../models/Organization');
const jwt = require('jsonwebtoken');
const { emitRealtimeEvent } = require('/shared');
// Không log JWT/link mời đầy đủ — production nên dùng HTTPS cho FRONTEND_URL.
const ALLOWED_ROLES = ['owner', 'admin', 'member'];
const INVITE_LINK_SECRET = process.env.INVITE_LINK_SECRET || process.env.JWT_SECRET || 'org-invite-secret';
const INVITE_LINK_EXPIRES_IN = process.env.INVITE_LINK_EXPIRES_IN || '7d';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

exports.getMembers = async (req, res, next) => {
  try {
    const members = await Membership.find({ organization: req.params.orgId });

    res.json({ status: 'success', data: members });
  } catch (error) {
    next(error);
  }
};

exports.inviteMember = async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    const inviterId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(400).json({ status: 'fail', message: 'userId is required' });
    }

    const normalizedRole = Membership.normalizeRole(role || 'member');
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid role' });
    }

    const existingMembership = await Membership.findOne({
      user: userId,
      organization: req.params.orgId,
    });

    if (existingMembership?.status === 'active') {
      return res.status(409).json({ status: 'fail', message: 'User already in organization' });
    }

    const membership = await Membership.findOneAndUpdate(
      { user: userId, organization: req.params.orgId },
      {
        user: userId,
        organization: req.params.orgId,
        role: normalizedRole,
        status: 'pending',
        invitedBy: inviterId || null,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await emitRealtimeEvent({
      event: 'organization:invitation_received',
      userId: String(userId),
      payload: {
        invitationId: String(membership._id),
        organizationId: String(req.params.orgId),
        role: normalizedRole,
        invitedBy: inviterId || null,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ status: 'success', data: membership, message: 'Invitation sent successfully' });
  } catch (error) {
    next(error);
  }
};

exports.getMyInvitations = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    const invitations = await Membership.find({
      user: userId,
      status: 'pending',
    })
      .populate({ path: 'organization', match: { isActive: true }, select: 'name description logo' })
      .sort({ createdAt: -1 });

    const normalized = invitations
      .filter((item) => !!item.organization)
      .map((item) => ({
        invitationId: item._id,
        organization: item.organization,
        role: item.role,
        invitedBy: item.invitedBy || null,
        createdAt: item.createdAt,
      }));

    res.json({ status: 'success', data: normalized });
  } catch (error) {
    next(error);
  }
};

exports.respondToInvitation = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    const { action } = req.body || {};
    const { invitationId } = req.params;

    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ status: 'fail', message: 'Action must be accept or reject' });
    }

    const invitation = await Membership.findOne({
      _id: invitationId,
      user: userId,
      status: 'pending',
    });

    if (!invitation) {
      return res.status(404).json({ status: 'fail', message: 'Invitation not found' });
    }

    if (action === 'accept') {
      invitation.status = 'active';
      invitation.joinedAt = new Date();
      await invitation.save();

      await emitRealtimeEvent({
        event: 'organization:invitation_accepted',
        userIds: [String(userId), String(invitation.invitedBy || '')].filter(Boolean),
        payload: {
          invitationId: String(invitation._id),
          organizationId: String(invitation.organization),
          userId: String(userId),
          timestamp: new Date().toISOString(),
        },
      });
      return res.json({ status: 'success', data: invitation, message: 'Invitation accepted' });
    }

    await Membership.deleteOne({ _id: invitationId });
    await emitRealtimeEvent({
      event: 'organization:invitation_rejected',
      userIds: [String(userId), String(invitation.invitedBy || '')].filter(Boolean),
      payload: {
        invitationId: String(invitation._id),
        organizationId: String(invitation.organization),
        userId: String(userId),
        timestamp: new Date().toISOString(),
      },
    });
    return res.json({ status: 'success', message: 'Invitation rejected' });
  } catch (error) {
    next(error);
  }
};

exports.createInviteLink = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    if (!orgId || !userId) {
      return res.status(400).json({ status: 'fail', message: 'Invalid request' });
    }

    const token = jwt.sign(
      {
        type: 'organization_invite',
        orgId,
        createdBy: userId,
      },
      INVITE_LINK_SECRET,
      { expiresIn: INVITE_LINK_EXPIRES_IN }
    );

    const inviteUrl = `${FRONTEND_URL}/organizations?orgId=${encodeURIComponent(
      orgId
    )}&inviteToken=${encodeURIComponent(token)}`;

    res.json({
      status: 'success',
      data: {
        token,
        inviteUrl,
        expiresIn: INVITE_LINK_EXPIRES_IN,
      },
      message: 'Invite link generated',
    });
  } catch (error) {
    next(error);
  }
};

exports.joinViaLink = async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ status: 'fail', message: 'Invite token is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, INVITE_LINK_SECRET);
    } catch (error) {
      return res.status(400).json({ status: 'fail', message: 'Invalid or expired invite token' });
    }

    if (decoded?.type !== 'organization_invite') {
      return res.status(400).json({ status: 'fail', message: 'Invalid invite token type' });
    }

    if (String(decoded.orgId) !== String(req.params.orgId)) {
      return res.status(400).json({ status: 'fail', message: 'Invite token organization mismatch' });
    }

    const userId = req.user?.id || req.user?._id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    const org = await Organization.findById(req.params.orgId).lean();
    if (!org || !org.isActive) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }

    const joinForm = org.settings?.joinApplicationForm;
    if (joinForm?.enabled) {
      return res.json({
        status: 'success',
        data: {
          requiresJoinApplication: true,
          organizationId: String(org._id),
          organizationName: org.name,
        },
        message: 'Vui lòng điền form gia nhập',
      });
    }

    const membership = await Membership.findOneAndUpdate(
      { user: userId, organization: req.params.orgId },
      {
        user: userId,
        organization: req.params.orgId,
        role: 'member',
        status: 'active',
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await emitRealtimeEvent({
      event: 'organization:member_joined',
      userId: String(userId),
      payload: {
        organizationId: String(req.params.orgId),
        userId: String(userId),
        membershipId: String(membership._id),
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      status: 'success',
      data: membership,
      message: 'Joined organization via invite link',
    });
  } catch (error) {
    next(error);
  }
};

exports.updateMemberRole = async (req, res, next) => {
  try {
    const { role, department, team } = req.body;
    const normalizedRole = Membership.normalizeRole(role || 'member');
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid role' });
    }

    const membership = await Membership.findOneAndUpdate(
      { user: req.params.userId, organization: req.params.orgId },
      { role: normalizedRole, department, team },
      { new: true }
    );

    await emitRealtimeEvent({
      event: 'organization:member_role_updated',
      userId: String(req.params.userId),
      payload: {
        organizationId: String(req.params.orgId),
        userId: String(req.params.userId),
        role: normalizedRole,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ status: 'success', data: membership });
  } catch (error) {
    next(error);
  }
};

exports.removeMember = async (req, res, next) => {
  try {
    await Membership.findOneAndDelete({
      user: req.params.userId,
      organization: req.params.orgId,
    });

    await emitRealtimeEvent({
      event: 'organization:member_removed',
      userId: String(req.params.userId),
      payload: {
        organizationId: String(req.params.orgId),
        userId: String(req.params.userId),
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ status: 'success', message: 'Member removed' });
  } catch (error) {
    next(error);
  }
};

/** Người dùng tự rời tổ chức (không cần quyền admin). Chủ sở hữu duy nhất không được rời — phải xóa tổ chức hoặc chuyển quyền. */
exports.leaveOrganization = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    const membership = await Membership.findOne({
      user: userId,
      organization: orgId,
      status: 'active',
    });

    if (!membership) {
      return res.status(404).json({ status: 'fail', message: 'Bạn không thuộc tổ chức này' });
    }

    const normalizedRole = Membership.normalizeRole(membership.role);
    if (normalizedRole === 'owner') {
      const ownerCount = await Membership.countDocuments({
        organization: orgId,
        status: 'active',
        role: 'owner',
      });
      if (ownerCount <= 1) {
        return res.status(400).json({
          status: 'fail',
          message:
            'Bạn là chủ sở hữu duy nhất. Hãy xóa tổ chức hoặc chuyển quyền sở hữu trước khi rời.',
        });
      }
    }

    await Membership.findOneAndDelete({ _id: membership._id });

    await emitRealtimeEvent({
      event: 'organization:member_removed',
      userId: String(userId),
      payload: {
        organizationId: String(orgId),
        userId: String(userId),
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ status: 'success', message: 'Đã rời tổ chức' });
  } catch (error) {
    next(error);
  }
};
