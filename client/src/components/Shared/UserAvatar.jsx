import { isAvatarImageUrl, displayInitials } from '../../utils/avatarDisplay';

const SIZE_CLASS = {
  xs: 'h-7 w-7 text-[9px]',
  sm: 'h-9 w-9 text-[10px]',
  md: 'h-10 w-10 text-[10px]',
  lg: 'h-14 w-14 text-sm',
  xl: 'h-20 w-20 text-2xl',
};

/**
 * Avatar thống nhất: ảnh URL hoặc initials — không dùng emoji làm avatar lớn.
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
}) {
  const sizeCls = SIZE_CLASS[size] || SIZE_CLASS.md;
  const clickable = typeof onClick === 'function';
  const Wrapper = clickable ? 'button' : 'div';
  const isOnline = status === 'online';

  return (
    <Wrapper
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={`relative inline-flex shrink-0 ${clickable ? 'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50' : ''} ${className}`}
    >
      <span
        className={`flex items-center justify-center overflow-hidden rounded-full font-bold tracking-tight ${sizeCls} ${ringClassName}`}
      >
        {isAvatarImageUrl(avatar) ? (
          <img src={avatar.trim()} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="select-none">{displayInitials(name)}</span>
        )}
      </span>
      {showOnline && (
        <span
          className={`pointer-events-none absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-inherit ${
            size === 'xl' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'
          } ${isOnline ? 'bg-emerald-500' : 'bg-zinc-500'}`}
          aria-hidden
        />
      )}
    </Wrapper>
  );
}
