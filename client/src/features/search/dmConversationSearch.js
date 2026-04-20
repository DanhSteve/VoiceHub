/** Lọc tin trong cuộc trò chuyện (DM / tương tự). */

export const DM_SCOPE = {
  ALL: 'all',
  TEXT: 'text',
  FILE: 'file',
  IMAGE: 'image',
  LINK: 'link',
  CALENDAR: 'calendar',
};

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/**
 * @param {object} msg — tin nhắn chat
 * @param {string} scope — DM_SCOPE.*
 * @returns {boolean}
 */
export function messageMatchesDmScope(msg, scope) {
  if (!msg || !scope || scope === DM_SCOPE.ALL) return true;
  const mt = String(msg.messageType || 'text').toLowerCase();
  const content = String(msg.content || '');

  if (scope === DM_SCOPE.FILE) return mt === 'file';
  if (scope === DM_SCOPE.IMAGE) return mt === 'image';
  if (scope === DM_SCOPE.TEXT) return mt === 'text';

  if (scope === DM_SCOPE.LINK) {
    if (URL_RE.test(content)) return true;
    const url = msg.fileMeta?.url || msg.fileMeta?.downloadUrl;
    if (url && URL_RE.test(String(url))) return true;
    return false;
  }

  if (scope === DM_SCOPE.CALENDAR) {
    const blob = [content, msg.fileMeta?.originalName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return /(\b\d{1,2}[\/\-.]\d{1,2}(\/\d{2,4})?|\b\d{4}-\d{2}-\d{2}|lịch|calendar|meeting|họp|deadline|schedule|cuộc họp|📅|⏰|🗓)/i.test(
      blob
    );
  }

  return true;
}
