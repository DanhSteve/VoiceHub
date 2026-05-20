const axios = require('axios');
const Organization = require('../models/Organization');
const JoinApplication = require('../models/JoinApplication');
const Membership = require('../models/Membership');
const { emitRealtimeEvent } = require('/shared');

const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3003';
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

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

const MAX_FIELDS = 20;
const MAX_SHORT = 500;
const MAX_LONG = 5000;
const FIELD_ID_RE = /^[a-z0-9_]{1,64}$/i;

const CHOICE_TYPES = ['single_choice', 'radio', 'checkbox'];

const getUserId = (req) => req.user?.id || req.user?.userId || req.user?._id;
const getApplicantSnapshot = (req) => ({
  userId: String(req.user?.id || req.user?.userId || req.user?._id || ''),
  username: String(req.user?.username || '').trim(),
  fullName: String(req.user?.fullName || req.user?.displayName || req.user?.name || '').trim(),
  email: String(req.user?.email || '').trim(),
  avatar: String(req.user?.avatar || '').trim(),
});

function normalizeJoinFormFromBody(body) {
  const enabled = Boolean(body?.enabled);
  // Luôn mặc định member khi duyệt đơn gia nhập thành công.
  const defaultRoleOnApprove = 'member';
  const rawFields = Array.isArray(body?.fields) ? body.fields : [];
  const fields = rawFields.slice(0, MAX_FIELDS).map((f, idx) => {
    const id = String(f?.id || `field_${idx + 1}`).trim();
    const label = String(f?.label || '').trim().slice(0, 300);
    const type = ['short_text', 'long_text', 'single_choice', 'radio', 'checkbox'].includes(f?.type)
      ? f.type
      : 'short_text';
    const required = Boolean(f?.required);
    let options = Array.isArray(f?.options) ? f.options.map((o) => String(o).slice(0, 200)) : [];
    if (CHOICE_TYPES.includes(type)) {
      options = options.filter(Boolean).slice(0, 50);
    } else {
      options = [];
    }
    return { id, label, type, required, options };
  });
  return { enabled, defaultRoleOnApprove, fields };
}

function validateAnswersAgainstForm(formFields, answers) {
  const errors = [];
  if (!answers || typeof answers !== 'object') {
    return ['answers phải là object'];
  }
  const ans = { ...answers };
  for (const field of formFields) {
    const v = ans[field.id];
    const t = field.type;

    if (t === 'checkbox') {
      let arr = [];
      if (Array.isArray(v)) {
        arr = v.map((x) => String(x).trim()).filter(Boolean);
      } else if (v != null && v !== '') {
        arr = [String(v).trim()].filter(Boolean);
      }
      if (field.required && arr.length === 0) {
        errors.push(`Thiếu trường bắt buộc: ${field.label || field.id}`);
        continue;
      }
      for (const item of arr) {
        if (!field.options || !field.options.includes(item)) {
          errors.push(`${field.label}: giá trị không hợp lệ`);
        }
      }
      continue;
    }

    if (field.required && (v === undefined || v === null || String(v).trim() === '')) {
      errors.push(`Thiếu trường bắt buộc: ${field.label || field.id}`);
      continue;
    }
    if (v === undefined || v === null || String(v).trim() === '') continue;
    const s = String(v).trim();
    if (field.type === 'short_text' && s.length > MAX_SHORT) {
      errors.push(`${field.label}: tối đa ${MAX_SHORT} ký tự`);
    }
    if (field.type === 'long_text' && s.length > MAX_LONG) {
      errors.push(`${field.label}: tối đa ${MAX_LONG} ký tự`);
    }
    if (t === 'single_choice' || t === 'radio') {
      if (!field.options || !field.options.includes(s)) {
        errors.push(`${field.label}: giá trị không hợp lệ`);
      }
    }
  }
  return errors;
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
    console.warn('[joinApplication] notify moderators failed:', e.message);
  }
}

