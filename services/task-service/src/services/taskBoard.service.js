const axios = require('axios');
const mongoose = require('../db');
const TaskBoard = require('../models/TaskBoard');
const TaskBoardList = require('../models/TaskBoardList');
const TaskBoardMember = require('../models/TaskBoardMember');
const TaskBoardListWatcher = require('../models/TaskBoardListWatcher');
const Task = require('../models/Task');
const { logger } = require('/shared');
const { buildTrustedGatewayHeaders } = require('/shared/middleware/gatewayTrust');
const { fetchUserProfileByIdInternal } = require('/shared/utils/userServiceInternal');
const {
  fetchTaskWorkspaceScope,
  canCreateTaskInScope,
  canAssignUser,
} = require('./taskWorkspaceScope');

const ORGANIZATION_SERVICE_URL = (process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013').replace(
  /\/$/,
  ''
);
const NOTIFICATION_SERVICE_URL = (process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3003').replace(
  /\/$/,
  ''
);
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function hasScopeRolePermission(permissions) {
  const p = permissions || {};
  return Boolean(p.canSee || p.canRead || p.canWrite || p.canDelete || p.canVoice);
}

async function fetchTeamRoleAccessIds(actorId, organizationId, teamId) {
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(String(organizationId))}/hierarchy/teams/${encodeURIComponent(String(teamId))}/role-access`,
      {
        headers: buildTrustedGatewayHeaders(actorId),
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    const entries = res.data?.data?.entries;
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((row) => hasScopeRolePermission(row?.permissions))
      .map((row) => String(row.roleId || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function enrichAssignableProfiles(userIds, actorId) {
  const unique = [...new Set(userIds.map(String).filter(Boolean))];
  const rows = await Promise.all(
    unique.map(async (uid) => {
      let displayName = uid.slice(-6);
      let avatar = '';
      let username = '';
      try {
        const res = await fetchUserProfileByIdInternal(uid);
        const profile = res.data?.data ?? res.data;
        displayName =
          profile?.displayName ||
          profile?.fullName ||
          profile?.username ||
          profile?.email?.split('@')[0] ||
          displayName;
        avatar = profile?.avatar || '';
        username = profile?.username || '';
      } catch {
        /* profile optional */
      }
      return { userId: uid, displayName, avatar, username };
    })
  );
  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
}

function toOid(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return new mongoose.Types.ObjectId(String(id));
}

async function fetchActiveLists(boardOid) {
  return TaskBoardList.find({ boardId: boardOid, isArchived: false })
    .sort({ order: 1, createdAt: 1 })
    .lean();
}

async function reindexListOrders(boardOid, orderedIds) {
  const ops = orderedIds.map((id, idx) =>
    TaskBoardList.updateOne({ _id: id, boardId: boardOid }, { $set: { order: (idx + 1) * 1000 } })
  );
  if (ops.length) await Promise.all(ops);
}

async function notifyListWatchers({ listId, board, actorId, title, content }) {
  if (!NOTIFICATION_INTERNAL_TOKEN) return;
  const listOid = toOid(listId);
  if (!listOid) return;
  const rows = await TaskBoardListWatcher.find({ listId: listOid }).select('userId').lean();
  const userIds = [
    ...new Set(
      rows
        .map((r) => String(r.userId))
        .filter((uid) => uid && uid !== String(actorId || ''))
    ),
  ];
  if (!userIds.length) return;
  const orgId = board?.organizationId ? String(board.organizationId) : '';
  try {
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`,
      {
        userIds,
        type: 'task_board_list',
        title,
        content,
        data: {
          organizationId: orgId,
          boardId: String(board?._id || ''),
          listId: String(listId),
        },
      },
      {
        headers: { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
  } catch (err) {
    logger.warn('[task-board] notify watchers failed: %s', err.message);
  }
}

async function userCanAdminBoard(userId, board) {
  if (!userId || !board) return false;
  const userOid = toOid(userId);
  if (!userOid) return false;
  if (String(board.createdBy) === String(userId)) return true;
  const member = await TaskBoardMember.findOne({ boardId: board._id, userId: userOid })
    .select('role')
    .lean();
  if (member?.role === 'owner') return true;
  const scope = await fetchTaskWorkspaceScope(userId, board.organizationId);
  const orgRole = String(scope?.membershipRole || '').toLowerCase();
  return orgRole === 'owner' || orgRole === 'admin';
}

