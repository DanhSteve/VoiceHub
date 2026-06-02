import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import authService from '../../services/authService';
import { organizationAPI } from '../../services/api/organizationAPI';
import { unwrapOrganizationsMy } from '../../hooks/queries/fetchers';
import { GradientButton, NotificationModal } from '../../components/Shared';
import UserAvatar from '../Shared/UserAvatar';
import AvatarCropModal from './AvatarCropModal';
import ProfileChangePasswordModal from './ProfileChangePasswordModal';
import {
  getUserDisplayName,
  mergeAuthUserFromProfile,
  unwrapApiData,
} from '../../utils/helpers';
import { AVATAR_FILE_ACCEPT } from '../../utils/avatarDisplay';
import {
  birthYearOptions,
  isBirthDateComplete,
  validateBirthDateParts,
} from '../../utils/birthDateUtils';
import { useAppStrings } from '../../locales/appStrings';
import { notify } from '../../utils/appToast';

function ProfileModal({ isOpen, onClose }) {
  const { user: authUser, updateUser } = useAuth();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [form, setForm] = useState({
    displayName: '',
    bio: '',
    phone: '',
    location: '',
    email: '',
  });
  const [activeProfileTab, setActiveProfileTab] = useState('main');
  const [notice, setNotice] = useState(null);
  const [avatarCrop, setAvatarCrop] = useState(null);
  const [avatarCacheBust, setAvatarCacheBust] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [orgNickname, setOrgNickname] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthError, setBirthError] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const yearOptions = useMemo(() => birthYearOptions(), []);

  const inputClass =
    'w-full rounded-xl border px-4 py-3 outline-none transition-all ' +
    (isDarkMode
      ? 'border-white/20 bg-white/5 text-white placeholder:text-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40'
      : 'border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/25');

  const labelClass = isDarkMode
    ? 'mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400'
    : 'mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600';

  const infoBoxClass = isDarkMode
    ? 'rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300'
    : 'rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 shadow-sm';

  const headingClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const mutedClass = isDarkMode ? 'text-gray-400' : 'text-slate-600';

  const optionClass = isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800';

  const overlayClass = isDarkMode ? 'bg-black/70' : 'bg-slate-900/45';
  const shellClass = isDarkMode
    ? 'relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/95 shadow-2xl'
    : 'relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl';
  const tabsBarClass = isDarkMode
    ? 'flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2'
    : 'flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-2';
  const tabActive = isDarkMode ? 'border-cyan-400 text-white' : 'border-cyan-600 text-slate-900';
  const tabInactive = isDarkMode
    ? 'border-transparent text-gray-400 hover:text-white'
    : 'border-transparent text-slate-500 hover:text-slate-800';
  const bodyScrollClass = isDarkMode
    ? 'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4 md:flex-row'
    : 'flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4 md:flex-row';
  const actionsBarClass = isDarkMode
    ? 'mt-6 flex shrink-0 justify-end gap-3 border-t border-white/10 pt-4'
    : 'mt-6 flex shrink-0 justify-end gap-3 border-t border-slate-200 pt-4';
  const ghostFooterBtn = isDarkMode
    ? 'rounded-xl px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white'
    : 'rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900';
  const previewCardClass = isDarkMode
    ? 'space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-purple-900/80 via-slate-900 to-black p-5 shadow-lg'
    : 'space-y-4 rounded-2xl border border-slate-200 bg-gradient-to-b from-cyan-50 via-white to-slate-50 p-5 shadow-md';
  const previewBioClass = isDarkMode
    ? 'h-24 overflow-hidden rounded-xl border border-white/5 bg-black/40 p-3 text-xs text-gray-300'
    : 'h-24 overflow-hidden rounded-xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-600';
  const avatarOverlay = isDarkMode
    ? 'absolute inset-0 flex cursor-pointer flex-col items-center justify-center rounded-full bg-black/50 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100'
    : 'absolute inset-0 flex cursor-pointer flex-col items-center justify-center rounded-full bg-slate-900/45 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100';

  const applyBirthPartsFromProfile = useCallback((dob) => {
    if (!dob) {
      setBirthDay('');
      setBirthMonth('');
      setBirthYear('');
      return;
    }
    const isoMatch = String(dob).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      setBirthYear(isoMatch[1]);
      setBirthMonth(String(Number(isoMatch[2])));
      setBirthDay(String(Number(isoMatch[3])));
      return;
    }
    const dt = new Date(dob);
    if (Number.isNaN(dt.getTime())) {
      setBirthDay('');
      setBirthMonth('');
      setBirthYear('');
      return;
    }
    setBirthYear(String(dt.getFullYear()));
    setBirthMonth(String(dt.getMonth() + 1));
    setBirthDay(String(dt.getDate()));
  }, []);

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

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/users/me');
      const data = unwrapApiData(res);
      setProfile(data);
      const phoneValue =
        data?.phone ??
        data?.profile?.phone ??
        data?.phoneNumber ??
        data?.profile?.phoneNumber ??
        data?.mobile ??
        data?.profile?.mobile ??
        '';
      const bioRaw = data?.bio ?? '';
      const bioPlain =
        typeof bioRaw === 'string' && bioRaw.startsWith('enc:v1:') ? '' : bioRaw;
      setForm({
        displayName: data?.displayName ?? data?.username ?? '',
        bio: bioPlain,
        phone: phoneValue,
        location: data?.location ?? '',
        email: data?.email ?? authUser?.email ?? '',
      });
      applyBirthPartsFromProfile(data?.dateOfBirth);
      setBirthError('');
    } catch (err) {
      showNotice(err?.message || t('profileModal.loadFail'), 'fail');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [applyBirthPartsFromProfile, showNotice, t]);

  const fetchOrganizations = useCallback(async () => {
    try {
      setOrgsLoading(true);
      const res = await organizationAPI.getOrganizations();
      const rows = unwrapOrganizationsMy(res);
      setOrganizations(rows);
      setSelectedOrgId((prev) => {
        if (prev && rows.some((o) => String(o._id || o.id) === String(prev))) return prev;
        if (!rows.length) return '';
        return String(rows[0]._id || rows[0].id || '');
      });
    } catch (err) {
      showNotice(err?.message || t('profileModal.orgLoadFail'), 'fail');
      setOrganizations([]);
    } finally {
      setOrgsLoading(false);
    }
  }, [showNotice, t]);

  useEffect(() => {
    if (isOpen) {
      fetchProfile();
      setShowPasswordModal(false);
      setActiveProfileTab('main');
    } else {
      setNotice(null);
      setOrganizations([]);
      setSelectedOrgId('');
      setOrgNickname('');
    }
  }, [isOpen, fetchProfile]);

  useEffect(() => {
    if (!isOpen || activeProfileTab !== 'organization') return;
    fetchOrganizations();
  }, [isOpen, activeProfileTab, fetchOrganizations]);

  useEffect(() => {
    if (!selectedOrgId || !profile) return;
    const map = profile.orgNicknames && typeof profile.orgNicknames === 'object' ? profile.orgNicknames : {};
    setOrgNickname(String(map[selectedOrgId] || '').trim());
  }, [selectedOrgId, profile]);

  useEffect(() => {
    if (isOpen) return undefined;
    return () => {
      setAvatarCrop((prev) => {
        if (prev?.src) URL.revokeObjectURL(prev.src);
        return null;
      });
    };
  }, [isOpen]);

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      const payload = {};

      if (activeProfileTab === 'main') {
        Object.assign(payload, {
          displayName: form.displayName?.trim() || undefined,
          bio: form.bio?.trim() ?? undefined,
          phone: form.phone?.trim() || undefined,
          location: form.location?.trim() || undefined,
        });
      } else if (activeProfileTab === 'account') {
        const nextEmail = String(form.email || '').trim().toLowerCase();
        const currentEmail = String(email || '').trim().toLowerCase();
        Object.assign(payload, {
          phone: form.phone?.trim() || undefined,
        });
        if (!isBirthDateComplete({ birthDay, birthMonth, birthYear })) {
          setBirthError(t('register.errBirthRequired'));
          return;
        }
        const dob = validateBirthDateParts({ birthDay, birthMonth, birthYear });
        if (!dob.ok) {
          const codeMap = {
            required: 'register.errBirthRequired',
            invalid: 'register.errBirthInvalid',
            future: 'register.errBirthFuture',
            tooYoung: 'register.errBirthTooYoung',
          };
          setBirthError(t(codeMap[dob.code] || 'register.errBirthInvalid'));
          return;
        }
        setBirthError('');
        payload.dateOfBirth = dob.iso;
        if (nextEmail && nextEmail !== currentEmail) {
          await authService.requestEmailChange(nextEmail);
          notify.success(t('settingsPage.toastEmailChangeRequested'));
        }
      } else if (activeProfileTab === 'organization') {
        if (!selectedOrgId) {
          showNotice(t('profileModal.orgSelectRequired'), 'fail');
          return;
        }
        payload.orgNicknames = {
          [selectedOrgId]: orgNickname.trim(),
        };
      } else {
        return;
      }

      const res = await api.patch('/users/me', payload);
      const updated = unwrapApiData(res);
      setProfile(updated);
      if (authUser) {
        updateUser(mergeAuthUserFromProfile(authUser, updated));
      }
      if (!(activeProfileTab === 'account' && String(form.email || '').trim().toLowerCase() !== String(email || '').trim().toLowerCase())) {
        notify.success(t('profileModal.saveOk'));
      }
      if (activeProfileTab !== 'organization') {
        onClose?.();
      }
    } catch (err) {
      showNotice(err?.message || t('profileModal.saveFail'), 'fail');
    } finally {
      setSaving(false);
    }
  };

  const selectedOrg = organizations.find(
    (o) => String(o._id || o.id) === String(selectedOrgId)
  );

  const orgRoleLabel = (role) => {
    const key = `profileModal.orgRole.${role}`;
    const translated = t(key);
    return translated !== key ? translated : role;
  };

  const displayName = profile?.displayName || profile?.username || getUserDisplayName(authUser);
  const email = profile?.email || authUser?.email;

  const handleAvatarFilePick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const okMime = file.type.startsWith('image/') || file.type === 'application/octet-stream';
    const okExt = /\.(jpe?g|png|gif|webp|bmp|svg|ico|avif|heic|heif)$/i.test(file.name || '');
    if (!okMime && !okExt) {
      showNotice(t('profileModal.imageOnly'), 'fail');
      return;
    }

    if (avatarCrop?.src) URL.revokeObjectURL(avatarCrop.src);
    setAvatarCrop({ src: URL.createObjectURL(file) });
  };

  const handleAvatarCropClose = () => {
    if (avatarCrop?.src) URL.revokeObjectURL(avatarCrop.src);
    setAvatarCrop(null);
  };

  const handleAvatarCropApply = async (blob) => {
    try {
      setAvatarUploading(true);
      const formData = new FormData();
      formData.append('avatar', blob, 'avatar.jpg');

      const res = await api.post('/users/avatar', formData);
      const updated = unwrapApiData(res);
      const avatarUrl = updated?.avatar || updated?.avatarUrl;

      if (!avatarUrl) {
        showNotice(t('profileModal.avatarUrlMissing'), 'fail');
        return;
      }

      const bust = Date.now();
      setAvatarCacheBust(bust);
      const merged = { ...updated, avatar: avatarUrl };
      setProfile((prev) => (prev ? { ...prev, ...merged } : merged));
      if (authUser) {
        updateUser(mergeAuthUserFromProfile(authUser, merged, { avatarBust: bust }));
      }
      notify.success(t('profileModal.avatarOk'));
      handleAvatarCropClose();
    } catch (error) {
      showNotice(error?.message || t('profileModal.avatarUploadFail'), 'fail');
    } finally {
      setAvatarUploading(false);
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
      <div className={`relative z-[99991] ${shellClass}`}>
        <div className={tabsBarClass}>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {[
              { id: 'main', label: t('profileModal.tabMain') },
              { id: 'organization', label: t('profileModal.tabOrg') },
              { id: 'account', label: t('profileModal.tabAccount') },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveProfileTab(tab.id)}
                className={`shrink-0 rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                  activeProfileTab === tab.id ? tabActive : tabInactive
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('profileModal.closeOverlayAria')}
            className={
              isDarkMode
                ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-gray-300 transition-colors hover:bg-white/20 hover:text-white'
                : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900'
            }
          >
            ✕
          </button>
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
                <div>
                  <label className={labelClass}>{t('profileModal.location')}</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    className={inputClass}
                    placeholder={t('profileModal.locationPh')}
                    maxLength={200}
                  />
                </div>
              </>
            )}

            {activeProfileTab === 'organization' && (
              <>
                <p className={`text-sm ${mutedClass}`}>{t('profileModal.orgIntroBody')}</p>
                {orgsLoading ? (
                  <p className={`text-sm ${mutedClass}`}>{t('profileModal.loading')}</p>
                ) : organizations.length === 0 ? (
                  <p className={`text-sm ${mutedClass}`}>{t('profileModal.orgEmpty')}</p>
                ) : (
                  <>
                    <div>
                      <label className={labelClass}>{t('profileModal.selectOrg')}</label>
                      <select
                        className={inputClass}
                        value={selectedOrgId}
                        onChange={(e) => setSelectedOrgId(e.target.value)}
                        style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
                      >
                        {organizations.map((org) => {
                          const oid = String(org._id || org.id || '');
                          return (
                            <option key={oid} className={optionClass} value={oid}>
                              {org.name || org.slug || oid}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    {selectedOrg ? (
                      <div className={infoBoxClass}>
                        <p className={`text-xs ${mutedClass}`}>
                          {t('profileModal.orgRoleLabel')}:{' '}
                          <span className={headingClass}>{orgRoleLabel(selectedOrg.myRole || 'member')}</span>
                        </p>
                      </div>
                    ) : null}
                    <div>
                      <label className={labelClass}>{t('profileModal.orgNickname')}</label>
                      <input
                        type="text"
                        className={inputClass}
                        value={orgNickname}
                        onChange={(e) => setOrgNickname(e.target.value)}
                        placeholder={t('profileModal.orgNicknamePh')}
                        maxLength={100}
                      />
                      <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                        {t('profileModal.orgNicknameHint')}
                      </p>
                    </div>
                  </>
                )}
              </>
            )}

            {activeProfileTab === 'account' && (
              <>
                <div>
                  <label className={labelClass}>{t('settingsPage.email')}</label>
                  <input
                    type="email"
                    value={form.email || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className={inputClass}
                  />
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                    {t('settingsPage.emailChangeHint')}
                  </p>
                </div>
                <div>
                  <label className={labelClass}>{t('profileModal.birthDate')}</label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className={`mb-1 block text-xs font-medium ${mutedClass}`}>
                        {t('register.birthDay')}
                      </span>
                      <select
                        value={birthDay}
                        onChange={(e) => {
                          setBirthDay(e.target.value);
                          setBirthError('');
                        }}
                        className={inputClass}
                      >
                        <option value="">{t('register.birthDayPlaceholder')}</option>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} className={optionClass} value={String(d)}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className={`mb-1 block text-xs font-medium ${mutedClass}`}>
                        {t('register.birthMonth')}
                      </span>
                      <select
                        value={birthMonth}
                        onChange={(e) => {
                          setBirthMonth(e.target.value);
                          setBirthError('');
                        }}
                        className={inputClass}
                      >
                        <option value="">{t('register.birthMonthPlaceholder')}</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} className={optionClass} value={String(m)}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className={`mb-1 block text-xs font-medium ${mutedClass}`}>
                        {t('register.birthYear')}
                      </span>
                      <select
                        value={birthYear}
                        onChange={(e) => {
                          setBirthYear(e.target.value);
                          setBirthError('');
                        }}
                        className={inputClass}
                      >
                        <option value="">{t('register.birthYearPlaceholder')}</option>
                        {yearOptions.map((y) => (
                          <option key={y} className={optionClass} value={String(y)}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {birthError ? (
                    <p className="mt-1 text-xs text-red-500">{birthError}</p>
                  ) : (
                    <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                      {t('profileModal.birthDateEditableHint')}
                    </p>
                  )}
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
                <div>
                  <GradientButton type="button" variant="secondary" onClick={() => setShowPasswordModal(true)}>
                    {t('profileModal.changePasswordBtn')}
                  </GradientButton>
                </div>
              </>
            )}

            <div className={actionsBarClass}>
              <button type="button" className={ghostFooterBtn} onClick={onClose} disabled={saving}>
                {t('nav.cancel')}
              </button>
              <GradientButton type="button" variant="primary" disabled={saving || loading} onClick={handleSaveProfile}>
                {saving ? t('profileModal.saving') : t('profileModal.saveChanges')}
              </GradientButton>
            </div>
          </div>

          <div className="w-full md:w-72 lg:w-80">
            <div className={`mb-3 text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
              {t('profileModal.previewLabel')}
            </div>
            <div className={previewCardClass}>
              <div className="flex items-center gap-4">
                <div className="group relative cursor-pointer">
                  <UserAvatar
                    avatar={profile?.avatar}
                    name={displayName || email || 'U'}
                    size="profile"
                    showOnline
                    status={
                      profile?.status === 'online' && !profile?.isInvisible ? 'online' : 'offline'
                    }
                    cacheBust={avatarCacheBust}
                  />
                  <label className={`${avatarOverlay} whitespace-pre-line`}>
                    {avatarUploading ? t('profileModal.changeAvatarUploading') : t('profileModal.changeAvatarCta')}
                    <input
                      type="file"
                      accept={AVATAR_FILE_ACCEPT}
                      className="hidden"
                      onChange={handleAvatarFilePick}
                    />
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
                {activeProfileTab === 'organization' && orgNickname.trim()
                  ? orgNickname.trim()
                  : form.bio?.trim()
                    ? form.bio
                    : t('profileModal.previewBioPlaceholder')}
              </div>
              {activeProfileTab === 'organization' && selectedOrg ? (
                <p className={`text-center text-xs ${mutedClass}`}>
                  {selectedOrg.name}
                  {orgNickname.trim() ? ` · ${orgNickname.trim()}` : ''}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <ProfileChangePasswordModal
          isOpen={showPasswordModal}
          isDarkMode={isDarkMode}
          email={email}
          onBack={() => setShowPasswordModal(false)}
        />
      </div>
      <NotificationModal
        notice={notice}
        onClose={() => setNotice(null)}
        layerClassName="z-[99999]"
      />
      <AvatarCropModal
        isOpen={Boolean(avatarCrop?.src)}
        imageSrc={avatarCrop?.src}
        isDarkMode={isDarkMode}
        title={t('profileModal.cropAvatarTitle')}
        resetLabel={t('profileModal.cropAvatarReset')}
        cancelLabel={t('profileModal.cropAvatarCancel')}
        applyLabel={t('profileModal.cropAvatarApply')}
        hint={t('profileModal.cropAvatarHint')}
        applying={avatarUploading}
        onClose={handleAvatarCropClose}
        onApply={handleAvatarCropApply}
      />
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalTree, document.body);
}

export default ProfileModal;
