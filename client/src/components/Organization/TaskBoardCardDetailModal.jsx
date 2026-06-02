import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Link2,
  MessageSquare,
  Paperclip,
  Tag,
  UserPlus,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import userService from '../../services/userService';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { TASK_BOARD_LABELS, labelById, parseCardLabelIds } from './taskBoardCardLabels';
import { uploadTaskBoardAttachment } from './taskBoardAttachmentUpload';

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialsFromName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '??';
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

export default function TaskBoardCardDetailModal({
  isOpen,
  isDarkMode,
  card,
  boardId = '',
  workspaceSlug = '',
  listTitle = '',
  lists = [],
  initialPanel = 'detail',
  onClose,
  onUpdateCard,
  onRefresh,
}) {
  const boardApiOpts = workspaceSlug ? { workspaceSlug } : {};
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [labelIds, setLabelIds] = useState([]);
  const [dueDateLocal, setDueDateLocal] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [panel, setPanel] = useState('detail');
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [attachUrl, setAttachUrl] = useState('');
  const [attachName, setAttachName] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentAuthors, setCommentAuthors] = useState({});
  const fileInputRef = useRef(null);
  const { user } = useAuth();

  const cardId = card?._id ? String(card._id) : '';
  const isDone = String(card?.status || '') === 'done';
  const comments = Array.isArray(card?.comments) ? card.comments : [];

  useEffect(() => {
    if (!isOpen || !card) return;
    setTitle(String(card.title || ''));
    setDescription(String(card.description || ''));
    setLabelIds(parseCardLabelIds(card.tags));
    setDueDateLocal(toDatetimeLocalValue(card.dueDate));
    setAssigneeId(card.assigneeId ? String(card.assigneeId) : '');
    setAttachments(Array.isArray(card.attachments) ? [...card.attachments] : []);
    setEditingDescription(false);
    setPanel(initialPanel || 'detail');
    setAttachUrl('');
    setAttachName('');
    setCommentDraft('');
  }, [isOpen, card, initialPanel]);

  useEffect(() => {
    if (!isOpen || !comments.length) return;
    let cancelled = false;
    const ids = [...new Set(comments.map((c) => String(c.userId || '')).filter(Boolean))];
    (async () => {
      const map = {};
      await Promise.all(
        ids.map(async (uid) => {
          try {
            const res = await userService.getProfile(uid);
            const p = res?.data?.data ?? res?.data ?? res;
            const profile = p?.data ?? p;
            map[uid] =
              profile?.displayName ||
              profile?.fullName ||
              profile?.username ||
              profile?.email?.split('@')[0] ||
              uid.slice(-6);
          } catch {
            map[uid] = uid.slice(-6);
          }
        })
      );
      if (!cancelled) setCommentAuthors(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, comments]);

  useEffect(() => {
    if (!isOpen || !boardId) return;
    let cancelled = false;
    (async () => {
      setLoadingMembers(true);
      try {
        const res = await taskAPI.getBoardAssignableMembers(String(boardId), boardApiOpts);
        const payload = unwrapTaskApiPayload(res);
        const rows = Array.isArray(payload?.members) ? payload.members : [];
        if (!cancelled) setMembers(rows);
      } catch {
        if (!cancelled) setMembers([]);
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, boardId, workspaceSlug]);

  const boardMembers = useMemo(() => {
    return members
      .map((m) => ({
        id: String(m.userId || ''),
        name: String(m.displayName || m.username || 'Thành viên'),
        avatar: String(m.displayName || m.username || '??')
          .slice(0, 2)
          .toUpperCase(),
      }))
      .filter((m) => m.id);
  }, [members]);

  const selectedAssignees = useMemo(() => {
    const fromCard = Array.isArray(card?.assignees) ? card.assignees : [];
    if (fromCard.length > 0) {
      return fromCard
        .map((m) => ({
          id: String(m.userId || m.id || ''),
          name: String(m.displayName || m.username || 'Thành viên'),
        }))
        .filter((m) => m.id);
    }
    if (!assigneeId) return [];
    const selected = boardMembers.find((m) => String(m.id) === String(assigneeId));
    if (selected) return [selected];
    return [{ id: String(assigneeId), name: String(card?.assigneeName || 'Thành viên') }];
  }, [assigneeId, boardMembers, card?.assignees, card?.assigneeName]);
  const visibleAssignees =
    selectedAssignees.length > 3 ? selectedAssignees.slice(0, 2) : selectedAssignees.slice(0, 3);
  const overflowAssignees = selectedAssignees.length > 3 ? selectedAssignees.length - 2 : 0;

  const toggleComplete = async () => {
    const nextStatus = isDone ? 'todo' : 'done';
    await save({ status: nextStatus });
  };

  const submitComment = async () => {
    const text = commentDraft.trim();
    if (!text || !cardId || submittingComment) return;
    setSubmittingComment(true);
    try {
      const res = await taskAPI.addBoardCardComment(cardId, text, boardApiOpts);
      const updated = unwrapTaskApiPayload(res);
      if (updated && typeof updated === 'object') {
        await onUpdateCard?.(cardId, updated);
      }
      setCommentDraft('');
      toast.success('Đã thêm bình luận');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Không gửi được bình luận');
    } finally {
      setSubmittingComment(false);
    }
  };

  const save = async (patch) => {
    if (!cardId || saving) return;
    setSaving(true);
    try {
      await onUpdateCard?.(cardId, patch);
      toast.success('Đã lưu');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Không lưu được');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !cardId) return null;

  const shell = isDarkMode
    ? 'border-white/10 bg-[#2b2f38] text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';
  const popover = isDarkMode
    ? 'border-white/10 bg-[#1e2228] text-slate-100 shadow-2xl'
    : 'border-slate-200 bg-white text-slate-900 shadow-xl';
  const inputCls = isDarkMode
    ? 'border-white/15 bg-[#1a1d26] text-white'
    : 'border-slate-200 bg-white text-slate-900';

  const toolbarBtn = isDarkMode
    ? 'rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15'
    : 'rounded-lg bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200';

  const toggleLabel = async (id) => {
    const next = labelIds.includes(id) ? labelIds.filter((x) => x !== id) : [...labelIds, id];
    setLabelIds(next);
    await save({ tags: next });
  };

  const panelNode =
    panel === 'attach' ? (
      <div className={`absolute left-4 right-4 top-24 z-20 w-auto rounded-xl border p-3 sm:right-auto sm:w-80 ${popover}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Đính kèm</span>
          <button type="button" onClick={() => setPanel('detail')} className="rounded p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className={`mb-2 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Đính kèm tệp từ máy tính của bạn
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file || uploadingFile) return;
            setUploadingFile(true);
            setUploadProgress(0);
            try {
              const item = await uploadTaskBoardAttachment(file, setUploadProgress);
              const next = [...attachments, item];
              setAttachments(next);
              await save({ attachments: next });
              toast.success('Đã đính kèm tệp');
              setPanel('detail');
            } catch (err) {
              toast.error(err?.response?.data?.message || err?.message || 'Upload thất bại');
            } finally {
              setUploadingFile(false);
              setUploadProgress(0);
            }
          }}
        />
        <button
          type="button"
          disabled={uploadingFile || saving}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
            isDarkMode ? 'border-white/20 hover:bg-white/10' : 'border-slate-300 hover:bg-slate-50'
          }`}
        >
          {uploadingFile ? `Đang tải lên… ${uploadProgress}%` : 'Chọn tệp'}
        </button>
        <p className={`mb-2 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Hoặc dán liên kết
        </p>
        <input
          value={attachUrl}
          onChange={(e) => setAttachUrl(e.target.value)}
          placeholder="https://..."
          className={`mb-2 w-full rounded-lg border px-2 py-1.5 text-sm outline-none ${inputCls}`}
        />
        <input
          value={attachName}
          onChange={(e) => setAttachName(e.target.value)}
          placeholder="Văn bản hiển thị (không bắt buộc)"
          className={`mb-3 w-full rounded-lg border px-2 py-1.5 text-sm outline-none ${inputCls}`}
        />
        <button
          type="button"
          disabled={!attachUrl.trim() || saving || uploadingFile}
          className="w-full rounded-lg bg-[#0c66e4] py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={async () => {
            const url = attachUrl.trim();
            const name = attachName.trim() || url;
            const next = [...attachments, { url, name }];
            setAttachments(next);
            await save({ attachments: next });
            setAttachUrl('');
            setAttachName('');
            setPanel('detail');
          }}
        >
          Chèn liên kết
        </button>
      </div>
    ) : panel === 'labels' ? (
      <div className={`absolute left-4 right-4 top-24 z-20 w-auto rounded-xl border p-3 sm:right-auto sm:w-64 ${popover}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Nhãn</span>
          <button type="button" onClick={() => setPanel('detail')} className="rounded p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {TASK_BOARD_LABELS.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={saving}
              onClick={() => toggleLabel(l.id)}
              className="flex w-full items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-white/5"
            >
              <span
                className="h-8 flex-1 rounded-md"
                style={{ backgroundColor: l.color, opacity: labelIds.includes(l.id) ? 1 : 0.45 }}
              />
              <span className="text-xs">{labelIds.includes(l.id) ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </div>
    ) : panel === 'dates' ? (
      <div className={`absolute left-4 right-4 top-24 z-20 w-auto rounded-xl border p-3 sm:left-28 sm:right-auto sm:w-72 ${popover}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Ngày</span>
          <button type="button" onClick={() => setPanel('detail')} className="rounded p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className={`mb-1 block text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Ngày hết hạn
        </label>
        <input
          type="datetime-local"
          value={dueDateLocal}
          onChange={(e) => setDueDateLocal(e.target.value)}
          className={`mb-3 w-full rounded-lg border px-2 py-1.5 text-sm outline-none ${inputCls}`}
        />
        <button
          type="button"
          disabled={saving}
          className="mb-2 w-full rounded-lg bg-[#0c66e4] py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={async () => {
            await save({ dueDate: dueDateLocal ? new Date(dueDateLocal).toISOString() : null });
            setPanel('detail');
          }}
        >
          Lưu
        </button>
        <button
          type="button"
          disabled={saving}
          className={`w-full text-sm ${isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
          onClick={async () => {
            setDueDateLocal('');
            await save({ dueDate: null });
            setPanel('detail');
          }}
        >
          Gỡ bỏ
        </button>
      </div>
    ) : panel === 'members' ? (
      <div className={`absolute left-4 right-4 top-24 z-20 max-h-[55vh] w-auto overflow-y-auto rounded-xl border p-3 sm:left-40 sm:right-auto sm:w-72 ${popover}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Thành viên</span>
          <button type="button" onClick={() => setPanel('detail')} className="rounded p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        {loadingMembers ? (
          <p className="text-xs opacity-70">Đang tải thành viên board…</p>
        ) : boardMembers.length === 0 ? (
          <p className="text-xs opacity-70">
            Không có thành viên khả dụng. Kiểm tra vai trò team (role-access) hoặc thành viên team.
          </p>
        ) : (
          <div className="space-y-1">
            <button
              type="button"
              className={`w-full rounded-lg px-2 py-2 text-left text-sm ${!assigneeId ? 'bg-white/10' : 'hover:bg-white/5'}`}
              disabled={saving}
              onClick={async () => {
                setAssigneeId('');
                await save({ assigneeId: null, assigneeName: '', assignees: [] });
                setPanel('detail');
              }}
            >
              Không gán
            </button>
            {boardMembers.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={saving}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                  assigneeId === m.id ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
                onClick={async () => {
                  setAssigneeId(m.id);
                  await save({
                    assigneeId: m.id,
                    assigneeName: m.name,
                    assignees: [{ userId: m.id, displayName: m.name, avatar: m.avatar }],
                  });
                  setPanel('detail');
                }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                  {m.avatar}
                </span>
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>
    ) : null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10070] bg-black/60" onClick={onClose} aria-hidden />
      <div
        className={`fixed left-1/2 top-1/2 z-[10071] flex max-h-[92vh] w-[min(768px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-visible rounded-xl border shadow-2xl ${shell}`}
        role="dialog"
      >
        <div className="relative flex max-h-[92vh] flex-col overflow-hidden rounded-xl lg:flex-row">
          {panelNode}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-2">
              <button
                type="button"
                className={`rounded-lg px-2 py-1 text-xs font-medium ${isDarkMode ? 'bg-white/10' : 'bg-slate-100'}`}
              >
                {listTitle || 'Danh sách'}
              </button>
              <button type="button" onClick={onClose} className="rounded p-1 opacity-70 hover:opacity-100" aria-label="Đóng">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-3 flex items-start gap-2">
              <button
                type="button"
                onClick={toggleComplete}
                disabled={saving}
                title={isDone ? 'Đánh dấu chưa hoàn tất' : 'Đánh dấu hoàn tất'}
                className="mt-0.5 shrink-0 rounded-full disabled:opacity-50"
              >
                {isDone ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                ) : (
                  <Circle className={`h-6 w-6 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                )}
              </button>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  const t = title.trim();
                  if (t && t !== String(card.title || '')) save({ title: t });
                }}
                className={`min-w-0 flex-1 border-0 bg-transparent text-xl font-semibold outline-none ${
                  isDone ? 'text-slate-400 line-through' : isDarkMode ? 'text-white' : 'text-slate-900'
                }`}
              />
            </div>

            {labelIds.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-1">
                {labelIds.map((id) => {
                  const l = labelById(id);
                  if (!l) return null;
                  return (
                    <span
                      key={id}
                      className="h-2 min-w-[40px] rounded-full px-2"
                      style={{ backgroundColor: l.color }}
                      title={id}
                    />
                  );
                })}
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" className={`${toolbarBtn} flex items-center gap-1.5`} onClick={() => setPanel('attach')}>
                <Paperclip className="h-4 w-4" />
                Đính kèm
              </button>
              <button type="button" className={`${toolbarBtn} flex items-center gap-1.5`} onClick={() => setPanel('labels')}>
                <Tag className="h-4 w-4" />
                Nhãn
              </button>
              <button type="button" className={`${toolbarBtn} flex items-center gap-1.5`} onClick={() => setPanel('dates')}>
                <Clock className="h-4 w-4" />
                Ngày
              </button>
              <button type="button" className={`${toolbarBtn} flex items-center gap-1.5`} onClick={() => setPanel('members')}>
                <UserPlus className="h-4 w-4" />
                Thành viên
              </button>
            </div>

            <div className="mb-4">
              <div
                className={`mb-1 text-xs font-semibold uppercase tracking-wide ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Thành viên
              </div>
              <div className="flex items-center gap-1.5">
                {visibleAssignees.map((m, idx) => (
                  <span
                    key={`${m.id}-${idx}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white"
                    title={m.name}
                  >
                    {initialsFromName(m.name)}
                  </span>
                ))}
                {overflowAssignees > 0 ? (
                  <span
                    className={`text-xs font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}
                    title={`${overflowAssignees} thành viên khác`}
                  >
                    +{overflowAssignees}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPanel('members')}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                    isDarkMode
                      ? 'border-white/20 text-slate-200 hover:bg-white/10'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Chọn thành viên"
                >
                  <UserPlus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {dueDateLocal ? (
              <div className={`mb-3 flex items-center gap-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                <Calendar className="h-4 w-4" />
                Hạn: {new Date(dueDateLocal).toLocaleString('vi-VN')}
              </div>
            ) : null}

            {attachments.length > 0 ? (
              <div className="mb-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">Đính kèm</h4>
                <ul className="space-y-1">
                  {attachments.map((a, i) => (
                    <li key={`${a.url}-${i}`}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-cyan-400 hover:underline"
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                        {a.name || a.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mb-2 flex items-center gap-2">
              <AlignLeft className="h-4 w-4 opacity-70" />
              <h4 className="text-sm font-semibold">Mô tả</h4>
              {!editingDescription ? (
                <button
                  type="button"
                  className={`ml-auto text-xs ${isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}
                  onClick={() => setEditingDescription(true)}
                >
                  Chỉnh sửa
                </button>
              ) : null}
            </div>
            {editingDescription ? (
              <div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder="Thêm mô tả chi tiết hơn..."
                  className={`mb-2 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none ${inputCls}`}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-lg bg-[#0c66e4] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={async () => {
                      await save({ description });
                      setEditingDescription(false);
                    }}
                  >
                    Lưu
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}
                    onClick={() => {
                      setDescription(String(card.description || ''));
                      setEditingDescription(false);
                    }}
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : description ? (
              <p className={`whitespace-pre-wrap text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {description}
              </p>
            ) : (
              <button
                type="button"
                className={`w-full rounded-lg border border-dashed px-3 py-6 text-left text-sm ${
                  isDarkMode ? 'border-white/15 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
                onClick={() => setEditingDescription(true)}
              >
                Thêm mô tả chi tiết hơn...
              </button>
            )}
          </div>

          <aside
            className={`flex min-h-[220px] w-full shrink-0 flex-col border-t lg:min-h-0 lg:w-[min(380px,42%)] lg:border-l lg:border-t-0 ${
              isDarkMode ? 'border-white/10 bg-[#22262c]' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className={`flex items-center gap-2 border-b px-4 py-3 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <MessageSquare className="h-4 w-4 opacity-70" />
              <h4 className="text-sm font-semibold">Nhận xét và hoạt động</h4>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="mb-3">
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      submitComment();
                    }
                  }}
                  placeholder="Viết bình luận..."
                  rows={3}
                  className={`w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none ${inputCls}`}
                />
                <button
                  type="button"
                  disabled={!commentDraft.trim() || submittingComment}
                  onClick={submitComment}
                  className="mt-2 rounded-lg bg-[#0c66e4] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submittingComment ? 'Đang gửi…' : 'Gửi bình luận'}
                </button>
                <p className={`mt-1 text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  Ctrl+Enter để gửi nhanh
                </p>
              </div>
              {comments.length === 0 ? (
                <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  Chưa có bình luận. Hãy là người đầu tiên nhận xét.
                </p>
              ) : (
                <ul className="space-y-3">
                  {[...comments]
                    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
                    .map((cm, idx) => {
                      const uid = String(cm.userId || '');
                      const author =
                        commentAuthors[uid] ||
                        (uid === String(user?.id || user?._id) ? user?.displayName || 'Bạn' : uid.slice(-6));
                      return (
                        <li key={`${uid}-${cm.createdAt || idx}`} className="text-sm">
                          <div className="mb-0.5 flex items-baseline gap-2">
                            <span className="font-semibold">{author}</span>
                            {cm.createdAt ? (
                              <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                {new Date(cm.createdAt).toLocaleString('vi-VN')}
                              </span>
                            ) : null}
                          </div>
                          <p className={`whitespace-pre-wrap ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {cm.content}
                          </p>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>,
    document.body
  );
}
