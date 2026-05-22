/**
 * Map FilterToken + ô tự do → query GET /messages/search (gateway /api).
 * Backend dùng Meilisearch khi MESSAGE_SEARCH_ENGINE=meilisearch; contract pageToken giữ nguyên.
 */

import api from '../../services/api';

/**
 * @param {import('./searchTypes.js').FilterToken[]} tokens
 * @param {string} keyword — từ khóa tự do (không gồm chip)
 * @param {object} ctx — { organizationId, narrowRoomId?, page?, limit?, signal? }
 */
export function buildOrgMessageSearchParams(tokens, keyword, ctx) {
  const params = new URLSearchParams();
  params.set('organizationId', String(ctx.organizationId));
  if (ctx.narrowRoomId) params.set('roomId', String(ctx.narrowRoomId));

  const qParts = [];
  if (keyword && keyword.trim()) qParts.push(keyword.trim());

  for (const tok of tokens) {
    if (!tok || !tok.key) continue;
    switch (tok.key) {
      case 'from':
        if (tok.value) params.set('senderId', String(tok.value));
        break;
      case 'in':
        if (tok.value) params.set('roomId', String(tok.value));
        break;
      case 'has':
        if (tok.value === 'link') params.set('hasLink', 'true');
        else if (tok.value === 'file') params.set('hasAttachment', 'true');
        else if (tok.value === 'image') params.set('messageType', 'image');
        else if (tok.value === 'embed') params.set('hasEmbed', 'true');
        break;
      case 'mentions':
        if (tok.label) params.set('mentionText', String(tok.label).trim());
        break;
      case 'after':
        if (tok.value) params.set('createdAfter', String(tok.value));
        break;
      case 'before':
        if (tok.value) params.set('createdBefore', String(tok.value));
        break;
      default:
        break;
    }
  }

  if (qParts.length) params.set('q', qParts.join(' '));

  if (ctx.hasAttachment === true || ctx.hasAttachment === 'true') {
    params.set('hasAttachment', 'true');
  }
  if (ctx.hasLink === true || ctx.hasLink === 'true') {
    params.set('hasLink', 'true');
  }
  if (ctx.messageType) {
    params.set('messageType', String(ctx.messageType));
  }

  params.set('limit', String(ctx.limit || 20));
  params.set('fields', 'summary');
  if (ctx.pageToken) {
    params.set('pageToken', String(ctx.pageToken));
  } else if (ctx.page && ctx.page > 1) {
    params.set('page', String(ctx.page));
  }

  return params;
}

export async function fetchOrgMessageSearch(tokens, keyword, ctx) {
  const params = buildOrgMessageSearchParams(tokens, keyword, ctx);
  const res = await api.get(`/messages/search?${params.toString()}`, {
    signal: ctx.signal,
  });
  const body = res?.data !== undefined ? res.data : res;
  const data = body?.data !== undefined ? body.data : body;
  return data;
}

/**
 * Lỗi từ api.js interceptor: { message, status, data, code } — không có .response.
 */
export function formatOrgMessageSearchError(err) {
  const code = err?.data?.code;
  if (code === 'CHANNEL_ACCESS_VERIFY_FAILED') {
    return 'Tạm thời không kiểm tra được quyền kênh. Kiểm tra organization-service và cấu hình gateway, rồi thử lại.';
  }
  if (code === 'CHANNEL_ACCESS_ORG_ERROR') {
    return 'Organization-service lỗi khi xác minh kênh. Xem log service và thử lại.';
  }
  if (code === 'ORG_CHANNEL_ACCESS_DENIED') {
    return err?.data?.message || 'Không có quyền tìm trong tổ chức hoặc kênh này.';
  }
  if (code === 'ORG_CHANNEL_AUTH_REQUIRED') {
    return err?.data?.message || 'Phiên đăng nhập không hợp lệ. Đăng nhập lại.';
  }
  return err?.data?.message || err?.message || err?.response?.data?.message || '';
}