function resolveListArchivePolicy({ list, cardCount, activeListCount, canAdmin }) {
  if (!canAdmin) {
    return { canArchive: false, archiveBlockReason: 'Chỉ Owner/Admin board hoặc tổ chức mới được lưu trữ danh sách' };
  }
  if (activeListCount <= 1) {
    return { canArchive: false, archiveBlockReason: 'Board phải giữ ít nhất một danh sách' };
  }
  if (cardCount > 0) {
    return {
      canArchive: false,
      archiveBlockReason: `Danh sách còn ${cardCount} thẻ — hãy chuyển hoặc lưu trữ thẻ trước`,
    };
  }
  return { canArchive: true, archiveBlockReason: null };
}

function boardScopeTaskFields(board) {
  const out = {
    teamId: board?.teamId || null,
    departmentId: null,
    divisionId: null,
  };
  const scopeType = String(board?.scopeType || '').toLowerCase();
  const scopeId = board?.scopeId || null;
  if (scopeType === 'team') out.teamId = scopeId || out.teamId;
  if (scopeType === 'department') out.departmentId = scopeId;
  if (scopeType === 'division') out.divisionId = scopeId;
  return out;
}

async function fetchOrganizationMembers(userId, organizationId) {
  const res = await axios.get(
    `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(String(organizationId))}/members`,
    {
      headers: buildTrustedGatewayHeaders(userId),
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  const ok =
    res.status === 200 &&
    (res.data?.success === true || res.data?.status === 'success');
  if (!ok) {
    throw new Error('Không thể lấy danh sách thành viên tổ chức để seed board');
  }
  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  return rows
    .map((m) => {
      const u = String(m?.user?._id || m?.user?.id || m?.userId || '');
      const team = m?.team ? String(m.team) : '';
      const department = m?.department ? String(m.department) : '';
      const division = m?.division ? String(m.division) : '';
      if (!/^[a-f0-9]{24}$/i.test(u)) return null;
      return { userId: u, teamId: team, departmentId: department, divisionId: division };
    })
    .filter(Boolean);
}

async function ensureBoardViewAccess(boardId, userId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board || !board.isActive) return null;
  if (String(board.createdBy) === String(userId)) return board;
  const userOid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(String(userId))
    : null;
  if (!userOid) return null;
  const member = await TaskBoardMember.findOne({
    boardId: board._id,
    userId: userOid,
    canView: true,
  })
    .select('_id canEdit')
    .lean();
  if (!member) return null;
  return board;
}

async function ensureBoardEditAccess(boardId, userId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board || !board.isActive) return null;
  if (String(board.createdBy) === String(userId)) return board;
  const userOid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(String(userId))
    : null;
  if (!userOid) return null;
  const member = await TaskBoardMember.findOne({
    boardId: board._id,
    userId: userOid,
    canEdit: true,
  })
    .select('_id')
    .lean();
  if (!member) return null;
  return board;
}

function resolveBoardScope({ scopeType, scopeId, teamId }) {
  const type = String(scopeType || (teamId ? 'team' : '')).toLowerCase();
  if (['team', 'department', 'division'].includes(type)) {
    return { scopeType: type, scopeId: String(scopeId || teamId || '') };
  }
  return { scopeType: 'team', scopeId: String(teamId || '') };
}

async function createBoard({ userId, organizationId, teamId, scopeType, scopeId, title, background, visibility }) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  if (!scope || !canCreateTaskInScope(scope)) {
    throw new Error('Bạn không có quyền tạo task board');
  }
  const nextScope = resolveBoardScope({ scopeType, scopeId, teamId });
  if (!nextScope.scopeId) throw new Error('scopeId/teamId là bắt buộc');

  const board = await TaskBoard.create({
    organizationId,
    teamId: nextScope.scopeType === 'team' ? nextScope.scopeId : null,
    scopeType: nextScope.scopeType,
    scopeId: nextScope.scopeId,
    title: String(title || '').trim(),
    background: String(background || '').trim(),
    visibility: visibility === 'workspace' ? 'workspace' : 'private',
    createdBy: userId,
    isActive: true,
  });

  await TaskBoardMember.create({
    boardId: board._id,
    userId,
    role: 'owner',
    canView: true,
    canEdit: true,
    addedBy: userId,
  });

  if (board.visibility === 'workspace') {
    const members = await fetchOrganizationMembers(userId, organizationId);
    const rows = members
      .filter((m) => {
        if (String(m.userId) === String(userId)) return false;
        if (board.scopeType === 'team') return String(m.teamId) === String(board.scopeId);
        if (board.scopeType === 'department') return String(m.departmentId) === String(board.scopeId);
        if (board.scopeType === 'division') return String(m.divisionId) === String(board.scopeId);
        return false;
      })
      .map((m) => ({
        boardId: board._id,
        userId: m.userId,
        role: 'viewer',
        canView: true,
        canEdit: true,
        addedBy: userId,
      }));
    if (rows.length) await TaskBoardMember.insertMany(rows, { ordered: false });
  }

  return board.toObject();
}

