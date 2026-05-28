/**
 * Điều kiện tin nhắn có thể đưa vào pipeline AI tạo task (khớp backend/worker).
 */

export const AI_TASK_TOOLTIP_SHORT =
  'Chỉ áp dụng cho tin có nội dung rõ thời gian (cả ngày và giờ), có thể kèm ảnh/tệp đính kèm. Không dùng tin hệ thống, tin đã xóa/thu hồi. Cần tổ chức để gán task.';

function hasExplicitDateTime(text) {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw) return false;
  const dateRe =
    /\b\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\b|ngày\s+\d{1,2}(?:[\/\-.]\d{1,2})?|hôm nay|ngày mai|ngày mốt|tuần sau|thứ\s*(2|3|4|5|6|7|bảy)|chủ nhật/i;
  const timeRe = /\b([01]?\d|2[0-3])[:h][0-5]\d\b|\b([01]?\d|2[0-3])h\b|\b(1[0-2]|0?[1-9])\s?(am|pm)\b/i;
  return dateRe.test(raw) && timeRe.test(raw);
}

/**
 * @param {object|null} message
 * @param {{ organizationId?: string|null }} ctx
 * @returns {{ ok: boolean, reason: string }}
 */
export function getAiTaskEligibility(message, ctx = {}) {
  const { organizationId } = ctx;

  if (!message) {
    return { ok: false, reason: 'Không có tin nhắn.' };
  }
  const mid = message._id || message.id;
  if (!mid) {
    return { ok: false, reason: 'Tin nhắn không hợp lệ.' };
  }
  if (message.isDeleted || message.isRecalled) {
    return { ok: false, reason: 'Không tạo task từ tin đã xóa hoặc đã thu hồi.' };
  }

  const mt = message.messageType || 'text';
  if (mt === 'system') {
    return { ok: false, reason: 'Không tạo task từ tin hệ thống.' };
  }

  if (!organizationId) {
    return {
      ok: false,
      reason: 'Cần tổ chức để gán task. Tham gia tổ chức hoặc mở chat kênh tổ chức.',
    };
  }

  if (mt === 'text') {
    const t = String(message.content ?? '').trim();
    if (!t) {
      return { ok: false, reason: 'Tin văn bản trống — không có nội dung để phân tích.' };
    }
    if (!hasExplicitDateTime(t)) {
      return {
        ok: false,
        reason: 'Cần nêu rõ ngày và giờ (ví dụ: 30/05 lúc 15:30) thì mới tạo task tự động.',
      };
    }
  }

  if (mt === 'image' || mt === 'file') {
    const hasFile = Boolean(message.fileMeta?.storagePath);
    const caption = String(message.content ?? '').trim();
    const hasCaption = caption.length > 0;
    if (!hasFile && !hasCaption) {
      return { ok: false, reason: 'Cần file đính kèm hoặc chú thích.' };
    }
    if (!hasExplicitDateTime(caption)) {
      return {
        ok: false,
        reason: 'Tin có tệp/ảnh cần có chú thích ghi rõ ngày và giờ để tạo task tự động.',
      };
    }
  }

  return { ok: true, reason: '' };
}
