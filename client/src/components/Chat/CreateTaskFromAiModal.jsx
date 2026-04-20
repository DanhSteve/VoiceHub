import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Modal } from '../Shared';
import aiTaskService from '../../services/aiTaskService';
import { AI_TASK_TOOLTIP_SHORT } from '../../utils/aiTaskEligibility';

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
  onConfirmed,
}) {
  const [phase, setPhase] = useState('idle'); // idle | queued | ready | failed
  const [extractionId, setExtractionId] = useState(null);
  const [extraction, setExtraction] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

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
  }, [isOpen, messageId, organizationId, currentUserId, reset, userHeaders]);

  const handleConfirm = async () => {
    if (!extractionId || confirming) return;
    setConfirming(true);
    setError('');
    try {
      const res = await aiTaskService.confirm({ extractionId }, userHeaders);
      const taskId = res?.data?.taskId || res?.data?.data?.taskId || res?.taskId;
      onConfirmed?.(taskId, extractionId);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Không tạo được task');
    } finally {
      setConfirming(false);
    }
  };

  const draft = extraction?.draft || {};
  const title = draft.title || '(Chưa có tiêu đề)';
  const description = draft.description || '';
  const priority = draft.priority || 'medium';

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
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Tiêu đề gợi ý</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">{title}</div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Mô tả</div>
            <div className="max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
              {description || '—'}
            </div>
          </div>
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
              disabled={confirming}
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