async function listBoards({ userId, organizationId, teamId, scopeType, scopeId }) {
  const userOid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(String(userId))
    : null;
  const orgOid = mongoose.Types.ObjectId.isValid(organizationId)
    ? new mongoose.Types.ObjectId(String(organizationId))
    : null;
  if (!userOid || !orgOid) return [];

  const base = {
    organizationId: orgOid,
    isActive: true,
  };
  if (teamId && mongoose.Types.ObjectId.isValid(teamId)) {
    base.teamId = new mongoose.Types.ObjectId(String(teamId));
  }
  if (scopeType && scopeId && mongoose.Types.ObjectId.isValid(scopeId)) {
    base.scopeType = String(scopeType).toLowerCase();
    base.scopeId = new mongoose.Types.ObjectId(String(scopeId));
  }

  const memberBoardIds = await TaskBoardMember.find({
    userId: userOid,
    canView: true,
  })
    .select('boardId')
    .lean();
  const ids = memberBoardIds.map((r) => r.boardId).filter((id) => id != null);
  const accessOr = [{ createdBy: userOid }];
  if (ids.length) accessOr.push({ _id: { $in: ids } });

  const boards = await TaskBoard.find({
    ...base,
    $or: accessOr,
  })
    .sort({ updatedAt: -1 })
    .lean();
  return boards;
}

async function getBoardDetail({ userId, boardId }) {
  const board = await ensureBoardViewAccess(boardId, userId);
  if (!board) throw new Error('Không có quyền xem board này');
  const boardOid = board._id;
  // Board cũ: bỏ cờ isDefault (không còn list hệ thống bảo vệ)
  await TaskBoardList.updateMany({ boardId: boardOid, isDefault: true }, { $set: { isDefault: false } });
  const lists = await fetchActiveLists(boardOid);
  const listIds = lists.map((l) => l._id);
  const userOid = toOid(userId);
  const watcherRows = listIds.length
    ? await TaskBoardListWatcher.find({ listId: { $in: listIds } }).select('listId userId').lean()
    : [];
  const watcherCountByList = new Map();
  const watchingSet = new Set();
  for (const row of watcherRows) {
    const lid = String(row.listId);
    watcherCountByList.set(lid, (watcherCountByList.get(lid) || 0) + 1);
    if (userOid && String(row.userId) === String(userOid)) watchingSet.add(lid);
  }
  const cards = await Task.find({ boardId: boardOid, isActive: true })
    .sort({ listId: 1, position: 1, createdAt: 1 })
    .lean();

  const canAdmin = await userCanAdminBoard(userId, board);
  const activeListCount = lists.length;
  const cardCountByList = new Map();
  for (const c of cards) {
    const lid = String(c.listId || '');
    cardCountByList.set(lid, (cardCountByList.get(lid) || 0) + 1);
  }
  const listsEnriched = lists.map((l) => {
    const cardCount = cardCountByList.get(String(l._id)) || 0;
    const policy = resolveListArchivePolicy({
      list: l,
      cardCount,
      activeListCount,
      canAdmin,
    });
    return {
      ...l,
      cardCount,
      watcherCount: watcherCountByList.get(String(l._id)) || 0,
      isWatching: watchingSet.has(String(l._id)),
      canArchive: policy.canArchive,
      archiveBlockReason: policy.archiveBlockReason,
    };
  });

  const assigneeIds = [...new Set(cards.map((c) => (c?.assigneeId ? String(c.assigneeId) : '')).filter(Boolean))];
  const assigneeRows = assigneeIds.length ? await enrichAssignableProfiles(assigneeIds, userId) : [];
  const assigneeMap = new Map(assigneeRows.map((row) => [String(row.userId), row]));

  // Keep only fields needed by FE (avoid large docs)
  const sanitizedCards = cards.map((c) => ({
    _id: c._id,
    boardId: c.boardId,
    listId: c.listId,
    title: c.title,
    description: c.description,
    summary: c.summary,
    priority: c.priority,
    dueDate: c.dueDate,
    assigneeId: c.assigneeId,
    assigneeName: c.assigneeId
      ? assigneeMap.get(String(c.assigneeId))?.displayName ||
        assigneeMap.get(String(c.assigneeId))?.username ||
        ''
      : '',
    assignees: c.assigneeId
      ? [
          {
            userId: String(c.assigneeId),
            displayName:
              assigneeMap.get(String(c.assigneeId))?.displayName ||
              assigneeMap.get(String(c.assigneeId))?.username ||
              '',
            avatar: assigneeMap.get(String(c.assigneeId))?.avatar || '',
          },
        ]
      : [],
    tags: Array.isArray(c.tags) ? c.tags : [],
    attachments: Array.isArray(c.attachments) ? c.attachments : [],
    status: c.status,
    completedAt: c.completedAt,
    position: c.position,
    createdAt: c.createdAt,
    comments: Array.isArray(c.comments)
      ? c.comments.map((cm) => ({
          userId: cm.userId,
          content: cm.content,
          createdAt: cm.createdAt,
        }))
      : [],
  }));

  return { board, lists: listsEnriched, cards: sanitizedCards };
}

