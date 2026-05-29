import { useEffect, useState } from 'react';
import {
  AVATAR_TEXT_CLASS,
  avatarImageShellClassName,
  avatarPlaceholderClassName,
  displayInitials,
  isAvatarImageUrl,
  needsAuthenticatedAvatarFetch,
  pickAvatarValue,
  resolveAvatarSrc,
} from '../../utils/avatarDisplay';
import { fetchProtectedAvatarBlob } from '../../utils/protectedMediaFetch';

/**
 * Avatar thống nhất: ảnh (URL/upload) hoặc initials trên nền màu — bo góc rounded-xl.
 */
export default function UserAvatar({
  avatar,
  userId = null,
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
  const [authAvatarUrl, setAuthAvatarUrl] = useState(null);
  const avatarValue = pickAvatarValue(avatar);
  const useAuthFetch = needsAuthenticatedAvatarFetch(avatarValue);

  useEffect(() => {
    setImgFailed(false);
  }, [avatarValue, cacheBust, userId]);

  useEffect(() => {
    if (!useAuthFetch) {
      setAuthAvatarUrl(null);
      return undefined;
    }

    let cancelled = false;
    let objectUrl = null;

    (async () => {
      try {
        const blob = await fetchProtectedAvatarBlob({
          userId: userId || null,
          avatar: avatarValue,
          cacheBust,
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAuthAvatarUrl(objectUrl);
      } catch {
        if (!cancelled) {
          setAuthAvatarUrl(null);
          setImgFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setAuthAvatarUrl(null);
    };
  }, [useAuthFetch, userId, avatarValue, cacheBust]);

  const clickable = typeof onClick === 'function';
  const Wrapper = clickable ? 'button' : 'div';
  const isOnline = status === 'online';
  const resolvedSrc = useAuthFetch ? authAvatarUrl : resolveAvatarSrc(avatarValue, cacheBust, userId);
  const hasImage = isAvatarImageUrl(avatarValue) && !imgFailed && Boolean(resolvedSrc);
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
            src={resolvedSrc}
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
