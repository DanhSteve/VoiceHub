import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Modal } from '../Shared';
import aiTaskService from '../../services/aiTaskService';
import { AI_TASK_TOOLTIP_SHORT } from '../../utils/aiTaskEligibility';
import { sanitizeMentionsForApi } from '../../utils/parseMessageMentions';
import {
  taskAPI,
  unwrapTaskBoardDetailPayload,
  unwrapTaskBoardListPayload,
} from '../../services/api/taskAPI';

const POLL_MS = 2000;
const MAX_POLLS = 90;

/**
 * Modal: gọi extract → poll draft → xác nhận tạo task.
 */
export default function CreateTaskFromAiModal({
  isOpen,
  onClose,
  messageId,
  organizationId,
  currentUserId,
  messagePreview = '',
  mentions = [],
  channelId = null,
  teamId = null,
  onConfirmed,
}) {
  const [phase, setPhase] = useState('idle'); // idle | queued | ready | failed
  const [extractionId, setExtractionId] = useState(null);
  const [extraction, setExtraction] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [taskBoards, setTaskBoards] = useState([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [listsLoading, setListsLoading] = useState(false);
  const [taskLists, setTaskLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState('');

  const userHeaders = useMemo(
    () => (currentUserId ? { 'x-user-id': String(currentUserId) } : {}),
    [currentUserId]
  );
  const startedRef = useRef(false);

  const reset = useCallback(() => {
    setPhase('idle');
    setExtractionId(null);
    setExtraction(null);
    setError('');
    setConfirming(false);
    setTaskBoards([]);
    setSelectedBoardId('');
    setTaskLists([]);
    setSelectedListId('');
  }, []);

  useEffect(() => {
    if (!isOpen) {
      startedRef.current = false;
      reset();
      return;
    }
    if (!messageId || !organizationId || !currentUserId) {
      setError('Thiếu thông tin tin nhắn hoặc tổ chức.');
      setPhase('failed');
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    const run = async () => {
      setPhase('queued');
      setError('');
      try {
        const res = await aiTaskService.extract(
          {
            messageId: String(messageId),
            organizationId: String(organizationId),
            mentions: sanitizeMentionsForApi(mentions),
            channelId: channelId ? String(channelId) : undefined,
          },
          userHeaders
        );
        const id = res?.data?.extractionId || res?.data?.data?.extractionId || res?.extractionId;
        if (!id) throw new Error(res?.message || 'Không nhận được extractionId');
        if (cancelled) return;
        setExtractionId(id);

        for (let i = 0; i < MAX_POLLS; i++) {
          if (cancelled) return;
          const poll = await aiTaskService.getExtraction(id, userHeaders);
          const row = poll?.data ?? poll?.data?.data ?? poll;
          setExtraction(row);
          const st = row?.status;
          if (st === 'ready' || st === 'confirmed') {
            setPhase('ready');
            return;
          }
          if (st === 'failed') {
            setPhase('failed');
            setError(row?.error || 'Phân tích thất bại.');
            return;
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
        setPhase('failed');
        setError('Hết thời gian chờ kết quả AI.');
      } catch (e) {
        if (cancelled) return;
        setPhase('failed');
        setError(e?.response?.data?.message || e?.message || 'Lỗi không xác định');
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, messageId, organizationId, currentUserId, mentions, channelId, reset, userHeaders]);

  // Load board/list theo team của kênh chat
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isOpen) return;
      if (!organizationId || !teamId) return;
      setBoardsLoading(true);
      try {
        const res = await taskAPI.getBoards({
          organizationId: String(organizationId),
          teamId: String(teamId),
        });
        const boards = unwrapTaskBoardListPayload(res);
        if (cancelled) return;
        setTaskBoards(boards);
        const firstBoard = boards[0]?._id || boards[0]?.id;
        if (firstBoard && !selectedBoardId) setSelectedBoardId(String(firstBoard));
      } catch {
        if (cancelled) return;
        setTaskBoards([]);
      } finally {
        if (cancelled) return;
        setBoardsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationId, teamId, selectedBoardId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isOpen) return;
      if (!selectedBoardId) return;
      setListsLoading(true);
      try {
        const res = await taskAPI.getBoardDetail(String(selectedBoardId));
        const detail = unwrapTaskBoardDetailPayload(res);
        const lists = Array.isArray(detail?.lists) ? detail.lists : [];
        if (cancelled) return;
        setTaskLists(lists);
        if (lists.length) {
          const firstList = lists[0]?._id || lists[0]?.id;
          if (firstList && !selectedListId) setSelectedListId(String(firstList));
        }
      } catch {
        if (cancelled) return;
        setTaskLists([]);
        setSelectedListId('');
      } finally {
        if (cancelled) return;
        setListsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedBoardId, selectedListId]);

  const draft = extraction?.draft || {};
  const assigneeId = draft.assigneeId ? String(draft.assigneeId) : '';

  const resolvedAssigneeId = useMemo(() => {
    if (assigneeId && /^[a-f0-9]{24}$/i.test(assigneeId)) return assigneeId;
    const fromMention = sanitizeMentionsForApi(mentions)[0]?.userId;
    return fromMention && /^[a-f0-9]{24}$/i.test(fromMention) ? fromMention : '';
  }, [assigneeId, mentions]);

  const handleConfirm = async () => {
    if (!extractionId || confirming) return;
    setConfirming(true);
    setError('');
    try {
      const body = { extractionId };
      if (resolvedAssigneeId) body.assigneeId = resolvedAssigneeId;
      body.boardId = selectedBoardId || undefined;
      body.listId = selectedListId || undefined;
      if (!body.boardId || !body.listId) {
        throw new Error('Chưa chọn Task Board hoặc Danh sách trong board');
      }
      const res = await aiTaskService.confirm(body, userHeaders);
      const taskId = res?.data?.taskId || res?.data?.data?.taskId || res?.taskId;
      onConfirmed?.(taskId, extractionId);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Không tạo được task');
    } finally {
      setConfirming(false);
    }
  };

  const title = draft.title || '(Chưa có tiêu đề)';
  const summary = draft.summary || '';
  const description = draft.description || '';
  const priority = draft.priority || 'medium';
  const assigneeName = draft.assigneeName || '';
  const departmentName = draft.departmentName || '';
  const dueLabel = draft.dueDate
    ? new Date(draft.dueDate).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
    : '';
  const draftAttachments = Array.isArray(draft.attachments) ? draft.attachments : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tạo task bằng AI" size="lg">
      <p className="mb-3 text-xs text-slate-400" title={AI_TASK_TOOLTIP_SHORT}>
        Phân tích nội dung tin nhắn để gợi ý task. Bạn có thể chỉnh sau trong mục Task.
      </p>
      {messagePreview ? (
        <div className="mb-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300 line-clamp-4">
          {messagePreview}
        </div>
      ) : null}

      {phase === 'queued' && (
        <div className="py-8 text-center text-sm text-slate-300">Đang phân tích bằng AI…</div>
      )}

      {phase === 'failed' && error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}

      {phase === 'ready' && (
        <div className="space-y-3">
          {(teamId && (!selectedBoardId || !selectedListId)) ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Chọn Task Board và Danh sách để tạo task.
            </div>
          ) : null}
          {!dueLabel ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              Tin nhắn chưa có ngày/giờ deadline rõ ràng nên chưa thể tạo task tự động.
            </div>
          ) : null}

          {teamId ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Task Board</div>
                <select
                  value={selectedBoardId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedBoardId(v);
                    setSelectedListId('');
                  }}
                  disabled={boardsLoading || !taskBoards.length}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                >
                  {taskBoards.length === 0 ? <option value="">Chưa có board</option> : null}
                  {taskBoards.map((b) => (
                    <option key={b._id || b.id} value={String(b._id || b.id)}>
                      {b.title}
                    </option>
                  ))}
                </select>
                {boardsLoading ? <div className="mt-1 text-[10px] text-slate-400">Đang tải board...</div> : null}
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Danh sách</div>
                <select
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  disabled={listsLoading || !taskLists.length}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                >
                  {taskLists.length === 0 ? <option value="">Chưa có list</option> : null}
                  {taskLists.map((l) => (
                    <option key={l._id || l.id} value={String(l._id || l.id)}>
                      {l.title}
                    </option>
                  ))}
                </select>
                {listsLoading ? <div className="mt-1 text-[10px] text-slate-400">Đang tải list...</div> : null}
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Tiêu đề gợi ý</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">{title}</div>
          </div>
          {summary ? (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Tóm tắt</div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                {summary}
              </div>
            </div>
          ) : null}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Mô tả chi tiết</div>
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
              {description || '—'}
            </div>
          </div>
          {mentions.length > 0 && !resolvedAssigneeId && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Đã @mention nhưng chưa xác định được người nhận — task có thể không hiện với người được giao.
            </div>
          )}
          {(assigneeName || resolvedAssigneeId || departmentName || dueLabel) && (
            <div className="grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
              {assigneeName || resolvedAssigneeId ? (
                <div>
                  Người nhận:{' '}
                  <span className="text-slate-200">{assigneeName || 'Đã chọn từ @mention'}</span>
                </div>
              ) : null}
              {departmentName ? (
                <div>
                  Phòng ban: <span className="text-slate-200">{departmentName}</span>
                </div>
              ) : null}
              {dueLabel ? (
                <div>
                  Hạn: <span className="text-slate-200">{dueLabel}</span>
                </div>
              ) : null}
            </div>
          )}
          {draftAttachments.length > 0 ? (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Tệp đính kèm tự chọn</div>
              <ul className="space-y-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                {draftAttachments.map((a, idx) => (
                  <li key={`${a.url || a.name}-${idx}`} className="truncate">
                    • {a.name || a.url}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="text-xs text-slate-400">
            Độ ưu tiên gợi ý: <span className="text-slate-200">{priority}</span>
            {extraction?.confidence != null && (
              <>
                {' '}
                · Độ tin cậy: <span className="text-slate-200">{(Number(extraction.confidence) * 100).toFixed(0)}%</span>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={
                confirming ||
                !dueLabel ||
                (teamId ? (!selectedBoardId || !selectedListId) : false)
              }
              onClick={handleConfirm}
              className="rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752c4] disabled:opacity-50"
            >
              {confirming ? 'Đang tạo…' : 'Tạo task'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