async function createList({ userId, boardId, title }) {
  const board = await ensureBoardEditAccess(boardId, userId);
  if (!board) throw new Error('Không có quyền sửa board này');
  const last = await TaskBoardList.findOne({ boardId }).sort({ order: -1 }).lean();
  const nextOrder = (Number(last?.order) || 0) + 1000;
  const row = await TaskBoardList.create({
    boardId,
    title: String(title || '').trim(),
    order: nextOrder,
    isDefault: false,
    isArchived: false,
  });
  return row.toObject();
}

async function createCard({
  userId,
  boardId,
  listId,
  title,
  summary,
  description,
  assigneeId,
  dueDate,
  priority,
  tags,
  attachments,
  sourceMessageId,
  aiGenerated,
}) {
  const board = await ensureBoardEditAccess(boardId, userId);
  if (!board) throw new Error('Không có quyền sửa board này');
  const list = await TaskBoardList.findOne({ _id: listId, boardId, isArchived: false }).lean();
  if (!list) throw new Error('List không tồn tại trong board đã chọn');

  const scope = await fetchTaskWorkspaceScope(userId, board.organizationId);
  if (assigneeId && !canAssignUser(scope, assigneeId)) {
    throw new Error('Không thể gán task cho thành viên ngoài phạm vi quản lý');
  }

  const last = await Task.findOne({ boardId, listId, isActive: true })
    .sort({ position: -1 })
    .lean();
  const nextPos = (Number(last?.position) || 0) + 1000;

  const row = await Task.create({
    boardId,
    listId,
    organizationId: board.organizationId,
    ...boardScopeTaskFields(board),
    title: String(title || '').trim(),
    summary: String(summary || '').trim(),
    description: String(description || '').trim(),
    assigneeId: assigneeId || null,
    createdBy: userId,
    priority: priority || 'medium',
    dueDate: dueDate || null,
    position: nextPos,
    tags: Array.isArray(tags) ? tags : [],
    attachments: Array.isArray(attachments)
      ? attachments
          .map((a) => ({
            name: String(a?.name || a?.url || '').trim(),
            url: String(a?.url || '').trim(),
            documentId: a?.documentId || null,
          }))
          .filter((a) => a.url)
      : [],
    sourceMessageId: sourceMessageId || null,
    aiGenerated: Boolean(aiGenerated),
  });

  await ensureAssigneeBoardAccess({
    boardId: board._id,
    assigneeId: assigneeId || null,
    actorId: userId,
  });
  const created = row.toObject();
  await notifyListWatchers({
    listId,
    board,
    actorId: userId,
    title: 'Thẻ mới trong danh sách',
    content: `Thẻ "${created.title}" vừa được thêm`,
  });
  return created;
}

function computeCardInsertPosition(siblings, index) {
  const GAP = 1000;
  if (!siblings.length) return GAP;
  const idx = Math.max(0, Math.min(Number(index) || 0, siblings.length));
  if (idx <= 0) {
    const first = Number(siblings[0].position) || GAP;
    return first - GAP / 2;
  }
  if (idx >= siblings.length) {
    const last = Number(siblings[siblings.length - 1].position) || 0;
    return last + GAP;
  }
  const prev = Number(siblings[idx - 1].position) || 0;
  const next = Number(siblings[idx].position) || prev + GAP * 2;
  return (prev + next) / 2;
}

