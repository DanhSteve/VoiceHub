/** @typedef {'channel_chat'|'channel_voice'|'voice_meeting'|'announcement'|'library'|'image'|'all'} OrgFileCategory */

export const ORG_FILE_CATEGORIES = [
  { id: 'all', icon: '📂' },
  { id: 'channel_chat', icon: '💬' },
  { id: 'channel_voice', icon: '🎙️' },
  { id: 'voice_meeting', icon: '📞' },
  { id: 'announcement', icon: '📢' },
  { id: 'library', icon: '📚' },
  { id: 'image', icon: '🖼️' },
];

export function unwrapApiPayload(payload) {
  return payload?.data !== undefined ? payload.data : payload;
}

export function decodeFileNameCandidate(raw) {
  let out = String(raw || '').trim();
  if (!out) return '';
  out = out.replace(/\+/g, ' ');
  for (let i = 0; i < 2; i++) {
    if (!/%[0-9a-f]{2}/i.test(out)) break;
    try {
      out = decodeURIComponent(out);
    } catch {
      break;
    }
  }
  return out.trim();
}

export function attachmentDisplayName(message, fallback) {
  const fm = message?.fileMeta;
  const fromMeta = decodeFileNameCandidate(fm?.originalName);
  if (fromMeta) return fromMeta;
  const signed = String(message?.signedReadUrl || message?.readUrl || '').trim();
  if (signed) {
    try {
      const u = new URL(signed);
      const last = u.pathname.split('/').filter(Boolean).pop() || '';
      const decoded = decodeFileNameCandidate(last);
      if (decoded) return decoded;
    } catch {
      /* ignore */
    }
  }
  const content = String(message?.content || '');
  if (/^https?:\/\//i.test(content)) {
    try {
      const u = new URL(content);
      const last = u.pathname.split('/').filter(Boolean).pop() || '';
      const decoded = decodeFileNameCandidate(last);
      if (decoded) return decoded;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function mimeToLabel(mimeType, messageType) {
  const mt = String(mimeType || '').toLowerCase();
  const msgT = String(messageType || '').toLowerCase();
  if (msgT === 'image' || mt.startsWith('image/')) return 'IMG';
  if (mt.includes('pdf')) return 'PDF';
  if (mt.includes('sheet') || mt.includes('excel')) return 'XLS';
  if (mt.includes('word') || mt.includes('document')) return 'DOC';
  if (mt.includes('zip') || mt.includes('archive')) return 'ZIP';
  if (mt.includes('video')) return 'VID';
  if (mt.includes('audio')) return 'AUD';
  return '📄';
}

/**
 * Gom mọi kênh từ cây structure GET /organizations/:id/structure
 */
export function flattenChannelsFromStructure(branches) {
  const list = [];
  const pushChannels = (channels) => {
    for (const ch of channels || []) {
      const id = String(ch?._id || ch?.id || '').trim();
      if (!id) continue;
      list.push({
        _id: id,
        id,
        name: String(ch?.name || ch?.title || id),
        type: String(ch?.type || 'chat').toLowerCase(),
      });
    }
  };

  for (const branch of branches || []) {
    for (const division of branch?.divisions || []) {
      pushChannels(division?.channels);
      for (const department of division?.departments || []) {
        pushChannels(department?.channels);
        for (const team of department?.teams || []) {
          pushChannels(team?.channels);
        }
      }
    }
  }

  const byId = new Map();
  for (const ch of list) {
    if (!byId.has(ch._id)) byId.set(ch._id, ch);
  }
  return Array.from(byId.values());
}

/**
 * @param {object} message — tin nhắn có fileMeta
 * @param {Map<string, { type: string, name: string }>} channelByRoomId
 */
export function resolveMessageFileCategory(message, channelByRoomId) {
  const mt = String(message?.messageType || '').toLowerCase();
  if (mt === 'image') return 'image';

  const ctx = String(message?.fileMeta?.retentionContext || 'org_room').toLowerCase();
  if (ctx === 'meeting') return 'voice_meeting';

  const roomId = String(message?.roomId || message?.channelId || '').trim();
  const chType = String(channelByRoomId.get(roomId)?.type || 'chat').toLowerCase();
  if (chType === 'voice') return 'channel_voice';
  if (chType === 'announcement') return 'announcement';
  return 'channel_chat';
}

export function mapMessageToOrgFile(message, channelByRoomId, t, locale) {
  const roomId = String(message?.roomId || message?.channelId || '').trim();
  const ch = channelByRoomId.get(roomId);
  const category = resolveMessageFileCategory(message, channelByRoomId);
  const url =
    String(message?.signedReadUrl || message?.readUrl || '').trim() ||
    (/^https?:\/\//i.test(String(message?.content || '')) ? String(message.content).trim() : '');

  return {
    id: String(message._id || message.id || `${roomId}-${message.createdAt}`),
    source: 'message',
    name: attachmentDisplayName(message, t('documents.orgUntitledFile')),
    size: formatFileSize(message?.fileMeta?.byteSize),
    sizeBytes: Number(message?.fileMeta?.byteSize) || 0,
    typeLabel: mimeToLabel(message?.fileMeta?.mimeType, message?.messageType),
    category,
    categoryLabel: '',
    channelName: ch?.name || t('documents.orgUnknownChannel'),
    roomId,
    url,
    messageType: String(message?.messageType || 'file'),
    modified: message?.createdAt
      ? new Date(message.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '',
    owner: t('documents.orgMemberFallback'),
    raw: message,
  };
}

export function mapLibraryDocumentToOrgFile(doc, t, locale) {
  const id = String(doc._id || doc.id || '');
  return {
    id: `lib-${id}`,
    source: 'library',
    name: String(doc.name || doc.title || t('documents.orgUntitledFile')),
    size: formatFileSize(doc.fileSize),
    sizeBytes: Number(doc.fileSize) || 0,
    typeLabel: mimeToLabel(doc.mimeType, 'file'),
    category: 'library',
    categoryLabel: '',
    channelName: t('documents.orgCategoryLibrary'),
    roomId: '',
    url: String(doc.fileUrl || doc.url || '').trim(),
    messageType: 'file',
    modified: doc.updatedAt || doc.createdAt
      ? new Date(doc.updatedAt || doc.createdAt).toLocaleString(
          locale === 'en' ? 'en-US' : 'vi-VN',
          { day: '2-digit', month: '2-digit', year: 'numeric' }
        )
      : '',
    owner:
      doc.uploadedBy?.displayName ||
      doc.uploadedBy?.username ||
      t('documents.orgMemberFallback'),
    raw: doc,
  };
}
