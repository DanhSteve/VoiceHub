// Migrated and adapted from old Chat.tsx component
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Avatar } from '../ui/Avatar';

/** Thời gian tương đối (thay moment.fromNow), theo lang trên <html> */
function formatRelativeTimeFromNow(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return 'Vừa xong';
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const lang =
    typeof document !== 'undefined' && document.documentElement?.lang?.startsWith('vi') ? 'vi' : 'en';
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const a = Math.abs(diffSec);
  if (a < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month');
  const diffYear = Math.round(diffDay / 365);
  return rtf.format(diffYear, 'year');
}

export const ChatMessage = ({
  message,
  sender,
  timestamp,
  profileImage,
  chatImage,
  isOwnMessage,
  messageId,
  onDelete,
  onRecall,
  onEdit,
}) => {
  const formattedTime = timestamp ? formatRelativeTimeFromNow(timestamp) : 'Vừa xong';

  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message);

  const handleEdit = () => {
    if (editedContent.trim() && onEdit) {
      onEdit(messageId, editedContent.trim());
    }
    setIsEditing(false);
  };

  return (
    <motion.div
      initial={{
        x: isOwnMessage ? 200 : -200,
        opacity: 0,
      }}
      transition={{ duration: 0.3 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className={`
        border-b border-gray-600 py-3 flex mb-4 text-sm group
        ${isOwnMessage ? 'bg-gray-600 rounded-md px-2' : 'px-2'}
      `}
      role="article"
      aria-label={`Tin nhắn từ ${sender}`}
      onMouseLeave={() => setShowMenu(false)}
    >
      <Avatar
        src={profileImage}
        alt={`${sender}'s avatar`}
        className="cursor-pointer w-10 h-10 rounded-full mr-3"
      />
      
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span 
              className="font-bold text-blue-400 cursor-pointer hover:underline"
              role="button"
              tabIndex={0}
            >
              {sender}
            </span>
            <time 
              className="font-bold text-gray-400 text-xs"
              dateTime={timestamp ? new Date(timestamp).toISOString() : undefined}
            >
              {formattedTime}
            </time>
          </div>

          {/* Action Menu - Chỉ hiển thị với tin nhắn người dùng */}
          {isOwnMessage && (
            <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 hover:bg-gray-500 rounded transition-colors"
                aria-label="Message actions"
              >
                ⋯
              </button>

              {showMenu && (
                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 min-w-[120px]">
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-gray-200 rounded-t"
                  >
                    ✏️ Sửa
                  </button>
                  <button
                    onClick={() => {
                      if (onRecall) onRecall(messageId);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-gray-200"
                  >
                    ↩️ Thu hồi
                  </button>
                  <button
                    onClick={() => {
                      if (onDelete) onDelete(messageId);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-red-400 rounded-b"
                  >
                    🗑️ Xóa
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        
        {isEditing ? (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="flex-1 bg-gray-700 text-white px-2 py-1 rounded text-sm"
              autoFocus
            />
            <button
              onClick={handleEdit}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
            >
              Lưu
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
            >
              Hủy
            </button>
          </div>
        ) : (
          <>
            {message && (
              <p className="text-white text-base leading-normal break-words mt-1">
                {message}
              </p>
            )}

            {chatImage && (
              <div className="mt-2">
                <img
                  src={chatImage}
                  alt="Chat attachment"
                  className="max-w-xs max-h-60 rounded-md border border-gray-400 object-contain"
                  loading="lazy"
                />
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};
