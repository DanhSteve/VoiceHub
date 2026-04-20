/**
 * Lõi tìm kiếm VoiceHub — kiểu trạng thái và token bộ lọc (Discord-style).
 * Prefix UI tiếng Việt map sang key nội bộ tiếng Anh cho API.
 */

/** @typedef {'from' | 'in' | 'has' | 'mentions' | 'after' | 'before'} FilterKey */

/**
 * @typedef {Object} FilterToken
 * @property {FilterKey} key
 * @property {string} [value] — id hoặc enum (file, link, image, embed)
 * @property {string} [label] — hiển thị chip
 * @property {string} [avatar] — URL avatar (optional)
 */

/**
 * @typedef {Object} SearchScopeOrgChat
 * @property {'org-chat'} type
 * @property {string} organizationId
 * @property {string} [serverId]
 * @property {string} [departmentId]
 */

/**
 * @typedef {SearchScopeOrgChat} SearchScope
 */

export const FILTER_PREFIX = {
  from: 'từ:',
  in: 'trong:',
  has: 'có:',
  mentions: 'đề cập:',
};

/** Map prefix gõ trong ô → key (không phân biệt hoa thường khi detect). */
export const PREFIX_TO_KEY = {
  'từ:': 'from',
  'trong:': 'in',
  'có:': 'has',
  'đề cập:': 'mentions',
};

export const HAS_OPTIONS = [
  { value: 'link', labelKey: 'search.hasLink' },
  { value: 'file', labelKey: 'search.hasFile' },
  { value: 'image', labelKey: 'search.hasImage' },
  { value: 'embed', labelKey: 'search.hasEmbed' },
];

/**
 * Serialize danh sách token thành chuỗi lưu lịch sử (compact JSON).
 * @param {FilterToken[]} tokens
 * @param {string} freeText
 */
export function serializeQueryState(freeText, tokens) {
  return JSON.stringify({ t: freeText || '', f: tokens || [] });
}

/**
 * @param {string} raw
 * @returns {{ t: string, f: FilterToken[] }}
 */
export function deserializeQueryState(raw) {
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object') {
      return {
        t: typeof o.t === 'string' ? o.t : '',
        f: Array.isArray(o.f) ? o.f : [],
      };
    }
  } catch {
    /* ignore */
  }
  return { t: '', f: [] };
}

/**
 * @param {string} scopeKey
 * @returns {string[]}
 */
export function loadSearchHistory(scopeKey) {
  try {
    const raw = localStorage.getItem(`vh_search_hist_${scopeKey}`);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} scopeKey
 * @param {string} entry — kết quả serializeQueryState
 * @param {number} [max=8]
 */
export function pushSearchHistory(scopeKey, entry, max = 8) {
  try {
    let list = loadSearchHistory(scopeKey).filter((x) => x !== entry);
    list.unshift(entry);
    list = list.slice(0, max);
    localStorage.setItem(`vh_search_hist_${scopeKey}`, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

export function clearSearchHistory(scopeKey) {
  try {
    localStorage.removeItem(`vh_search_hist_${scopeKey}`);
  } catch {
    /* */
  }
}
