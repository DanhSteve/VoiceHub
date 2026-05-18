const Membership = require('../models/Membership');
const Organization = require('../models/Organization');
const JoinApplication = require('../models/JoinApplication');
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { emitRealtimeEvent } = require('/shared');
const { ensureDefaultOrgRoles, syncUserOrgRole, stripUserOrgRoles } = require('../services/rolePermissionOrgSync');
// Không log JWT/link mời đầy đủ — production nên dùng HTTPS cho FRONTEND_URL.
const ALLOWED_ROLES = ['owner', 'admin', 'hr', 'member'];
const INVITE_LINK_SECRET = String(process.env.INVITE_LINK_SECRET || process.env.JWT_SECRET || '').trim();
const INVITE_LINK_EXPIRES_IN = process.env.INVITE_LINK_EXPIRES_IN || '7d';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3003';
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function resolveFrontendUrl(req) {
  // Ưu tiên origin của request để không bị dính localhost khi client mở từ IP LAN.
  const origin = req?.headers?.origin;
  if (origin && String(origin).trim()) return String(origin).trim().replace(/\/+$/, '');

  const referer = req?.headers?.referer;
  if (referer && String(referer).trim()) {
    try {
      return new URL(String(referer)).origin;
    } catch {
      /* ignore */
    }
  }

  return FRONTEND_URL;
}

function notificationServiceAxiosOpts() {
  const opts = { timeout: 8000 };
  if (NOTIFICATION_INTERNAL_TOKEN) {
    opts.headers = { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN };
  }
  return opts;
}

function getApplicantSnapshotFromReq(req) {
  const raw = req.user || {};
  return {
    userId: String(raw.id || raw.userId || raw._id || ''),
    username: String(raw.username || '').trim(),
    fullName: String(raw.fullName || raw.displayName || raw.name || '').trim(),
    email: String(raw.email || '').trim(),
    avatar: String(raw.avatar || '').trim(),
  };
}

function canAdminManageTarget(targetRole) {
  const normalizedTarget = Membership.normalizeRole(targetRole);
  return normalizedTarget !== 'owner' && normalizedTarget !== 'admin';
}

