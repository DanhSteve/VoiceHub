import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { GradientButton, NotificationModal } from '../../components/Shared';
import { getUserDisplayName, getInitials, getAvatarColor, formatBirthDateSafe } from '../../utils/helpers';
import { useAppStrings } from '../../locales/appStrings';

function ProfileModal({ isOpen, onClose }) {
  const { user: authUser } = useAuth();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', phone: '', status: 'online', isInvisible: false });
  const [activeProfileTab, setActiveProfileTab] = useState('main');
  const [notice, setNotice] = useState(null);

  const inputClass =
    'w-full rounded-xl border px-4 py-3 outline-none transition-all ' +
    (isDarkMode
      ? 'border-white/20 bg-white/5 text-white placeholder:text-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40'
      : 'border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/25');

  const labelClass = isDarkMode
    ? 'mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400'
    : 'mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600';

  const panelClass = isDarkMode
    ? 'space-y-3 rounded-xl border border-white/10 bg-white/5 p-4'
    : 'space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm';

  const infoBoxClass = isDarkMode
    ? 'rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300'
    : 'rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 shadow-sm';

  const headingClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const mutedClass = isDarkMode ? 'text-gray-400' : 'text-slate-600';
  const subheadingClass = isDarkMode ? 'text-gray-300' : 'text-slate-700';

  const optionClass = isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800';

  const rowHoverClass = isDarkMode
    ? 'flex cursor-pointer items-center justify-between rounded-xl bg-black/30 px-3 py-2 transition-colors hover:bg-black/40'
    : 'flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 transition-colors hover:bg-slate-50';

  const overlayClass = isDarkMode ? 'bg-black/70' : 'bg-slate-900/45';
  const shellClass = isDarkMode
    ? 'max-h-[80vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/95 shadow-2xl'
    : 'max-h-[80vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl';
  const headerClass = isDarkMode
    ? 'flex items-center justify-between border-b border-white/10 bg-black/40 px-6 py-4'
    : 'flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4';
  const tabsBarClass = isDarkMode
    ? 'flex gap-2 border-b border-white/10 bg-black/30 px-6 pt-3'
    : 'flex gap-2 border-b border-slate-200 bg-white px-6 pt-3';
  const tabActive = isDarkMode ? 'border-cyan-400 text-white' : 'border-cyan-600 text-slate-900';
  const tabInactive = isDarkMode
    ? 'border-transparent text-gray-400 hover:text-white'
    : 'border-transparent text-slate-500 hover:text-slate-800';
  const bodyScrollClass = isDarkMode
    ? 'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 md:flex-row'
    : 'flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 md:flex-row';
  const footerClass = isDarkMode
    ? 'flex justify-end gap-3 border-t border-white/10 bg-black/40 px-6 py-4'
    : 'flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4';
  const ghostFooterBtn = isDarkMode
    ? 'rounded-xl px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white'
    : 'rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900';
  const previewCardClass = isDarkMode
    ? 'space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-purple-900/80 via-slate-900 to-black p-5 shadow-lg'
    : 'space-y-4 rounded-2xl border border-slate-200 bg-gradient-to-b from-cyan-50 via-white to-slate-50 p-5 shadow-md';
  const previewBioClass = isDarkMode
    ? 'h-24 overflow-hidden rounded-xl border border-white/5 bg-black/40 p-3 text-xs text-gray-300'
    : 'h-24 overflow-hidden rounded-xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-600';
  const avatarRing = isDarkMode ? 'border-slate-900' : 'border-white';
  const avatarOverlay = isDarkMode
    ? 'absolute inset-0 flex cursor-pointer flex-col items-center justify-center rounded-full bg-black/50 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100'
    : 'absolute inset-0 flex cursor-pointer flex-col items-center justify-center rounded-full bg-slate-900/45 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100';

  const showNotice = useCallback((message, type = 'success') => {
    setNotice({
      type,
      title:
        type === 'fail'
          ? t('profileModal.noticeFailTitle')
          : type === 'info'
            ? t('profileModal.noticeInfoTitle')
            : t('profileModal.noticeSuccessTitle'),
      message,
    });
  }, [t]);

  const unwrapProfilePayload = (payload) => {
    const body = payload?.data ?? payload;
    return body?.data ?? body;
  };

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/users/me');
      const data = unwrapProfilePayload(res);
      setProfile(data);
      const phoneValue =
        data?.phone ??
        data?.profile?.phone ??
        data?.phoneNumber ??
        data?.profile?.phoneNumber ??
        data?.mobile ??
        data?.profile?.mobile ??
        '';
      setForm({
        displayName: data?.displayName ?? data?.username ?? '',
        bio: data?.bio ?? '',
        phone: phoneValue,
        status: data?.status ?? 'online',
        isInvisible: data?.isInvisible ?? false,
      });
    } catch (err) {
      showNotice(err?.message || t('profileModal.loadFail'), 'fail');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [showNotice, t]);

  useEffect(() => {
    if (isOpen) {
      fetchProfile();
    }
  }, [isOpen, fetchProfile]);

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      const res = await api.patch('/users/me', {
        displayName: form.displayName?.trim() || undefined,
        bio: form.bio?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        status: form.status,
        isInvisible: form.isInvisible,
      });
      const updated = unwrapProfilePayload(res);
      setProfile(updated);
      showNotice(t('profileModal.saveOk'), 'success');
      if (onClose) onClose();
    } catch (err) {
      showNotice(err?.message || t('profileModal.saveFail'), 'fail');
    } finally {
      setSaving(false);
    }
  };

  const displayName = profile?.displayName || profile?.username || getUserDisplayName(authUser);
  const email = profile?.email || authUser?.email;
  const initials = getInitials(displayName || email || 'U');
  const avatarColor = getAvatarColor(displayName || email);

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showNotice(t('profileModal.imageOnly'), 'fail');
      return;
    }

    try {
      setAvatarUploading(true);
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await api.post('/users/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = res?.data || res;
      const avatarUrl = data?.avatarUrl || data?.data?.avatarUrl;

      if (!avatarUrl) {
        showNotice(t('profileModal.avatarUrlMissing'), 'fail');
        return;
      }

      setProfile((prev) => (prev ? { ...prev, avatar: avatarUrl } : prev));
      showNotice(t('profileModal.avatarOk'), 'success');
    } catch (error) {
      showNotice(error?.message || t('profileModal.avatarUploadFail'), 'fail');
    } finally {
      setAvatarUploading(false);
      event.target.value = '';
    }
  };

  if (!isOpen) return null;

  /** Portal → body: tránh bị đè bởi cột giữa ThreeFrameLayout (sibling z-[1] vẽ sau sidebar). */
  const modalTree = (
    <div
      className={`fixed inset-0 z-[99990] flex items-center justify-center p-4 ${overlayClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={t('profileModal.closeOverlayAria')}
        onClick={onClose}
      />
      <div className={`relative z-[99991] flex flex-col ${shellClass}`}>
        <div className={headerClass}>
          <div>
            <h2 id="profile-modal-title" className={`text-xl font-bold ${headingClass}`}>
              {t('profileModal.title')}
            </h2>
            <p className={`text-xs ${mutedClass}`}>{t('profileModal.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={
              isDarkMode
                ? 'flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-gray-300 transition-colors hover:bg-white/20 hover:text-white'
                : 'flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900'
            }
          >
            ✕
          </button>
        </div>

        <div className={tabsBarClass}>
          {[
            { id: 'main', label: t('profileModal.tabMain') },
            { id: 'organization', label: t('profileModal.tabOrg') },
            { id: 'account', label: t('profileModal.tabAccount') },
            { id: 'security', label: t('profileModal.tabSecurity') },
            { id: 'notifications', label: t('profileModal.tabNotifications') },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveProfileTab(tab.id)}
              className={`rounded-t-xl border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                activeProfileTab === tab.id ? tabActive : tabInactive
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={bodyScrollClass}>
          <div className="min-w-0 flex-1 space-y-5">
            {activeProfileTab === 'main' && (
              <>
                <div>
                  <label className={labelClass}>{t('profileModal.displayName')}</label>
                  <input
                    type="text"
                    value={form.displayName}
                    onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                    className={inputClass}
                    placeholder={t('profileModal.displayNamePh')}
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t('profileModal.bio')}</label>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    className={`${inputClass} min-h-[100px] resize-y`}
                    placeholder={t('profileModal.bioPh')}
                    rows={4}
                    maxLength={500}
                  />
                  <p className={`mt-1 text-right text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                    {form.bio.length}/500
                  </p>
                </div>
                <div>
                  <label className={labelClass}>{t('profileModal.phone')}</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className={inputClass}
                    placeholder={t('profileModal.phonePh')}
                  />
                </div>
              </>
            )}

            {activeProfileTab === 'organization' && (
              <>
                <div className={infoBoxClass}>
                  <p className={`mb-2 font-semibold ${headingClass}`}>{t('profileModal.orgIntroTitle')}</p>
                  <p className={mutedClass}>{t('profileModal.orgIntroBody')}</p>
                </div>
                <div>
                  <label className={labelClass}>{t('profileModal.selectOrg')}</label>
                  <select
                    className={inputClass}
                    defaultValue=""
                    style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
                  >
                    <option className={optionClass} value="" disabled>
                      {t('profileModal.selectOrgPh')}
                    </option>
                    <option className={optionClass} value="org-1">
                      {t('profileModal.orgDemoA')}
                    </option>
                    <option className={optionClass} value="org-2">
                      {t('profileModal.orgDemoB')}
                    </option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t('profileModal.orgNickname')}</label>
                  <input
                    type="text"
                    className={`${inputClass} cursor-not-allowed opacity-70`}
                    placeholder={t('profileModal.orgNicknamePh')}
                    disabled
                  />
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                    {t('profileModal.orgNicknameHint')}
                  </p>
                </div>
              </>
            )}

            {activeProfileTab === 'account' && (
              <>
                <div>
                  <label className={labelClass}>{t('settingsPage.email')}</label>
                  <input type="email" value={email || ''} readOnly className={`${inputClass} cursor-not-allowed opacity-80`} />
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                    {t('profileModal.emailReadonlyHint')}
                  </p>
                </div>
                <div>
                  <label className={labelClass}>{t('profileModal.birthDate')}</label>
                  <p className={`${inputClass} cursor-default py-2.5 opacity-90`}>
                    {formatBirthDateSafe(profile?.dateOfBirth, t('profileModal.birthNotSet'))}
                  </p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                    {t('profileModal.birthDateHint')}
                  </p>
                </div>
                <div>
                  <label className={labelClass}>{t('profileModal.phone')}</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className={inputClass}
                    placeholder={t('profileModal.phonePh')}
                  />
                </div>
                <div className={infoBoxClass}>
                  <p className={`mb-1 font-semibold ${headingClass}`}>{t('profileModal.changePasswordTitle')}</p>
                  <p className={mutedClass}>{t('profileModal.changePasswordHint')}</p>
                </div>
              </>
            )}

            {activeProfileTab === 'security' && (
              <>
                <div className={panelClass}>
                  <p className={`text-sm font-semibold ${headingClass}`}>{t('profileModal.securityPrivacyTitle')}</p>
                  <div>
                    <label className={`mb-1 block text-xs font-semibold ${subheadingClass}`}>
                      {t('profileModal.currentStatus')}
                    </label>
                    <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inputClass}>
                      <option className={optionClass} value="online">
                        {t('profileModal.statusOnline')}
                      </option>
                      <option className={optionClass} value="away">
                        {t('profileModal.statusAway')}
                      </option>
                      <option className={optionClass} value="busy">
                        {t('profileModal.statusBusy')}
                      </option>
                      <option className={optionClass} value="offline">
                        {t('profileModal.statusOffline')}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label
                      className={
                        isDarkMode
                          ? 'flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10'
                          : 'flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50'
                      }
                    >
                      <input
                        type="checkbox"
                        checked={form.isInvisible}
                        onChange={(e) => setForm((f) => ({ ...f, isInvisible: e.target.checked }))}
                        className="h-4 w-4 rounded"
                      />
                      <div>
                        <p className={`text-xs font-semibold ${subheadingClass}`}>{t('profileModal.invisibleTitle')}</p>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                          {t('profileModal.invisibleHint')}
                        </p>
                      </div>
                    </label>
                  </div>
                  <div>
                    <label className={`mb-1 block text-xs font-semibold ${subheadingClass}`}>
                      {t('profileModal.showOnlineLabel')}
                    </label>
                    <select className={inputClass}>
                      <option className={optionClass}>{t('profileModal.privacyEveryone')}</option>
                      <option className={optionClass}>{t('profileModal.privacyColleagues')}</option>
                      <option className={optionClass}>{t('profileModal.privacyNobody')}</option>
                    </select>
                  </div>
                  <div>
                    <label className={`mb-1 block text-xs font-semibold ${subheadingClass}`}>
                      {t('profileModal.whoCanDmLabel')}
                    </label>
                    <select className={inputClass}>
                      <option className={optionClass}>{t('profileModal.privacyEveryone')}</option>
                      <option className={optionClass}>{t('profileModal.privacyColleagues')}</option>
                    </select>
                  </div>
                </div>
                <div className={panelClass}>
                  <p className={`text-sm font-semibold ${headingClass}`}>{t('profileModal.twoFactorTitle')}</p>
                  <p className={`text-xs ${mutedClass}`}>{t('profileModal.twoFactorBody')}</p>
                  <GradientButton variant="success">{t('profileModal.enable2faDemo')}</GradientButton>
                </div>
              </>
            )}

            {activeProfileTab === 'notifications' && (
              <>
                <div className={panelClass}>
                  <p className={`text-sm font-semibold ${headingClass}`}>{t('settingsPage.notifSettingsTitle')}</p>
                  {[
                    { label: t('profileModal.notif1'), checked: true },
                    { label: t('profileModal.notif2'), checked: true },
                    { label: t('profileModal.notif3'), checked: true },
                    { label: t('profileModal.notif4'), checked: true },
                    { label: t('profileModal.notif5'), checked: false },
                    { label: t('profileModal.notif6'), checked: true },
                  ].map((setting, idx) => (
                    <label key={idx} className={rowHoverClass}>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`}>{setting.label}</span>
                      <input
                        type="checkbox"
                        defaultChecked={setting.checked}
                        className="h-4 w-4 rounded border-slate-400 text-cyan-600 focus:ring-cyan-500/50"
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="w-full md:w-80">
            <div className={`mb-3 text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
              {t('profileModal.previewLabel')}
            </div>
            <div className={previewCardClass}>
              <div className="flex items-center gap-4">
                <div className="group relative cursor-pointer">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white ${avatarColor}`}>
                    {profile?.avatar ? <img src={profile.avatar} alt="" className="h-full w-full rounded-full object-cover" /> : initials}
                  </div>
                  <span className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 ${avatarRing} bg-green-500`} />
                  <label className={`${avatarOverlay} whitespace-pre-line`}>
                    {avatarUploading ? t('profileModal.changeAvatarUploading') : t('profileModal.changeAvatarCta')}
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </label>
                </div>
                <div className="min-w-0">
                  <div className={`truncate font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {form.displayName || displayName || t('profileModal.previewNameFallback')}
                  </div>
                  <div className={`truncate text-xs ${mutedClass}`}>
                    {email || t('profileModal.emailPlaceholder')}
                  </div>
                </div>
              </div>
              <div className={previewBioClass}>
                {form.bio?.trim() ? form.bio : t('profileModal.previewBioPlaceholder')}
              </div>
            </div>
          </div>
        </div>

        <div className={footerClass}>
          <button type="button" className={ghostFooterBtn} onClick={onClose}>
            {t('nav.cancel')}
          </button>
          {activeProfileTab === 'organization' ? (
            <GradientButton type="button" variant="secondary" disabled>
              {t('profileModal.comingSoon')}
            </GradientButton>
          ) : (
            <GradientButton type="button" variant="primary" disabled={saving || loading} onClick={handleSaveProfile}>
              {saving ? t('profileModal.saving') : t('profileModal.saveChanges')}
            </GradientButton>
          )}
        </div>
      </div>
      <NotificationModal
        notice={notice}
        onClose={() => setNotice(null)}
        layerClassName="z-[99999]"
      />
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalTree, document.body);
}

export default ProfileModal;
