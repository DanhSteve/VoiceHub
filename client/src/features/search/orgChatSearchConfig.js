/**
 * Map FilterToken + ô tự do → query GET /messages/search
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

  params.set('page', String(ctx.page || 1));
  params.set('limit', String(ctx.limit || 20));

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