async function getActiveOrgUserIds(orgId) {
  if (!orgId) return [];
  const userIds = await Membership.distinct('user', {
    organization: orgId,
    status: 'active',
  });
  return [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
}

async function notifyModeratorsNewApplication({ orgId, orgName, applicationId, frontendUrl }) {
  const admins = await Membership.find({
    organization: orgId,
    status: 'active',
    role: { $in: ['owner', 'admin'] },
  })
    .select('user')
    .lean();
  const userIds = [...new Set(admins.map((a) => String(a.user)))];
  if (!userIds.length) return;
  try {
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`,
      {
        userIds,
        type: 'org_join_application',
        title: 'Đơn gia nhập mới',
        content: `${orgName}: có đơn gia nhập chờ duyệt.`,
        data: {
          organizationId: String(orgId),
          applicationId: String(applicationId),
        },
        actionUrl: `${frontendUrl}/organizations/${encodeURIComponent(
          String(orgId)
        )}/settings?tab=join`,
      },
      notificationServiceAxiosOpts()
    );
  } catch (e) {
    console.warn('[memberController] notify moderators failed:', e.message);
  }
}

async function createPendingJoinApplication({
  org,
  userId,
  answers = {},
  req,
}) {
  const frontendUrl = resolveFrontendUrl(req);
  const orgId = String(org._id);
  const jf = org.settings?.joinApplicationForm || {};
  const formFields = Array.isArray(jf.fields) ? jf.fields : [];
  const formVersion = jf.formVersion || 1;
  const formSnapshot = {
    formVersion,
    fields: formFields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options || [],
    })),
  };

  const existingPending = await JoinApplication.findOne({
    organization: orgId,
    applicantUser: userId,
    status: 'pending',
  });
  if (existingPending) {
    return { application: existingPending, alreadyPending: true };
  }

  const application = await JoinApplication.create({
    organization: orgId,
    applicantUser: userId,
    applicantSnapshot: getApplicantSnapshotFromReq(req),
    status: 'pending',
    formVersion,
    formSnapshot,
    answers,
    submittedAt: new Date(),
  });

  await notifyModeratorsNewApplication({
    orgId,
    orgName: org.name,
    applicationId: application._id,
    frontendUrl,
  });

  const modUserIds = await Membership.distinct('user', {
    organization: orgId,
    status: 'active',
    role: { $in: ['owner', 'admin'] },
  });
  await emitRealtimeEvent({
    event: 'organization:join_application_created',
    userIds: modUserIds.map(String),
    payload: {
      organizationId: String(orgId),
      applicationId: String(application._id),
      timestamp: new Date().toISOString(),
    },
  });

  return { application, alreadyPending: false };
}

exports.getMembers = async (req, res, next) => {
  try {
    const members = await Membership.find({ organization: req.params.orgId })
      // organization-service không đăng ký model User; trả userId thô để client tự enrich profile.
      .select('user organization role department branch division team joinedAt status invitedBy createdAt updatedAt')
      .lean();

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

    const inviterMembership = await Membership.findOne({
      user: inviterId,
      organization: req.params.orgId,
      status: 'active',
    })
      .select('role')
      .lean();
    const inviterRole = Membership.normalizeRole(inviterMembership?.role);
    let normalizedRole = Membership.normalizeRole(role || 'member');
    // HR chỉ được mời theo vai trò member để tránh nâng quyền.
    if (inviterRole === 'hr') {
      normalizedRole = 'member';
    }
    // Admin không được mời owner/admin để tránh leo thang đặc quyền.
    if (inviterRole === 'admin' && ['owner', 'admin'].includes(normalizedRole)) {
      normalizedRole = 'member';
    }
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
      const org = await Organization.findById(invitation.organization).lean();
      if (!org || !org.isActive) {
        return res.status(404).json({ status: 'fail', message: 'Organization not found' });
      }
      const joinForm = org.settings?.joinApplicationForm || {};
      const joinFields = Array.isArray(joinForm.fields) ? joinForm.fields : [];
      const requiresReview = Boolean(joinForm.enabled);
      const requiresAnswers = requiresReview && joinFields.length > 0;

      if (requiresReview) {
        if (requiresAnswers) {
          return res.json({
            status: 'success',
            data: {
              requiresJoinApplication: true,
              requiresAnswers: true,
              organizationId: String(org._id),
              organizationName: org.name,
            },
            message: 'Vui lòng điền form gia nhập để gửi xét duyệt',
          });
        }

        const { application } = await createPendingJoinApplication({
          org,
          userId,
          answers: {},
          req,
        });
        await Membership.deleteOne({ _id: invitation._id });

        return res.json({
          status: 'success',
          data: {
            requiresJoinApplication: true,
            requiresAnswers: false,
            applicationId: String(application._id),
            organizationId: String(org._id),
            organizationName: org.name,
          },
          message: 'Đã gửi đơn, vui lòng chờ quản trị viên xét duyệt',
        });
      }

      // Chuẩn hoá role mặc định khi tham gia thành công: luôn là member.
      invitation.role = 'member';
      invitation.status = 'active';
      invitation.joinedAt = new Date();
      await invitation.save();

      await ensureDefaultOrgRoles(invitation.organization);
      await syncUserOrgRole(
        userId,
        invitation.organization,
        'member'
      );

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
    if (!INVITE_LINK_SECRET) {
      return res.status(500).json({ status: 'error', message: 'INVITE_LINK_SECRET is not configured' });
    }

    const orgId = req.params.orgId;
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const branchIdRaw = req.body?.branchId || null;
    const divisionIdRaw = req.body?.divisionId || null;
    if (!orgId || !userId) {
      return res.status(400).json({ status: 'fail', message: 'Invalid request' });
    }

    let branchContext = null;
    let divisionContext = null;
    if (branchIdRaw) {
      branchContext = await Branch.findOne({
        _id: branchIdRaw,
        organization: orgId,
        isActive: true,
      })
        .select('_id name')
        .lean();
      if (!branchContext) {
        return res.status(400).json({ status: 'fail', message: 'Chi nhánh không hợp lệ' });
      }
    }
    if (divisionIdRaw) {
      divisionContext = await Division.findOne({
        _id: divisionIdRaw,
        organization: orgId,
        isActive: true,
      })
        .select('_id name branch')
        .lean();
      if (!divisionContext) {
        return res.status(400).json({ status: 'fail', message: 'Khối không hợp lệ' });
      }
      if (branchContext && String(divisionContext.branch) !== String(branchContext._id)) {
        return res
          .status(400)
          .json({ status: 'fail', message: 'Khối không thuộc chi nhánh đã chọn' });
      }
      if (!branchContext) {
        branchContext = await Branch.findById(divisionContext.branch).select('_id name').lean();
      }
    }

    const token = jwt.sign(
      {
        type: 'organization_invite',
        orgId,
        createdBy: userId,
        inviteContext: {
          branchId: branchContext?._id ? String(branchContext._id) : null,
          branchName: branchContext?.name || '',
          divisionId: divisionContext?._id ? String(divisionContext._id) : null,
          divisionName: divisionContext?.name || '',
        },
      },
      INVITE_LINK_SECRET,
      { expiresIn: INVITE_LINK_EXPIRES_IN }
    );

    const frontendUrl = resolveFrontendUrl(req);
    const inviteUrl = `${frontendUrl}/organizations?orgId=${encodeURIComponent(orgId)}&inviteToken=${encodeURIComponent(
      token
    )}`;

    res.json({
      status: 'success',
      data: {
        token,
        inviteUrl,
        expiresIn: INVITE_LINK_EXPIRES_IN,
        context: {
          branchId: branchContext?._id ? String(branchContext._id) : null,
          branchName: branchContext?.name || '',
          divisionId: divisionContext?._id ? String(divisionContext._id) : null,
          divisionName: divisionContext?.name || '',
        },
      },
      message: 'Invite link generated',
    });
  } catch (error) {
    next(error);
  }
};

exports.joinViaLink = async (req, res, next) => {
  try {
    if (!INVITE_LINK_SECRET) {
      return res.status(500).json({ status: 'error', message: 'INVITE_LINK_SECRET is not configured' });
    }

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
      const joinFields = Array.isArray(joinForm.fields) ? joinForm.fields : [];
      if (joinFields.length > 0) {
        return res.json({
          status: 'success',
          data: {
            requiresJoinApplication: true,
            requiresAnswers: true,
            organizationId: String(org._id),
            organizationName: org.name,
          },
          message: 'Vui lòng điền form gia nhập',
        });
      }

      const { application } = await createPendingJoinApplication({
        org,
        userId,
        answers: {},
        req,
      });
      return res.json({
        status: 'success',
        data: {
          requiresJoinApplication: true,
          requiresAnswers: false,
          applicationId: String(application._id),
          organizationId: String(org._id),
          organizationName: org.name,
        },
        message: 'Đã gửi đơn, vui lòng chờ quản trị viên xét duyệt',
      });
    }

    const inviteContext = decoded?.inviteContext || {};
    const membership = await Membership.findOneAndUpdate(
      { user: userId, organization: req.params.orgId },
      {
        user: userId,
        organization: req.params.orgId,
        role: 'member',
        status: 'active',
        branch: inviteContext?.branchId || null,
        division: inviteContext?.divisionId || null,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await ensureDefaultOrgRoles(req.params.orgId);
    await syncUserOrgRole(userId, req.params.orgId, 'member');

    await emitRealtimeEvent({
      event: 'organization:member_joined',
      userIds: await getActiveOrgUserIds(req.params.orgId),
      payload: {
        organizationId: String(req.params.orgId),
        userId: String(userId),
        membershipId: String(membership._id),
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      status: 'success',
      data: {
        membership,
        inviteContext: {
          branchId: inviteContext?.branchId || null,
          branchName: inviteContext?.branchName || '',
          divisionId: inviteContext?.divisionId || null,
          divisionName: inviteContext?.divisionName || '',
        },
      },
      message: 'Joined organization via invite link',
    });
  } catch (error) {
    next(error);
  }
};

exports.updateMemberRole = async (req, res, next) => {
  try {
    const { role, department, team } = req.body;
    const requesterId = req.user?.id || req.user?.userId || req.user?._id;
    const requesterMembership = await Membership.findOne({
      user: requesterId,
      organization: req.params.orgId,
      status: 'active',
    })
      .select('role')
      .lean();
    const requesterRole = Membership.normalizeRole(requesterMembership?.role);
    if (requesterRole === 'hr') {
      return res
        .status(403)
        .json({ status: 'fail', message: 'HR không có quyền đổi vai trò thành viên' });
    }
    const normalizedRole = Membership.normalizeRole(role || 'member');
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid role' });
    }
    const targetMembership = await Membership.findOne({
      user: req.params.userId,
      organization: req.params.orgId,
      status: 'active',
    })
      .select('role')
      .lean();
    if (!targetMembership) {
      return res.status(404).json({ status: 'fail', message: 'Member not found' });
    }
    const targetRole = Membership.normalizeRole(targetMembership.role);

    // Owner giữ toàn quyền; admin chỉ được thao tác vai trò thấp hơn.
    if (requesterRole === 'admin') {
      if (!canAdminManageTarget(targetRole)) {
        return res.status(403).json({
          status: 'fail',
          message: 'Admin không được đổi vai trò owner/admin',
        });
      }
      if (['owner', 'admin'].includes(normalizedRole)) {
        return res.status(403).json({
          status: 'fail',
          message: 'Admin không được gán vai trò owner/admin',
        });
      }
    }

    const membership = await Membership.findOneAndUpdate(
      { user: req.params.userId, organization: req.params.orgId },
      { role: normalizedRole, department, team },
      { new: true }
    );

    if (membership) {
      await ensureDefaultOrgRoles(req.params.orgId);
      await syncUserOrgRole(req.params.userId, req.params.orgId, normalizedRole);
    }

    await emitRealtimeEvent({
      event: 'organization:member_role_updated',
      userIds: await getActiveOrgUserIds(req.params.orgId),
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
    const requesterId = req.user?.id || req.user?.userId || req.user?._id;
    const requesterMembership = await Membership.findOne({
      user: requesterId,
      organization: req.params.orgId,
      status: 'active',
    })
      .select('role')
      .lean();
    const requesterRole = Membership.normalizeRole(requesterMembership?.role);

    const targetMembership = await Membership.findOne({
      user: req.params.userId,
      organization: req.params.orgId,
      status: 'active',
    })
      .select('role')
      .lean();
    if (!targetMembership) {
      return res.status(404).json({ status: 'fail', message: 'Member not found' });
    }
    const targetRole = Membership.normalizeRole(targetMembership.role);

    // Chỉ owner mới có thể quản lý owner/admin. Admin chỉ được xóa role thấp hơn.
    if (requesterRole === 'admin' && !canAdminManageTarget(targetRole)) {
      return res.status(403).json({
        status: 'fail',
        message: 'Admin không được xóa owner/admin',
      });
    }

    await Membership.findOneAndDelete({
      user: req.params.userId,
      organization: req.params.orgId,
    });

    await stripUserOrgRoles(req.params.userId, req.params.orgId);

    const orgUserIds = await getActiveOrgUserIds(req.params.orgId);
    const targetUserId = String(req.params.userId || '');
    if (targetUserId && !orgUserIds.includes(targetUserId)) {
      orgUserIds.push(targetUserId);
    }

    await emitRealtimeEvent({
      event: 'organization:member_removed',
      userIds: orgUserIds,
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

    await stripUserOrgRoles(userId, orgId);

    const orgUserIds = await getActiveOrgUserIds(orgId);
    const leavingUserId = String(userId || '');
    if (leavingUserId && !orgUserIds.includes(leavingUserId)) {
      orgUserIds.push(leavingUserId);
    }

    await emitRealtimeEvent({
      event: 'organization:member_removed',
      userIds: orgUserIds,
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