async function moveCard({ userId, cardId, toListId, position, index }) {
  const card = await Task.findById(cardId);
  if (!card || !card.boardId) throw new Error('Card không tồn tại');
  const board = await ensureBoardEditAccess(card.boardId, userId);
  if (!board) throw new Error('Không có quyền sửa board này');

  const targetListId = toListId || card.listId;
  const list = await TaskBoardList.findOne({ _id: targetListId, boardId: board._id, isArchived: false }).lean();
  if (!list) throw new Error('List đích không hợp lệ');

  const siblings = await Task.find({
    boardId: board._id,
    listId: targetListId,
    isActive: true,
    _id: { $ne: card._id },
  })
    .sort({ position: 1, createdAt: 1 })
    .lean();

  let targetIndex = index;
  if (targetIndex == null && position != null && Number.isFinite(Number(position))) {
    const asIdx = Number(position);
    if (asIdx >= 0 && asIdx <= siblings.length && Number.isInteger(asIdx)) {
      targetIndex = asIdx;
    }
  }
  if (targetIndex == null) {
    targetIndex = siblings.length;
  }

  card.listId = targetListId;
  card.position = computeCardInsertPosition(siblings, targetIndex);
  await card.save();
  const moved = card.toObject();
  await notifyListWatchers({
    listId: toListId,
    board,
    actorId: userId,
    title: 'Thẻ được chuyển',
    content: `Thẻ "${moved.title}" vừa được chuyển vào danh sách`,
  });
  return moved;
}

async function updateCard({
  userId,
  cardId,
  title,
  description,
  summary,
  priority,
  dueDate,
  tags,
  assigneeId,
  attachments,
  status,
}) {
  const card = await Task.findById(cardId);
  if (!card || !card.boardId) throw new Error('Card không tồn tại');
  const board = await ensureBoardEditAccess(card.boardId, userId);
  if (!board) throw new Error('Không có quyền sửa card này');

  const next = {};
  if (title !== undefined) next.title = String(title).trim();
  if (description !== undefined) next.description = String(description).trim();
  if (summary !== undefined) next.summary = String(summary).trim();
  if (priority !== undefined) next.priority = priority || 'medium';
  if (dueDate !== undefined) next.dueDate = dueDate ? new Date(dueDate) : null;
  if (status !== undefined) {
    const st = String(status || '').trim();
    if (!['todo', 'in_progress', 'review', 'done', 'cancelled'].includes(st)) {
      throw new Error('status không hợp lệ');
    }
    next.status = st;
    if (st === 'done') {
      next.completedAt = new Date();
    } else if (card.status === 'done') {
      next.completedAt = null;
    }
  }
  if (tags !== undefined) next.tags = Array.isArray(tags) ? tags : [];
  if (attachments !== undefined) {
    next.attachments = Array.isArray(attachments)
      ? attachments
          .map((a) => ({
            name: String(a?.name || a?.url || '').trim(),
            url: String(a?.url || '').trim(),
            documentId: a?.documentId || null,
          }))
          .filter((a) => a.url)
      : [];
  }
  if (assigneeId !== undefined) next.assigneeId = assigneeId || null;

  if (next.title != null && !next.title) throw new Error('title không hợp lệ');

  await ensureAssigneeBoardAccess({
    boardId: board._id,
    assigneeId: assigneeId || null,
    actorId: userId,
  });

  const updated = await Task.findByIdAndUpdate(
    cardId,
    { $set: next },
    { new: true, runValidators: true }
  );
  const out = updated?.toObject ? updated.toObject() : updated;
  if (card.listId) {
    await notifyListWatchers({
      listId: card.listId,
      board,
      actorId: userId,
      title: 'Thẻ được cập nhật',
      content: `Thẻ "${out?.title || card.title}" vừa được chỉnh sửa`,
    });
  }
  return out;
}

