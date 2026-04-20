/**
 * Điều kiện tin nhắn có thể đưa vào pipeline AI tạo task (khớp backend/worker).
 */

export const AI_TASK_TOOLTIP_SHORT =
  'Chỉ áp dụng cho tin văn bản có nội dung, ảnh hoặc tệp đính kèm. Không dùng tin hệ thống, tin đã xóa/thu hồi. Cần tổ chức để gán task.';

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
  }

  if (mt === 'image' || mt === 'file') {
    const hasFile = Boolean(message.fileMeta?.storagePath);
    const hasCaption = String(message.content ?? '').trim().length > 0;
    if (!hasFile && !hasCaption) {
      return { ok: false, reason: 'Cần file đính kèm hoặc chú thích.' };
    }
  }

  return { ok: true, reason: '' };
}
