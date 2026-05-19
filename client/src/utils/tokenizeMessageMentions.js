/**
 * Tách nội dung tin thành đoạn text / @mention.
 * Hỗ trợ tên có dấu cách (vd. @Long Nhat) khi có danh sách label đã biết.
 */
function tokenizeWithKnownLabels(text, labels) {
  const s = String(text ?? '');
  const parts = [];
  let i = 0;

  while (i < s.length) {
    const at = s.indexOf('@', i);
    if (at === -1) {
      parts.push({ type: 'text', value: s.slice(i) });
      break;
    }
    if (at > i) parts.push({ type: 'text', value: s.slice(i, at) });

    let matched = false;
    for (const label of labels) {
      const mention = `@${label}`;
      if (!s.slice(at).startsWith(mention)) continue;
      const end = at + mention.length;
      if (end < s.length && !/[\s,.;!?]/.test(s[end])) continue;
      parts.push({ type: 'mention', value: mention });
      i = end;
      matched = true;
      break;
    }

    if (!matched) {
      const rest = s.slice(at);
      const m = rest.match(/^@([^\s@](?:\s+[^\s@,@]+)*)(?=\s*[,;!?]|\s{2,}|$)/);
      if (m) {
        parts.push({ type: 'mention', value: m[0] });
        i = at + m[0].length;
      } else {
        const m2 = rest.match(/^@[^\s@]+/);
        if (m2) {
          parts.push({ type: 'mention', value: m2[0] });
          i = at + m2[0].length;
        } else {
          parts.push({ type: 'text', value: '@' });
          i = at + 1;
        }
      }
    }
  }

  return parts.length ? parts : [{ type: 'text', value: s }];
}

function tokenizeWithRegex(text) {
  const s = String(text ?? '');
  const parts = [];
  const re = /(?:^|(\s))(@[^\s@](?:\s+[^\s@,@]+)*)(?=\s*[,;!?]|\s{2,}|$)/g;
  let lastIndex = 0;
  let m;

  while ((m = re.exec(s)) !== null) {
    const matchStart = m.index + (m[1] ? m[1].length : 0);
    if (matchStart > lastIndex) {
      parts.push({ type: 'text', value: s.slice(lastIndex, matchStart) });
    }
    parts.push({ type: 'mention', value: m[2] });
    lastIndex = matchStart + m[2].length;
  }

  if (lastIndex < s.length) {
    parts.push({ type: 'text', value: s.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: 'text', value: s }];
}

export function tokenizeMessageMentions(text, knownLabels = []) {
  const labels = [...new Set((knownLabels || []).map((l) => String(l || '').trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );

  if (labels.length) {
    return tokenizeWithKnownLabels(text, labels);
  }
  return tokenizeWithRegex(text);
}

export function collectMentionLabelsFromContacts(contacts = []) {
  const set = new Set();
  for (const c of contacts) {
    const name = c?.name || c?.displayName || c?.label;
    if (name) set.add(String(name).trim());
    if (c?.username) set.add(String(c.username).trim());
  }
  return [...set];
}
