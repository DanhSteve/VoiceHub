import Modal from '../Shared/Modal';
import UserAvatar from '../Shared/UserAvatar';
import { looksLikeEmail } from '../../features/search/businessCardDisplay';
import { useAppStrings } from '../../locales/appStrings';

function fieldOrDash(value) {
  const s = String(value || '').trim();
  return s || '—';
}

export default function FriendProfileModal({
  isOpen,
  onClose,
  friend,
  onMessage,
}) {
  const { t } = useAppStrings();
  if (!friend) return null;

  const email = friend.email && looksLikeEmail(friend.email) ? friend.email : '';
  const username = friend.username ? `@${friend.username}` : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('friendChat.profileTitle')} size="lg">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <UserAvatar
          avatar={friend.avatar}
          name={friend.name}
          size="xl"
          showOnline
          status={friend.status}
          ringClassName="ring-4 ring-cyan-500/30 bg-gradient-to-br from-cyan-600/20 to-teal-600/20 text-white"
        />
        <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
          <div>
            <h3 className="text-xl font-bold">{friend.name}</h3>
            {username && (
              <p className="text-sm text-cyan-600 dark:text-cyan-300/90">
                {t('friendChat.profileUsername')}: {username}
              </p>
            )}
            <p className="mt-1 text-sm opacity-80">
              {friend.status === 'online' ? t('friendChat.online') : t('friendChat.offline')}
            </p>
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide opacity-60">
                {t('friendChat.profilePhone')}
              </dt>
              <dd className="font-medium">{fieldOrDash(friend.phone)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide opacity-60">
                {t('friendChat.profileEmail')}
              </dt>
              <dd className="break-all font-medium">{email || '—'}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => {
              onMessage?.();
              onClose?.();
            }}
            className="rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:brightness-110"
          >
            {t('friendChat.profileMessage')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
