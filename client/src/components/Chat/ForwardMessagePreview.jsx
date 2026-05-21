import { formatMessagePreview } from '../../features/search/formatMessagePreview';
import { fileDisplayNameFromMessage } from '../../utils/friendChatMedia';
import { fileTypeBadge, formatFileSize } from '../../utils/chatFileDisplay';

function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
}

/**
 * Xem trước tin chuyển tiếp — không hiển thị URL thô.
 */
export default function ForwardMessagePreview({ message, t }) {
  if (!message) return <span className="text-gray-500">—</span>;

  const mt = String(message.messageType || 'text').toLowerCase();
  const content = String(message.content || '').trim();

  if (mt === 'image' && isHttpUrl(content)) {
    const name = message?.fileMeta?.originalName || '';
    return (
      <div className="flex items-center gap-3">
        <img src={content} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        <p className="text-sm text-gray-200">{formatMessagePreview(message, t)}</p>
      </div>
    );
  }

  if (mt === 'file' && isHttpUrl(content)) {
    const fb = t?.('friendChat.fileAttachment') || 'Tệp';
    const name = fileDisplayNameFromMessage(message, fb);
    const badge = fileTypeBadge(name, message?.fileMeta?.mimeType);
    const size = formatFileSize(message?.fileMeta?.byteSize);
    return (
      <div className="flex items-center gap-3">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${badge.bg}`}
        >
          {badge.letter}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{name}</p>
          <p className="text-xs text-gray-400">{size}</p>
        </div>
      </div>
    );
  }

  return (
    <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-gray-300">
      {formatMessagePreview(message, t)}
    </p>
  );
}