async function addCardComment({ userId, cardId, content }) {
  const text = String(content || '').trim();
  if (!text) throw new Error('Nội dung bình luận không được để trống');
  const card = await Task.findById(cardId);
  if (!card || !card.boardId || !card.isActive) throw new Error('Card không tồn tại');
  const board = await ensureBoardEditAccess(card.boardId, userId);
  if (!board) throw new Error('Không có quyền sửa card này');

  const userOid = toOid(userId);
  if (!userOid) throw new Error('userId không hợp lệ');

  const updated = await Task.findByIdAndUpdate(
    cardId,
    {
      $push: {
        comments: {
          userId: userOid,
          content: text,
          createdAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true }
  );
  const out = updated?.toObject ? updated.toObject() : updated;
  if (card.listId) {
    await notifyListWatchers({
      listId: card.listId,
      board,
      actorId: userId,
      title: 'Bình luận mới trên thẻ',
      content: `Có bình luận mới trên thẻ "${out?.title || card.title}"`,
    });
  }
  return out;
}

async function copyCard({ userId, cardId, toListId }) {
  const card = await Task.findById(cardId).lean();
  if (!card || !card.boardId || !card.isActive) throw new Error('Card không tồn tại');
  const board = await ensureBoardEditAccess(card.boardId, userId);
  if (!board) throw new Error('Không có quyền sửa board này');

  const targetListOid = toListId ? toOid(toListId) : card.listId;
  const list = await TaskBoardList.findOne({
    _id: targetListOid,
    boardId: board._id,
    isArchived: false,
  }).lean();
  if (!list) throw new Error('List đích không hợp lệ');

  const last = await Task.findOne({ boardId: board._id, listId: list._id, isActive: true })
    .sort({ position: -1 })
    .lean();
  const nextPos = (Number(last?.position) || 0) + 1000;
  const copyTitle = String(card.title || '').trim();
  const row = await Task.create({
    boardId: board._id,
    listId: list._id,
    organizationId: board.organizationId,
    ...boardScopeTaskFields(board),
    title: copyTitle.endsWith('(bản sao)') ? copyTitle : `${copyTitle} (bản sao)`,
    summary: card.summary || '',
    description: card.description || '',
    assigneeId: card.assigneeId || null,
    createdBy: userId,
    priority: card.priority || 'medium',
    dueDate: card.dueDate || null,
    tags: Array.isArray(card.tags) ? [...card.tags] : [],
    attachments: Array.isArray(card.attachments) ? card.attachments.map((a) => ({ ...a })) : [],
    position: nextPos,
    isActive: true,
  });
  const created = row.toObject();
  await notifyListWatchers({
    listId: list._id,
    board,
    actorId: userId,
    title: 'Thẻ được sao chép',
    content: `Thẻ "${created.title}" vừa được thêm`,
  });
  return created;
}

async function archiveCard({ userId, cardId }) {
  const card = await Task.findById(cardId);
  if (!card || !card.boardId || !card.isActive) throw new Error('Card không tồn tại');
  const board = await ensureBoardEditAccess(card.boardId, userId);
  if (!board) throw new Error('Không có quyền sửa board này');
  card.isActive = false;
  await card.save();
  return { cardId: String(card._id), archived: true };
}

async function reorderList({ userId, boardId, listId, position }) {
  const board = await ensureBoardEditAccess(boardId, userId);
  if (!board) throw new Error('Không có quyền sửa board này');
  const boardOid = board._id;
  const listOid = toOid(listId);
  if (!listOid) throw new Error('listId không hợp lệ');
  const lists = await fetchActiveLists(boardOid);
  const ids = lists.map((l) => String(l._id));
  const fromIdx = ids.indexOf(String(listId));
  if (fromIdx < 0) throw new Error('List không tồn tại');
  const pos = Math.max(1, Math.min(Number(position) || 1, ids.length));
  const nextIds = ids.filter((id) => id !== String(listId));
  nextIds.splice(pos - 1, 0, String(listId));
  await reindexListOrders(boardOid, nextIds.map((id) => toOid(id)));
  return fetchActiveLists(boardOid);
}

async function copyList({ userId, listId, title, toBoardId }) {
  const src = await TaskBoardList.findById(listId).lean();
  if (!src || src.isArchived) throw new Error('List không tồn tại');
  const targetBoardId = toBoardId || src.boardId;
  const board = await ensureBoardEditAccess(targetBoardId, userId);
  if (!board) throw new Error('Không có quyền sửa board đích');
  const targetOid = board._id;
  const lists = await fetchActiveLists(targetOid);
  const nextOrder = (Number(lists[lists.length - 1]?.order) || 0) + 1000;
  const newList = await TaskBoardList.create({
    boardId: targetOid,
    title: String(title || src.title || '').trim() || src.title,
    order: nextOrder,
    isDefault: false,
    isArchived: false,
  });
  const cards = await Task.find({ listId: src._id, isActive: true }).sort({ position: 1 }).lean();
  if (cards.length) {
    const rows = cards.map((c, idx) => ({
      boardId: targetOid,
      listId: newList._id,
      organizationId: board.organizationId,
      ...boardScopeTaskFields(board),
      title: c.title,
      summary: c.summary || '',
      description: c.description || '',
      assigneeId: c.assigneeId || null,
      createdBy: userId,
      priority: c.priority || 'medium',
      dueDate: c.dueDate || null,
      position: (idx + 1) * 1000,
      tags: Array.isArray(c.tags) ? c.tags : [],
      isActive: true,
    }));
    await Task.insertMany(rows, { ordered: false });
  }
  return newList.toObject();
}

async function moveList({ userId, listId, toBoardId, position }) {
  const src = await TaskBoardList.findById(listId);
  if (!src || src.isArchived) throw new Error('List không tồn tại');
  const sourceBoard = await ensureBoardEditAccess(src.boardId, userId);
  if (!sourceBoard) throw new Error('Không có quyền sửa board nguồn');
  const targetBoard = await ensureBoardEditAccess(toBoardId, userId);
  if (!targetBoard) throw new Error('Không có quyền sửa board đích');
  const targetOid = targetBoard._id;
  src.boardId = targetOid;
  await src.save();
  await Task.updateMany(
    { listId: src._id, isActive: true },
    {
      $set: {
        boardId: targetOid,
        organizationId: targetBoard.organizationId,
        ...boardScopeTaskFields(targetBoard),
      },
    }
  );
  const lists = await fetchActiveLists(targetOid);
  const ids = lists.map((l) => String(l._id)).filter((id) => id !== String(listId));
  const pos = Math.max(1, Math.min(Number(position) || ids.length + 1, ids.length + 1));
  ids.splice(pos - 1, 0, String(listId));
  await reindexListOrders(targetOid, ids.map((id) => toOid(id)));
  return src.toObject();
}

async function moveAllCardsInList({ userId, listId, toListId }) {
  const src = await TaskBoardList.findById(listId).lean();
  if (!src || src.isArchived) throw new Error('List nguồn không tồn tại');
  const dst = await TaskBoardList.findById(toListId).lean();
  if (!dst || dst.isArchived) throw new Error('List đích không tồn tại');
  const srcBoard = await ensureBoardEditAccess(src.boardId, userId);
  const dstBoard = await ensureBoardEditAccess(dst.boardId, userId);
  if (!srcBoard || !dstBoard) throw new Error('Không có quyền sửa board');
  const last = await Task.findOne({ boardId: dst.boardId, listId: toListId, isActive: true })
    .sort({ position: -1 })
    .lean();
  let nextPos = Number(last?.position) || 0;
  const cards = await Task.find({ listId: src._id, isActive: true }).sort({ position: 1 }).lean();
  for (const card of cards) {
    nextPos += 1000;
    await Task.updateOne(
      { _id: card._id },
      {
        $set: {
          listId: toListId,
          boardId: dst.boardId,
          organizationId: dstBoard.organizationId,
          ...boardScopeTaskFields(dstBoard),
          position: nextPos,
        },
      }
    );
  }
  await notifyListWatchers({
    listId: toListId,
    board: dstBoard,
    actorId: userId,
    title: 'Thẻ được chuyển hàng loạt',
    content: `${cards.length} thẻ vừa được chuyển vào danh sách "${dst.title}"`,
  });
  return { movedCount: cards.length };
}

async function archiveList({ userId, boardId, listId }) {
  const board = await ensureBoardViewAccess(boardId, userId);
  if (!board) throw new Error('Không có quyền xem board này');
  const canAdmin = await userCanAdminBoard(userId, board);
  if (!canAdmin) throw new Error('Chỉ Owner/Admin mới được lưu trữ danh sách');

  const boardOid = board._id;
  const listOid = toOid(listId);
  if (!listOid) throw new Error('listId không hợp lệ');

  const list = await TaskBoardList.findOne({ _id: listOid, boardId: boardOid, isArchived: false });
  if (!list) throw new Error('Danh sách không tồn tại hoặc đã bị xóa');

  const activeListCount = await TaskBoardList.countDocuments({ boardId: boardOid, isArchived: false });
  const cardCount = await Task.countDocuments({ listId: listOid, isActive: true });
  const policy = resolveListArchivePolicy({
    list,
    cardCount,
    activeListCount,
    canAdmin: true,
  });
  if (!policy.canArchive) {
    throw new Error(policy.archiveBlockReason || 'Không thể lưu trữ danh sách');
  }

  list.isArchived = true;
  await list.save();
  await TaskBoardListWatcher.deleteMany({ listId: listOid });

  return { listId: String(list._id), archived: true };
}

async function setListWatch({ userId, listId, watching }) {
  const list = await TaskBoardList.findById(listId).lean();
  if (!list || list.isArchived) throw new Error('List không tồn tại');
  const board = await ensureBoardViewAccess(list.boardId, userId);
  if (!board) throw new Error('Không có quyền xem board này');
  const userOid = toOid(userId);
  const listOid = toOid(listId);
  if (!userOid || !listOid) throw new Error('userId/listId không hợp lệ');
  if (watching) {
    await TaskBoardListWatcher.findOneAndUpdate(
      { listId: listOid, userId: userOid },
      { listId: listOid, boardId: board._id, userId: userOid },
      { upsert: true, new: true }
    );
    return { watching: true, watcherCount: await TaskBoardListWatcher.countDocuments({ listId: listOid }) };
  }
  await TaskBoardListWatcher.deleteOne({ listId: listOid, userId: userOid });
  return { watching: false, watcherCount: await TaskBoardListWatcher.countDocuments({ listId: listOid }) };
}

async function listBoardAssignableMembers({ userId, boardId }) {
  const board = await ensureBoardViewAccess(boardId, userId);
  if (!board) throw new Error('Không có quyền xem board này');

  const orgId = String(board.organizationId);
  const scopeType = String(board.scopeType || (board.teamId ? 'team' : '')).toLowerCase();
  const scopeId = String(board.scopeId || board.teamId || '');
  const candidateIds = new Set();

  const boardMemberRows = await TaskBoardMember.find({ boardId: board._id, canView: true })
    .select('userId')
    .lean();
  for (const row of boardMemberRows) {
    if (row?.userId) candidateIds.add(String(row.userId));
  }
  if (board.createdBy) candidateIds.add(String(board.createdBy));

  const orgMembers = await fetchOrganizationMembers(userId, orgId);
  for (const m of orgMembers) {
    if (!scopeId) {
      candidateIds.add(String(m.userId));
      continue;
    }
    if (scopeType === 'team' && String(m.teamId) === scopeId) candidateIds.add(String(m.userId));
    if (scopeType === 'department' && String(m.departmentId) === scopeId) {
      candidateIds.add(String(m.userId));
    }
    if (scopeType === 'division' && String(m.divisionId) === scopeId) candidateIds.add(String(m.userId));
  }

  const allowedRoleIds =
    scopeType === 'team' && scopeId ? await fetchTeamRoleAccessIds(userId, orgId, scopeId) : [];

  // UI "Thành viên" trong card cần ưu tiên hiển thị đầy đủ thành viên cùng team/board.
  // Không loại theo role-access để tránh ẩn nhầm thành viên hợp lệ của team.
  const members = await enrichAssignableProfiles([...candidateIds], userId);
  return { members, teamId: scopeType === 'team' ? scopeId : '', scopeType, scopeId, allowedRoleIds };
}

async function ensureAssigneeBoardAccess({ boardId, assigneeId, actorId }) {
  if (!boardId || !assigneeId) return;
  const exists = await TaskBoardMember.findOne({ boardId, userId: assigneeId }).lean();
  if (exists) return;
  try {
    await TaskBoardMember.create({
      boardId,
      userId: assigneeId,
      role: 'viewer',
      canView: true,
      canEdit: false,
      addedBy: actorId,
    });
  } catch (err) {
    logger.warn('[task-board] ensure assignee access failed: %s', err.message);
  }
}

module.exports = {
  createBoard,
  listBoards,
  getBoardDetail,
  listBoardAssignableMembers,
  createList,
  createCard,
  moveCard,
  updateCard,
  addCardComment,
  copyCard,
  archiveCard,
  reorderList,
  copyList,
  moveList,
  moveAllCardsInList,
  setListWatch,
  archiveList,
  userCanAdminBoard,
  ensureBoardViewAccess,
  ensureBoardEditAccess,
  ensureAssigneeBoardAccess,
};
