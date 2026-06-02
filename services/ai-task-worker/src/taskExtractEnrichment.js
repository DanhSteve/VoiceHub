const axios = require('axios');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ORGANIZATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ORGANIZATION_SERVICE_URL');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

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
  if (labels.length) return parseWithKnownLabels(text, labels);

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

async function fetchAiTaskContext({ organizationId, userIds, mentionLabels, channelId, messageText }) {
  if (!GATEWAY_INTERNAL_TOKEN) {
    console.warn('[ai-task-worker] GATEWAY_INTERNAL_TOKEN missing — cannot resolve org member context');
    return null;
  }
  const res = await axios.post(
    `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/ai-task-context`,
    {
      organizationId: String(organizationId),
      userIds: userIds || [],
      mentionLabels: mentionLabels || [],
      channelId: channelId || undefined,
      messageText: String(messageText || ''),
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN,
      },
      timeout: 20000,
      validateStatus: () => true,
    }
  );
  if (res.status !== 200 || !res.data?.success) {
    console.warn(
      '[ai-task-worker] ai-task-context failed',
      res.status,
      typeof res.data?.message === 'string' ? res.data.message : ''
    );
    return null;
  }
  return res.data.data;
}

function buildEnrichedPrompt({ messageText, systemContext, nowIso }) {
  const safeCtx = {
    organization: systemContext?.organization || null,
    channel: systemContext?.channel || null,
    mentionedUsers: (systemContext?.mentionedUsers || []).map((u) => ({
      userId: u.userId,
      displayName: u.displayName,
      username: u.username,
      departmentName: u.departmentName,
      teamName: u.teamName,
    })),
  };
  const ctxJson = JSON.stringify(safeCtx, null, 2);
  return [
    'Bạn là hệ thống trích xuất task từ tin nhắn chat nội bộ doanh nghiệp.',
    'Trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích).',
    '',
    `Thời điểm hiện tại (ISO): ${nowIso}`,
    'Múi giờ tham chiếu deadline: Asia/Ho_Chi_Minh (UTC+7).',
    '',
    'Schema JSON bắt buộc:',
    '{',
    '  "title": string,',
    '  "summary": string,',
    '  "description": string,',
    '  "priority": "low"|"medium"|"high"|"urgent",',
    '  "dueDate": "YYYY-MM-DDTHH:mm:ss.sssZ"|null,',
    '  "tags": string[],',
    '  "assigneeUserId": string|null',
    '}',
    '',
    'Quy tắc:',
    '- summary: 1-2 câu ngắn.',
    '- description: mô tả chi tiết đầy đủ (giữ bullet/yêu cầu từ tin nhắn).',
    '- assigneeUserId: CHỈ chọn userId có trong mentionedUsers; ưu tiên người được @mention đầu tiên.',
    '- KHÔNG tự đoán userId — hệ thống gán team/phòng từ DB.',
  '',
    'Ngữ cảnh hệ thống (từ DB):',
    ctxJson,
    '',
    'Tin nhắn:',
    messageText || '',
  ].join('\n');
}

function pickAssigneeFromContext(systemContext, parsedAssigneeUserId, preferredUserIds = []) {
  const users = systemContext?.mentionedUsers || [];
  for (const uid of preferredUserIds) {
    const hit = users.find((u) => String(u.userId) === String(uid));
    if (hit) return hit;
    if (uid && /^[a-f0-9]{24}$/i.test(String(uid))) {
      return { userId: String(uid), displayName: '', username: '' };
    }
  }
  if (parsedAssigneeUserId) {
    const hit = users.find((u) => String(u.userId) === String(parsedAssigneeUserId));
    if (hit) return hit;
    if (/^[a-f0-9]{24}$/i.test(String(parsedAssigneeUserId))) {
      return { userId: String(parsedAssigneeUserId), displayName: '', username: '' };
    }
  }
  return users[0] || null;
}

function applyPlacementFromContext(draft, assignee, channel) {
  const next = { ...draft };
  if (assignee?.userId) {
    next.assigneeId = assignee.userId;
    next.assigneeName = assignee.displayName || assignee.username || '';
    if (assignee.departmentId) next.departmentId = assignee.departmentId;
    if (assignee.teamId) next.teamId = assignee.teamId;
    if (assignee.departmentName) next.departmentName = assignee.departmentName;
  } else if (channel) {
    if (channel.departmentId) next.departmentId = channel.departmentId;
    if (channel.teamId) next.teamId = channel.teamId;
    if (channel.departmentName) next.departmentName = channel.departmentName;
  }
  return next;
}

function safeParseJsonFromOllama(data) {
  const text = typeof data?.response === 'string' ? data.response : JSON.stringify(data || {});
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('Model output has no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

module.exports = {
  parseMentionLabelsFromText,
  fetchAiTaskContext,
  buildEnrichedPrompt,
  pickAssigneeFromContext,
  applyPlacementFromContext,
  safeParseJsonFromOllama,
};