async function notifyApplicant({ userId, title, content, data, actionUrl }) {
  try {
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications`,
      {
        userId,
        type: 'org_join_application',
        title,
        content,
        data: data || {},
        actionUrl: actionUrl || null,
      },
      notificationServiceAxiosOpts()
    );
  } catch (e) {
    console.warn('[joinApplication] notify applicant failed:', e.message);
  }
}

exports.getJoinApplicationForm = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const org = await Organization.findById(orgId).lean();
    if (!org) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }
    const jf = org.settings?.joinApplicationForm || {};
    res.json({
      status: 'success',
      data: {
        enabled: Boolean(jf.enabled),
        formVersion: jf.formVersion || 1,
        defaultRoleOnApprove: 'member',
        fields: Array.isArray(jf.fields) ? jf.fields : [],
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateJoinApplicationForm = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }

    const normalized = normalizeJoinFormFromBody(req.body || {});
    for (const f of normalized.fields) {
      if (!FIELD_ID_RE.test(f.id)) {
        return res.status(400).json({
          status: 'fail',
          message: `field id không hợp lệ: ${f.id} (chỉ chữ, số, gạch dưới, tối đa 64 ký tự)`,
        });
      }
      if (!f.label) {
        return res.status(400).json({ status: 'fail', message: 'Mỗi trường cần có label' });
      }
      if (CHOICE_TYPES.includes(f.type) && (!f.options || f.options.length < 2)) {
        return res.status(400).json({
          status: 'fail',
          message: `Trường "${f.label}" cần ít nhất 2 lựa chọn`,
        });
      }
    }

    const prev = org.settings?.joinApplicationForm || {};
    const prevVersion = prev.formVersion || 1;
    const fieldsChanged =
      JSON.stringify(prev.fields || []) !== JSON.stringify(normalized.fields) ||
      Boolean(prev.enabled) !== Boolean(normalized.enabled);

    org.settings = org.settings || {};
    org.settings.joinApplicationForm = {
      ...prev,
      ...normalized,
      formVersion: fieldsChanged ? prevVersion + 1 : prevVersion,
    };
    org.markModified('settings');

    await org.save();

    await emitRealtimeEvent({
      event: 'organization:updated',
      userId: String(getUserId(req) || ''),
      payload: {
        organizationId: String(orgId),
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      status: 'success',
      data: {
        enabled: Boolean(org.settings.joinApplicationForm.enabled),
        formVersion: org.settings.joinApplicationForm.formVersion,
        defaultRoleOnApprove: org.settings.joinApplicationForm.defaultRoleOnApprove,
        fields: org.settings.joinApplicationForm.fields || [],
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getJoinApplicationFormPublic = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const org = await Organization.findById(orgId).lean();
    if (!org || !org.isActive) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }
    const jf = org.settings?.joinApplicationForm || {};
    if (!jf.enabled) {
      return res.status(404).json({
        status: 'fail',
        message: 'Join application form is not enabled for this organization',
      });
    }
    res.json({
      status: 'success',
      data: {
        organizationId: String(org._id),
        organizationName: org.name,
        formVersion: jf.formVersion || 1,
        fields: Array.isArray(jf.fields) ? jf.fields : [],
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.submitJoinApplication = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const userId = getUserId(req);
    const frontendUrl = resolveFrontendUrl(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    const org = await Organization.findById(orgId);
    if (!org || !org.isActive) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }

    const jf = org.settings?.joinApplicationForm || {};
    if (!jf.enabled) {
      return res.status(400).json({
        status: 'fail',
        message: 'Form gia nhập chưa được bật',
      });
    }

    const formFields = Array.isArray(jf.fields) ? jf.fields : [];

    const existingMember = await Membership.findOne({
      user: userId,
      organization: orgId,
      status: 'active',
    });
    if (existingMember) {
      return res.status(409).json({
        status: 'fail',
        message: 'Bạn đã là thành viên tổ chức này',
      });
    }

    const pending = await JoinApplication.findOne({
      organization: orgId,
      applicantUser: userId,
      status: 'pending',
    });
    if (pending) {
      return res.status(409).json({
        status: 'fail',
        message: 'Bạn đã có đơn gia nhập đang chờ duyệt',
      });
    }

    const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    if (formFields.length > 0) {
      const errs = validateAnswersAgainstForm(formFields, answers);
      if (errs.length) {
        return res.status(400).json({ status: 'fail', message: errs.join('; ') });
      }
    }

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

    const doc = await JoinApplication.create({
      organization: orgId,
      applicantUser: userId,
      applicantSnapshot: getApplicantSnapshot(req),
      status: 'pending',
      formVersion,
      formSnapshot,
      answers,
      submittedAt: new Date(),
    });

    await Membership.deleteMany({
      organization: orgId,
      user: userId,
      status: 'pending',
    });

    await notifyModeratorsNewApplication({
      orgId,
      orgName: org.name,
      applicationId: doc._id,
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
        applicationId: String(doc._id),
        timestamp: new Date().toISOString(),
      },
    });

    res.status(201).json({
      status: 'success',
      data: {
        _id: doc._id,
        status: doc.status,
        submittedAt: doc.submittedAt,
      },
      message: 'Đã gửi đơn gia nhập',
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        status: 'fail',
        message: 'Bạn đã có đơn gia nhập đang chờ duyệt',
      });
    }
    next(error);
  }
};

/** Đơn gia nhập đang chờ của user hiện tại (sidebar). */
exports.listMyPendingJoinApplications = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    const apps = await JoinApplication.find({
      applicantUser: userId,
      status: 'pending',
    })
      .sort({ submittedAt: -1 })
      .lean();

    const orgIds = [...new Set(apps.map((a) => String(a.organization)))];
    const orgDocs =
      orgIds.length > 0
        ? await Organization.find({ _id: { $in: orgIds } })
            .select('name logo')
            .lean()
        : [];
    const orgMap = Object.fromEntries(orgDocs.map((o) => [String(o._id), o]));

    const data = apps.map((a) => {
      const oid = String(a.organization);
      const o = orgMap[oid] || {};
      return {
        applicationId: String(a._id),
        organizationId: oid,
        organizationName: o.name || 'Tổ chức',
        logo: o.logo || null,
        submittedAt: a.submittedAt,
        status: a.status,
      };
    });

    res.json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

/** Đơn pending mà user có quyền duyệt (owner/admin) — gom lên Trang chủ tổ chức. */
exports.listJoinApplicationsToReview = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    const adminMemberships = await Membership.find({
      user: userId,
      status: 'active',
      role: { $in: ['owner', 'admin'] },
    })
      .select('organization')
      .lean();

    const orgIds = [...new Set(adminMemberships.map((m) => String(m.organization)))];
    if (orgIds.length === 0) {
      return res.json({ status: 'success', data: [] });
    }

    const apps = await JoinApplication.find({
      organization: { $in: orgIds },
      status: 'pending',
    })
      .sort({ submittedAt: -1 })
      .limit(500)
      .lean();

    const orgDocs = await Organization.find({ _id: { $in: orgIds } })
      .select('name logo')
      .lean();
    const orgMap = Object.fromEntries(orgDocs.map((o) => [String(o._id), o]));

    const data = apps.map((a) => {
      const oid = String(a.organization);
      const o = orgMap[oid] || {};
      return {
        applicationId: String(a._id),
        organizationId: oid,
        organizationName: o.name || 'Tổ chức',
        logo: o.logo || null,
        applicantUser: String(a.applicantUser),
        applicantSnapshot: a.applicantSnapshot || {},
        answers: a.answers || {},
        formSnapshot: a.formSnapshot ?? null,
        submittedAt: a.submittedAt,
        status: a.status,
      };
    });

    res.json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

exports.listJoinApplications = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const status = req.query?.status || 'pending';
    if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid status filter' });
    }

    const q = { organization: orgId };
    if (status !== 'all') q.status = status;

    const rows = await JoinApplication.find(q)
      .sort({ submittedAt: -1 })
      .limit(200)
      .lean();

    res.json({
      status: 'success',
      data: rows.map((r) => ({
        ...r,
        applicantUser: String(r.applicantUser),
        applicantSnapshot: r.applicantSnapshot || {},
        organization: String(r.organization),
        reviewedBy: r.reviewedBy ? String(r.reviewedBy) : null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

exports.reviewJoinApplication = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const applicationId = req.params.applicationId;
    const action = req.body?.action;
    const rejectionReason = String(req.body?.rejectionReason || '').slice(0, 2000);
    const reviewerId = getUserId(req);
    const frontendUrl = resolveFrontendUrl(req);

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ status: 'fail', message: 'action phải là approve hoặc reject' });
    }

    const org = await Organization.findById(orgId).lean();
    if (!org) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }

    const appDoc = await JoinApplication.findOne({
      _id: applicationId,
      organization: orgId,
      status: 'pending',
    });
    if (!appDoc) {
      return res.status(404).json({ status: 'fail', message: 'Không tìm thấy đơn chờ duyệt' });
    }

    const applicantId = String(appDoc.applicantUser);

    if (action === 'approve') {
      const role = 'member';

      await Membership.findOneAndUpdate(
        { user: applicantId, organization: orgId },
        {
          user: applicantId,
          organization: orgId,
          role,
          status: 'active',
          joinedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      appDoc.status = 'approved';
      appDoc.reviewedAt = new Date();
      appDoc.reviewedBy = reviewerId;
      appDoc.rejectionReason = '';
      await appDoc.save();

      await notifyApplicant({
        userId: applicantId,
        title: 'Đơn gia nhập được duyệt',
        content: `Bạn đã được chấp nhận vào "${org.name}".`,
        data: { organizationId: String(orgId), applicationId: String(appDoc._id), decision: 'approved' },
        actionUrl: `${frontendUrl}/organizations?orgId=${encodeURIComponent(String(orgId))}`,
      });

      await emitRealtimeEvent({
        event: 'organization:join_application_approved',
        userId: applicantId,
        payload: {
          organizationId: String(orgId),
          applicationId: String(appDoc._id),
          timestamp: new Date().toISOString(),
        },
      });

      return res.json({
        status: 'success',
        data: { application: appDoc.toObject(), membershipUpdated: true },
        message: 'Đã duyệt đơn',
      });
    }

    appDoc.status = 'rejected';
    appDoc.reviewedAt = new Date();
    appDoc.reviewedBy = reviewerId;
    appDoc.rejectionReason = rejectionReason;
    await appDoc.save();

    await notifyApplicant({
      userId: applicantId,
      title: 'Đơn gia nhập bị từ chối',
      content: rejectionReason
        ? `Lý do: ${rejectionReason}`
        : `Đơn gia nhập vào "${org.name}" đã bị từ chối.`,
      data: { organizationId: String(orgId), applicationId: String(appDoc._id), decision: 'rejected' },
      actionUrl: null,
    });

    await emitRealtimeEvent({
      event: 'organization:join_application_rejected',
      userId: applicantId,
      payload: {
        organizationId: String(orgId),
        applicationId: String(appDoc._id),
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      status: 'success',
      data: { application: appDoc.toObject() },
      message: 'Đã từ chối đơn',
    });
  } catch (error) {
    next(error);
  }
};
