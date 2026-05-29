import { PhoneIncoming, PhoneOutgoing, Video } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import {
  formatFriendCallDuration,
  parseFriendCallLog,
  peerIdForCallLogCallback,
} from '../../utils/friendCallLog';

/**
 * Thẻ log cuộc gọi 1-1 trong DM (giống Teams/Discord call history).
 */
export default function FriendCallLogMessage({ message, currentUserId, onCallBack }) {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const log = parseFriendCallLog(message?.content);
  if (!log) return null;

  const me = String(currentUserId || '').trim();
  const isOutgoing = me && me === String(log.callerId);
  const media = log.media === 'audio' ? 'audio' : 'video';
  const titleKey =
    media === 'video'
      ? isOutgoing
        ? 'friendChat.callLogOutgoingVideo'
        : 'friendChat.callLogIncomingVideo'
      : isOutgoing
        ? 'friendChat.callLogOutgoingAudio'
        : 'friendChat.callLogIncomingAudio';

  const durationLabel = formatFriendCallDuration(log.durationSec, t);
  const peerId = peerIdForCallLogCallback(me, log);
  const canCallBack = Boolean(peerId && typeof onCallBack === 'function');

  const shell = isDarkMode
    ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-50'
    : 'border-cyan-200 bg-cyan-50/90 text-slate-900';
  const meta = isDarkMode ? 'text-cyan-100/75' : 'text-slate-600';
  const divider = isDarkMode ? 'border-cyan-500/25' : 'border-cyan-200';
  const actionBtn = isDarkMode
    ? 'text-cyan-200 hover:bg-cyan-500/15'
    : 'text-cyan-700 hover:bg-cyan-100';

  const CallIcon =
    media === 'video' ? Video : isOutgoing ? PhoneOutgoing : PhoneIncoming;
  const callIconCls =
    media === 'video'
      ? 'text-violet-400'
      : isOutgoing
        ? 'text-emerald-400'
        : 'text-sky-400';

  return (
    <div className={`min-w-[220px] max-w-sm rounded-xl border p-3 ${shell}`}>
      <p className="text-sm font-semibold leading-snug">{t(titleKey)}</p>
      <div className={`mt-2 flex items-center gap-2 text-sm ${meta}`}>
        <CallIcon className={`h-4 w-4 shrink-0 ${callIconCls}`} aria-hidden />
        <span>{durationLabel}</span>
      </div>
      {canCallBack ? (
        <>
          <div className={`my-2.5 border-t ${divider}`} />
          <button
            type="button"
            onClick={() => onCallBack(media, peerId)}
            className={`w-full rounded-lg py-1.5 text-center text-sm font-semibold transition ${actionBtn}`}
          >
            {t('friendChat.callLogCallBack')}
          </button>
        </>
      ) : null}
    </div>
  );
}
