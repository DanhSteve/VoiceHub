import { useMemo } from 'react';
import { tokenizeMessageMentions } from '../../utils/tokenizeMessageMentions';

const MENTION_CLASS = {
  org: {
    dark: 'font-semibold text-[#8BA3F5] hover:text-[#A8B8F8]',
    light: 'font-semibold text-[#4F6BED] hover:text-[#3D58D4]',
  },
  friend: {
    dark: 'font-semibold text-cyan-300 hover:text-cyan-200',
    light: 'font-semibold text-cyan-700 hover:text-cyan-800',
  },
};

/**
 * Hiển thị nội dung tin — @mention tách màu (org = accent enterprise).
 */
export default function ChatMessageText({
  text,
  mentionVariant = null,
  mentionLabels = [],
  isDarkMode = true,
  className = '',
}) {
  const parts = useMemo(
    () => tokenizeMessageMentions(text, mentionLabels),
    [text, mentionLabels]
  );
  const mentionCls =
    mentionVariant && MENTION_CLASS[mentionVariant]
      ? MENTION_CLASS[mentionVariant][isDarkMode ? 'dark' : 'light']
      : '';

  if (!mentionCls) {
    return <div className={className}>{text}</div>;
  }

  return (
    <div className={className}>
      {parts.map((part, idx) =>
        part.type === 'mention' ? (
          <span key={`m-${idx}`} className={mentionCls}>
            {part.value}
          </span>
        ) : (
          <span key={`t-${idx}`}>{part.value}</span>
        )
      )}
    </div>
  );
}
