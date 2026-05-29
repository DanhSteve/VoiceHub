import { guessNameFromUrl } from '../../components/Chat/ChatFileAttachment';
import { formatBusinessCardLine, getBusinessCardFields } from './businessCardDisplay';
import { fileDisplayNameFromMessage } from '../../utils/friendChatMedia';
import { formatCallLogPreview } from '../../utils/friendCallLog';

/**
 * Preview tin nhắn cho search (DM, org chat, dashboard) — không hiển thị JSON thô.
 * @param {object} message
 * @param {(key: string, vars?: object) => string} [t]
 * @param {{ currentUserId?: string }} [options]
 */
export function formatMessagePreview(message, t, options = {}) {
  const mt = String(message?.messageType || 'text').toLowerCase();
  const raw = message?.content;

  if (mt === 'business_card') {
    return formatBusinessCardLine(t, getBusinessCardFields(message));
  }

  if (mt === 'call_log') {
    if (t && options.currentUserId) {
      return formatCallLogPreview(raw, t, options.currentUserId);
    }
    return t ? t('friendChat.callLogPreview') : 'Cuộc gọi';
  }

  if (mt === 'image') {
    const name = message?.fileMeta?.originalName;
    if (t) {
      return name
        ? t('friendChat.forwardImagePreview', { name })
        : t('friendChat.dmScopeImages');
    }
    return name ? `Hình ảnh: ${name}` : 'Hình ảnh';
  }

  if (mt === 'file') {
    const fb = t ? t('friendChat.fileAttachment') : 'Tệp đính kèm';
    const name =
      fileDisplayNameFromMessage(message, fb) ||
      (typeof raw === 'string' && /^https?:\/\//i.test(raw) ? guessNameFromUrl(raw) : '');
    const label = name && !/^https?:\/\//i.test(name) ? name : fb;
    return t ? t('friendChat.forwardFilePreview', { name: label }) : `Tệp: ${label}`;
  }

  if (mt === 'system') {
    return String(raw || '').trim() || 'Tin nhắn hệ thống';
  }

  return String(raw || '');
}
