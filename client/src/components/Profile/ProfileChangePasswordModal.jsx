import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GradientButton } from '../Shared';
import authService from '../../services/authService';
import { useAppStrings } from '../../locales/appStrings';
import { notify } from '../../utils/appToast';

export default function ProfileChangePasswordModal({
  isOpen,
  isDarkMode,
  email,
  onBack,
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const inputClass =
    'w-full rounded-xl border px-4 py-3 outline-none transition-all ' +
    (isDarkMode
      ? 'border-white/20 bg-white/5 text-white placeholder:text-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40'
      : 'border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/25');

  const labelClass = isDarkMode
    ? 'mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400'
    : 'mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600';

  const headingClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const mutedClass = isDarkMode ? 'text-gray-400' : 'text-slate-600';
  const shellClass = isDarkMode
    ? 'w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-2xl'
    : 'w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl';
  const ghostBtn = isDarkMode
    ? 'rounded-xl px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white'
    : 'rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900';

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword.trim()) {
      notify.error(t('profileModal.pwErrCurrent'));
      return;
    }
    if (newPassword.length < 8) {
      notify.error(t('profileModal.pwErrNewMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      notify.error(t('profileModal.pwErrConfirm'));
      return;
    }
    try {
      setSaving(true);
      await authService.changePassword(currentPassword, newPassword);
      notify.success(t('profileModal.pwOk'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onBack?.();
    } catch (err) {
      notify.error(err?.message || t('profileModal.pwFail'));
    } finally {
      setSaving(false);
    }
  };

  const handleForgot = () => {
    onBack?.();
    const q = email ? `?email=${encodeURIComponent(email)}` : '';
    navigate(`/forgot-password${q}`);
  };

  return (
    <div
      className="absolute inset-0 z-[100002] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-change-password-title"
    >
      <form className={shellClass} onSubmit={handleSubmit}>
        <h3 id="profile-change-password-title" className={`mb-1 text-lg font-bold ${headingClass}`}>
          {t('profileModal.changePasswordTitle')}
        </h3>
        <p className={`mb-5 text-sm ${mutedClass}`}>{t('profileModal.changePasswordSub')}</p>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>{t('profileModal.pwCurrent')}</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('profileModal.pwNew')}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('profileModal.pwConfirm')}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={ghostBtn} onClick={onBack}>
            {t('profileModal.pwBack')}
          </button>
          <button type="button" className={`text-sm font-semibold ${isDarkMode ? 'text-cyan-400 hover:underline' : 'text-cyan-700 hover:underline'}`} onClick={handleForgot}>
            {t('profileModal.pwForgot')}
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className={ghostBtn} onClick={onBack} disabled={saving}>
            {t('nav.cancel')}
          </button>
          <GradientButton type="submit" variant="primary" disabled={saving}>
            {saving ? t('profileModal.saving') : t('profileModal.pwSubmit')}
          </GradientButton>
        </div>
      </form>
    </div>
  );
}
