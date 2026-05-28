import UserAvatar from '../Shared/UserAvatar';
import { getUserDisplayName } from '../../utils/helpers';

const SIZE_MAP = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
};

/**
 * Wrapper legacy — dùng UserAvatar thống nhất (initials + bo góc rounded-xl).
 */
const Avatar = ({ user, size = 'md', online = false, className = '' }) => {
  const displayName = getUserDisplayName(user);
  return (
    <UserAvatar
      avatar={user?.avatar}
      name={displayName}
      size={SIZE_MAP[size] || 'md'}
      showOnline={online}
      status={online ? 'online' : 'offline'}
      className={className}
      cacheBust={user?.avatarCacheKey}
    />
  );
};

export default Avatar;
export { Avatar };
