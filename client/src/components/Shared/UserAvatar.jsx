import { useEffect, useState } from 'react';
import {
  AVATAR_TEXT_CLASS,
  avatarImageShellClassName,
  avatarPlaceholderClassName,
  displayInitials,
  isAvatarImageUrl,
  pickAvatarValue,
  resolveAvatarSrc,
} from '../../utils/avatarDisplay';

/**
 * Avatar thống nhất: ảnh (URL/upload) hoặc initials trên nền màu — bo góc rounded-xl.
 */
export default function UserAvatar({
  avatar,
  name = '',
  size = 'md',
  className = '',
  ringClassName = '',
  onClick,
  showOnline = false,
  status = 'offline',
  title,
  cacheBust,
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const avatarValue = pickAvatarValue(avatar);

  useEffect(() => {
    setImgFailed(false);
  }, [avatarValue, cacheBust]);

  const clickable = typeof onClick === 'function';
  const Wrapper = clickable ? 'button' : 'div';
  const isOnline = status === 'online';
  const hasImage = isAvatarImageUrl(avatarValue) && !imgFailed;
  const shellClass = hasImage
    ? avatarImageShellClassName(size, ringClassName)
    : avatarPlaceholderClassName(name, size, ringClassName);

  return (
    <Wrapper
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={`relative shrink-0 ${clickable ? 'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50' : ''} ${className}`}
    >
      <span className={shellClass}>
        {hasImage ? (
          <img
            src={resolveAvatarSrc(avatarValue, cacheBust)}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className={AVATAR_TEXT_CLASS}>{displayInitials(name)}</span>
        )}
      </span>
      {showOnline && (
        <span
          className={`pointer-events-none absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-inherit ${
            size === 'xl' || size === '2xl' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'
          } ${isOnline ? 'bg-emerald-500' : 'bg-zinc-500'}`}
          aria-hidden
        />
      )}
    </Wrapper>
  );
}
