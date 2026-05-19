/** Parse @mention labels từ text (dùng chung worker + service). */
function normalizeLabel(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseWithKnownLabels(text, labels) {
  const s = String(text || '');
  const found = [];
  const seen = new Set();
  const sorted = [...labels].filter(Boolean).sort((a, b) => b.length - a.length);

  let i = 0;
  while (i < s.length) {
    const at = s.indexOf('@', i);
    if (at === -1) break;

    let matched = false;
    for (const label of sorted) {
      const mention = `@${label}`;
      if (!s.slice(at).startsWith(mention)) continue;
      const end = at + mention.length;
      if (end < s.length && !/[\s,.;!?]/.test(s[end])) continue;
      const key = label.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        found.push(label);
      }
      i = end;
      matched = true;
      break;
    }

    if (!matched) {
      const rest = s.slice(at);
      const m = rest.match(/^@([^\s@](?:\s+[^\s@,@]+)*)(?=\s*[,;!?]|\s{2,}|$)/);
      if (m) {
        const label = m[1].trim();
        if (label && !seen.has(label.toLowerCase())) {
          seen.add(label.toLowerCase());
          found.push(label);
        }
        i = at + m[0].length;
      } else {
        i = at + 1;
      }
    }
  }
  return found;
}

function parseMentionLabelsFromText(text, knownLabels = []) {
  const labels = [...new Set((knownLabels || []).map((l) => String(l || '').trim()).filter(Boolean))];
  if (labels.length) {
    return parseWithKnownLabels(text, labels);
  }

  const s = String(text || '');
  const found = [];
  const re = /(?:^|\s)@([^\s@](?:\s+[^\s@,@]+)*)(?=\s*[,;!?]|\s{2,}|$)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const label = String(m[1] || '').trim();
    if (label) found.push(label);
  }
  return found;
}

module.exports = { parseMentionLabelsFromText, normalizeLabel };
