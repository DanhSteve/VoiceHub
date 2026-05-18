/**
 * Menu ngữ cảnh — dùng chung sidebar và lightbox ảnh/video.
 */
export function buildMediaAttachmentMenuItems({
  item,
  message,
  canDelete,
  t,
  onAction,
}) {
  const items = [
    {
      id: 'copy',
      label: t('friendChat.mediaCopy'),
      icon: '📋',
      onClick: () =>
        onAction?.('copy', { messageId: item.id, url: item.url, message }),
    },
    {
      id: 'share',
      label: t('friendChat.mediaShare'),
      icon: '↗',
      onClick: () => onAction?.('share', { messageId: item.id, message }),
    },
    {
      id: 'jump',
      label: t('friendChat.jumpToMessage'),
      icon: '💬',
      onClick: () => onAction?.('jumpToMessage', { messageId: item.id }),
    },
    {
      id: 'save',
      label: t('friendChat.mediaSaveDevice'),
      icon: '💾',
      onClick: () =>
        onAction?.('saveDevice', {
          messageId: item.id,
          url: item.url,
          name: item.url,
        }),
    },
  ];

  if (canDelete) {
    items.push({
      id: 'delete',
      label: t('friendChat.mediaDeleteForMe'),
      icon: '🗑',
      danger: true,
      onClick: () => onAction?.('delete', { messageId: item.id, message }),
    });
  }

  return items;
}
