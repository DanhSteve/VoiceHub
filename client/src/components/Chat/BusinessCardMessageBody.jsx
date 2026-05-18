import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useAppStrings } from '../../locales/appStrings';
import friendService from '../../services/friendService';
import {
  getBusinessCardFields,
  looksLikeEmail,
  resolveBusinessCardFields,
} from '../../features/search/businessCardDisplay';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

function displayPhone(phone) {
  const s = String(phone || '').trim();
  return s || '—';
}

function displayEmail(email) {
  const s = String(email || '').trim();
  return s && looksLikeEmail(s) ? s : '—';
}

/**
 * Danh thiếp trong bubble chat — enrich profile, nút kết bạn / nhắn tin điều hướng đúng.
 */
export default function BusinessCardMessageBody({ message }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useAppStrings();
  const currentUserId = String(user?.userId || user?._id || user?.id || '').trim();

  const [fields, setFields] = useState(() => getBusinessCardFields(message));
  const [friendBusy, setFriendBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFields(getBusinessCardFields(message));
    resolveBusinessCardFields(message).then((resolved) => {
      if (!cancelled) setFields(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [message?._id, message?.id, message?.content, message?.__businessCard]);

  const targetUserId = String(fields.userId || '').trim();
  const fullName = String(fields.fullName || '—').trim() || '—';
  const phone = displayPhone(fields.phone);
  const email = displayEmail(fields.email);
  const canActOnUser = Boolean(targetUserId && OBJECT_ID_RE.test(targetUserId) && targetUserId !== currentUserId);

  const goToFriendChat = () => {
    if (!canActOnUser) {
      toast.error(t('orgPanel.contactActionNeedUser'));
      return;
    }
    navigate('/chat/friends', {
      state: {
        openDmUserId: targetUserId,
        composeText: t('orgPanel.contactDmGreeting', { name: fullName }),
      },
    });
  };

  const handleAddFriend = async () => {
    if (!canActOnUser || friendBusy) return;
    setFriendBusy(true);
    try {
      await friendService.sendRequest(targetUserId);
      toast.success(t('orgPanel.contactFriendSent'));
    } catch (err) {
      const msg = err?.message || err?.data?.message || t('orgPanel.contactFriendFail');
      toast.error(msg);
    } finally {
      setFriendBusy(false);
    }
  };

  return (
    <div className="min-w-[220px] rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white">
          {String(fullName).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/70">
            {t('orgPanel.contactCardLabel')}
          </div>
          <div className="truncate text-sm font-semibold text-white">
            {t('orgPanel.contactName', { name: fullName })}
          </div>
          <div className="truncate text-xs text-cyan-100/75">{t('orgPanel.contactPhone', { phone })}</div>
          <div className="truncate text-xs text-cyan-100/75">{t('orgPanel.contactEmail', { email })}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canActOnUser || friendBusy}
          onClick={handleAddFriend}
          className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {friendBusy ? t('orgPanel.contactFriendSending') : t('orgPanel.contactAddFriend')}
        </button>
        <button
          type="button"
          disabled={!canActOnUser}
          onClick={goToFriendChat}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('orgPanel.contactMessage')}
        </button>
      </div>
    </div>
  );
}
