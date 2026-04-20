import Modal from './Modal';

const sanitizeNoticeMessage = (rawMessage) => {
  const message = String(rawMessage || '')
    .replace(/https?:\/\/localhost(?::\d+)?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return message || 'Thao tác đã được xử lý.';
};

function NotificationModal({ notice, onClose, layerClassName = 'z-[200]' }) {
  const type = notice?.type || 'success';
  const title = notice?.title || (type === 'fail' ? 'Thông báo lỗi' : type === 'info' ? 'Thông tin' : 'Thông báo');
  const message = sanitizeNoticeMessage(notice?.message);

  return (
    <Modal isOpen={Boolean(notice)} onClose={onClose} title={title} size="sm" layerClassName={layerClassName}>
      <div className="space-y-4">
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            type === 'fail'
              ? 'border-red-400/30 bg-red-500/10 text-red-200'
              : type === 'info'
                ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
          }`}
        >
          {message}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Đóng
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default NotificationModal;
