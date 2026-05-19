import { collectMentionLabelsFromContacts } from './tokenizeMessageMentions';

function normalizeMentionKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function contactByLabel(contacts, label) {
  const norm = normalizeMentionKey(label);
  if (!norm) return null;
  return (
    contacts.find((c) => {
      const names = [c.name, c.displayName, c.username, c.label].filter(Boolean).map(normalizeMentionKey);
      return names.some((n) => n === norm || (n.length >= 3 && (n.includes(norm) || norm.includes(n))));
    }) || null
  );
}

/**
 * Trích @mention từ tin — hỗ trợ tên có dấu cách khi khớp danh bạ org.
 * Chỉ trả về userId đã resolve từ contacts (không gửi email/phone).
 */
export function parseMessageMentions(content, contacts = []) {
  const text = String(content || '');
  if (!text.trim() || !Array.isArray(contacts) || !contacts.length) return [];

  const labels = collectMentionLabelsFromContacts(contacts).sort((a, b) => b.length - a.length);
  const out = [];
  const seen = new Set();
  let i = 0;

  while (i < text.length) {
    const at = text.indexOf('@', i);
    if (at === -1) break;

    let matched = false;
    for (const label of labels) {
      const mention = `@${label}`;
      if (!text.slice(at).startsWith(mention)) continue;
      const end = at + mention.length;
      if (end < text.length && !/[\s,.;!?]/.test(text[end])) continue;

      const contact = contactByLabel(contacts, label);
      const userId = contact?.id || contact?._id;
      if (userId && !seen.has(String(userId))) {
        seen.add(String(userId));
        out.push({
          userId: String(userId),
          username: contact.username || '',
          displayName: contact.name || contact.displayName || label,
          mentionLabel: label,
        });
      }
      i = end;
      matched = true;
      break;
    }

    if (!matched) {
      const rest = text.slice(at);
      const m = rest.match(/^@([^\s@](?:\s+[^\s@,@]+)*)(?=\s*[,;!?]|\s{2,}|$)/);
      if (m) {
        const label = m[1].trim();
        const contact = contactByLabel(contacts, label);
        const userId = contact?.id || contact?._id;
        if (userId && !seen.has(String(userId))) {
          seen.add(String(userId));
          out.push({
            userId: String(userId),
            username: contact.username || '',
            displayName: contact.name || contact.displayName || label,
            mentionLabel: label,
          });
        }
        i = at + m[0].length;
      } else {
        i = at + 1;
      }
    }
  }

  return out;
}

/** Payload gửi API — chỉ field cần thiết, không PII */
export function sanitizeMentionsForApi(mentions = []) {
  return (Array.isArray(mentions) ? mentions : [])
    .filter((m) => m && (m.userId || m.id))
    .map((m) => ({
      userId: String(m.userId || m.id),
      username: String(m.username || '').slice(0, 64),
      displayName: String(m.displayName || m.name || '').slice(0, 120),
    }));
}
