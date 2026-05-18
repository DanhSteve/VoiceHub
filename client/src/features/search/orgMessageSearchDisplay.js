import { organizationAPI } from '../../services/api/organizationAPI';
import { formatMessagePreview } from './formatMessagePreview';
import { formatBusinessCardLine, getBusinessCardFields } from './businessCardDisplay';

function unwrap(payload) {
  return payload?.data ?? payload;
}

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/** Tải map kênh + tên thành viên để hiển thị kết quả tìm org chat như người dùng đọc được. */
export async function loadOrgMessageSearchContext(orgId) {
  const channelMap = new Map();
  const senderMap = new Map();
  const oid = String(orgId || '').trim();
  if (!oid) return { channelMap, senderMap };

  const [deptsRes, membersRes] = await Promise.all([
    organizationAPI.getDepartments(oid).catch(() => null),
    organizationAPI.getMembers(oid).catch(() => null),
  ]);

  const deptsBody = deptsRes ? unwrap(deptsRes) : null;
  const deptList = Array.isArray(deptsBody)
    ? deptsBody
    : Array.isArray(deptsBody?.departments)
      ? deptsBody.departments
      : Array.isArray(deptsBody?.data)
        ? deptsBody.data
        : [];

  await Promise.all(
    deptList.map(async (dept) => {
      const deptId = dept?._id || dept?.id;
      if (!deptId) return;
      const chRes = await organizationAPI.getChannels(oid, deptId).catch(() => null);
      const chBody = chRes ? unwrap(chRes) : null;
      const channels = Array.isArray(chBody) ? chBody : Array.isArray(chBody?.channels) ? chBody.channels : [];
      for (const ch of channels) {
        const id = String(ch?._id || ch?.id || '').trim();
        const name = String(ch?.name || ch?.slug || '').trim();
        if (id && name) channelMap.set(id, name);
      }
    })
  );

  const memBody = membersRes ? unwrap(membersRes) : null;
  const memList = Array.isArray(memBody?.data) ? memBody.data : Array.isArray(memBody) ? memBody : [];
  for (const m of memList) {
    if (String(m?.status || 'active') !== 'active') continue;
    const u = m?.user && typeof m.user === 'object' ? m.user : null;
    const uid = String(u?._id || u?.id || m?.userId || m?.user || '').trim();
    if (!uid) continue;
    const label =
      u?.displayName ||
      u?.fullName ||
      u?.username ||
      (u?.email ? String(u.email).split('@')[0] : '') ||
      '';
    if (label) senderMap.set(uid, label);
  }

  return { channelMap, senderMap };
}

function roomLabel(message, channelMap) {
  const rid = String(message?.roomId?._id || message?.roomId || message?.channelId || '').trim();
  if (!rid || !OBJECT_ID_RE.test(rid)) return '';
  const name = channelMap.get(rid);
  if (!name) return '';
  return name.startsWith('#') ? name : `#${name}`;
}

function senderLabel(message, senderMap, t) {
  const sid = String(message?.senderId?._id || message?.senderId || '').trim();
  if (!sid) return '';
  return senderMap.get(sid) || t?.('orgPanel.member') || 'Thành viên';
}

function formatTime(createdAt, locale) {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fallbackTitle(message, t) {
  const mt = String(message?.messageType || 'text').toLowerCase();
  if (mt === 'image') return t('dashboard.globalSearch.msgImage');
  if (mt === 'file') return t('dashboard.globalSearch.msgFile');
  if (mt === 'business_card') return t('dashboard.globalSearch.msgContact');
  return t('dashboard.globalSearch.msgEmpty');
}

/**
 * Một dòng kết quả tìm tin tổ chức — title = nội dung, subtitle = kênh · người gửi · giờ.
 */
export function mapOrgMessageToSearchItem(message, ctx, t) {
  const { channelMap, senderMap, locale } = ctx || {};
  const mt = String(message?.messageType || 'text').toLowerCase();
  let title = formatMessagePreview(message, t).trim();

  if (mt === 'business_card') {
    title = formatBusinessCardLine(t, getBusinessCardFields(message));
  }

  if (!title) title = fallbackTitle(message, t);

  const subtitle = [roomLabel(message, channelMap), senderLabel(message, senderMap, t), formatTime(message?.createdAt, locale)]
    .filter(Boolean)
    .join(' · ');

  return {
    id: `orgmsg:${String(message?._id || message?.id || '')}`,
    title: title.slice(0, 160),
    subtitle: subtitle.slice(0, 140),
  };
}
