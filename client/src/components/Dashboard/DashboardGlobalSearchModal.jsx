import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import Modal from '../Shared/Modal';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import { useDebouncedValue } from '../../features/search/useDebouncedValue';
import {
  buildDashboardPageOptions,
  buildSubfilterOptions,
  fetchDashboardSearchResults,
  fetchDashboardFriendsForPicker,
  fetchDashboardOrgsForPicker,
} from '../../features/dashboardSearch';

export default function DashboardGlobalSearchModal({ isOpen, onClose, layer1Query = '' }) {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();

  const [step, setStep] = useState('page');
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [selectedSubfilterId, setSelectedSubfilterId] = useState(null);
  const [contextFriendId, setContextFriendId] = useState(null);
  const [contextOrgId, setContextOrgId] = useState(null);
  const [pickedFriendLabel, setPickedFriendLabel] = useState('');
  const [pickedOrgLabel, setPickedOrgLabel] = useState('');
  const [friendPickerRows, setFriendPickerRows] = useState([]);
  const [orgPickerRows, setOrgPickerRows] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [detailQuery, setDetailQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [truncated, setTruncated] = useState(false);

  const debouncedDetail = useDebouncedValue(detailQuery, 350);

  const textMuted = isDarkMode ? 'text-[#9ca3af]' : 'text-slate-600';
  const textHeading = isDarkMode ? 'text-white' : 'text-slate-900';
  const textSub = isDarkMode ? 'text-[#6b7280]' : 'text-slate-600';
  const modalRowBetween = isDarkMode
    ? 'flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-3 text-left transition-all hover:bg-slate-800/60'
    : 'flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-all hover:bg-slate-100';
  const modalRowStatic = isDarkMode
    ? 'flex w-full items-start justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-3 text-left'
    : 'flex w-full items-start justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-left';
  const inputClass = isDarkMode
    ? 'w-full rounded-xl border border-slate-800 bg-[#0a1322] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#6b7280] focus:border-cyan-500/50'
    : 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500';

  const pageOptions = useMemo(() => buildDashboardPageOptions(t, layer1Query), [t, layer1Query]);

  const friendsConversationOnly = Boolean(selectedPageId === 'friends' && contextFriendId);
  const subfilterOptions = useMemo(
    () =>
      selectedPageId
        ? buildSubfilterOptions(selectedPageId, t, { friendsConversationOnly })
        : [],
    [selectedPageId, t, friendsConversationOnly]
  );

  const selectedPageLabel = selectedPageId ? t(`dashboard.globalSearch.pageLabel.${selectedPageId}`) : '';
  const selectedSubLabel = useMemo(() => {
    if (!selectedPageId || !selectedSubfilterId) return '';
    return t(`dashboard.globalSearch.subfilter.${selectedPageId}.${selectedSubfilterId}`);
  }, [selectedPageId, selectedSubfilterId, t]);

  const modalTitle = useMemo(() => {
    if (step === 'page') return t('dashboard.globalSearch.titleStep1');
    if (step === 'pickFriend') return t('dashboard.globalSearch.titlePickFriend');
    if (step === 'pickOrg') return t('dashboard.globalSearch.titlePickOrg');
    if (step === 'subfilter') return t('dashboard.globalSearch.titleStep2', { page: selectedPageLabel });
    if (step === 'results') {
      const scope = pickedFriendLabel || pickedOrgLabel || '';
      if (scope) {
        return t('dashboard.globalSearch.titleStep3Scoped', {
          page: selectedPageLabel,
          scope,
          filter: selectedSubLabel,
        });
      }
      return t('dashboard.globalSearch.titleStep3', { page: selectedPageLabel, filter: selectedSubLabel });
    }
    return t('dashboard.globalSearch.titleStep1');
  }, [step, selectedPageLabel, selectedSubLabel, pickedFriendLabel, pickedOrgLabel, t]);

  const resetContext = useCallback(() => {
    setContextFriendId(null);
    setContextOrgId(null);
    setPickedFriendLabel('');
    setPickedOrgLabel('');
    setFriendPickerRows([]);
    setOrgPickerRows([]);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setStep('page');
    setSelectedPageId(null);
    setSelectedSubfilterId(null);
    resetContext();
    setDetailQuery('');
    setResults([]);
    setError(null);
    setTruncated(false);
    setPickerLoading(false);
  }, [isOpen, resetContext]);

  useEffect(() => {
    if (!isOpen || step !== 'pickFriend') return;
    let cancelled = false;
    setPickerLoading(true);
    fetchDashboardFriendsForPicker(t)
      .then((rows) => {
        if (!cancelled) setFriendPickerRows(rows);
      })
      .catch(() => {
        if (!cancelled) setFriendPickerRows([]);
      })
      .finally(() => {
        if (!cancelled) setPickerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, step, t]);

  useEffect(() => {
    if (!isOpen || step !== 'pickOrg') return;
    let cancelled = false;
    setPickerLoading(true);
    fetchDashboardOrgsForPicker(t)
      .then((rows) => {
        if (!cancelled) setOrgPickerRows(rows);
      })
      .catch(() => {
        if (!cancelled) setOrgPickerRows([]);
      })
      .finally(() => {
        if (!cancelled) setPickerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, step, t]);

  useEffect(() => {
    if (!isOpen || step !== 'results' || !selectedPageId || !selectedSubfilterId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDashboardSearchResults({
      pageId: selectedPageId,
      subfilterId: selectedSubfilterId,
      detailQuery: debouncedDetail,
      t,
      context: {
        ...(contextFriendId ? { friendId: contextFriendId } : {}),
        ...(contextOrgId ? { orgId: contextOrgId } : {}),
      },
    })
      .then((res) => {
        if (cancelled) return;
        setResults(res.items || []);
        setTruncated(Boolean(res.truncated));
        setError(res.error || null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || t('dashboard.globalSearch.loadError'));
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    step,
    selectedPageId,
    selectedSubfilterId,
    debouncedDetail,
    t,
    contextFriendId,
    contextOrgId,
  ]);

  const goBack = useCallback(() => {
    if (step === 'results') {
      if (selectedPageId === 'friends' && selectedSubfilterId === 'contacts') {
        setStep('pickFriend');
        setSelectedSubfilterId(null);
        setDetailQuery('');
        setResults([]);
        setError(null);
        return;
      }
      setStep('subfilter');
      setDetailQuery('');
      setResults([]);
      setError(null);
      return;
    }
    if (step === 'subfilter') {
      if (selectedPageId === 'friends' && contextFriendId) {
        setStep('pickFriend');
        setSelectedSubfilterId(null);
        setContextFriendId(null);
        setPickedFriendLabel('');
        return;
      }
      if (selectedPageId === 'chat' && contextOrgId) {
        setStep('pickOrg');
        setSelectedSubfilterId(null);
        setContextOrgId(null);
        setPickedOrgLabel('');
        return;
      }
      setStep('page');
      setSelectedPageId(null);
      setSelectedSubfilterId(null);
      resetContext();
      return;
    }
    if (step === 'pickFriend' || step === 'pickOrg') {
      setStep('page');
      setSelectedPageId(null);
      resetContext();
      return;
    }
    onClose();
  }, [
    step,
    onClose,
    selectedPageId,
    selectedSubfilterId,
    contextFriendId,
    contextOrgId,
    resetContext,
  ]);

  const onPickPage = (id) => {
    setSelectedPageId(id);
    if (id === 'friends') {
      setStep('pickFriend');
      return;
    }
    if (id === 'chat') {
      setStep('pickOrg');
      return;
    }
    setStep('subfilter');
  };

  const onPickContactsOnly = () => {
    setSelectedSubfilterId('contacts');
    setContextFriendId(null);
    setPickedFriendLabel('');
    setStep('results');
  };

  const onPickFriendRow = (row) => {
    setContextFriendId(row.id);
    setPickedFriendLabel(row.title);
    setStep('subfilter');
  };

  const onPickOrgRow = (row) => {
    setContextOrgId(row.id);
    setPickedOrgLabel(row.title);
    setStep('subfilter');
  };

  const onPickSubfilter = (subId) => {
    setSelectedSubfilterId(subId);
    setStep('results');
  };

  const showBack =
    step === 'pickFriend' || step === 'pickOrg' || step === 'subfilter' || step === 'results';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="lg">
      <div className="space-y-4">
        {showBack && (
          <button
            type="button"
            onClick={goBack}
            className={`inline-flex items-center gap-1.5 text-sm font-semibold ${isDarkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-700 hover:text-cyan-800'}`}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            {t('dashboard.globalSearch.back')}
          </button>
        )}

        {step === 'page' && (
          <>
            <p className={`text-sm ${textMuted}`}>{t('dashboard.globalSearch.hintStep1')}</p>
            <div className="grid max-h-[min(420px,55vh)] gap-2 overflow-y-auto pr-1">
              {pageOptions.length === 0 ? (
                <p className={`text-sm ${textMuted}`}>{t('dashboard.quickSearchEmpty')}</p>
              ) : (
                pageOptions.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onPickPage(row.id)}
                    className={modalRowBetween}
                  >
                    <span className={textHeading}>{row.label}</span>
                    <span className={`text-xs ${textSub}`}>{t('dashboard.openArrow')}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {step === 'pickFriend' && (
          <>
            <p className={`text-sm ${textMuted}`}>{t('dashboard.globalSearch.hintPickFriend')}</p>
            <button type="button" onClick={onPickContactsOnly} className={modalRowBetween}>
              <span className={textHeading}>{t('dashboard.globalSearch.subfilter.friends.contacts')}</span>
              <span className={`text-xs ${textSub}`}>{t('dashboard.openArrow')}</span>
            </button>
            {pickerLoading && (
              <div className={`flex items-center gap-2 text-sm ${textMuted}`}>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.loading')}
              </div>
            )}
            {!pickerLoading && friendPickerRows.length === 0 ? (
              <p className={`text-sm ${textMuted}`}>{t('dashboard.globalSearch.empty')}</p>
            ) : null}
            {!pickerLoading && friendPickerRows.length > 0 && (
              <div className="grid max-h-[min(360px,50vh)] gap-2 overflow-y-auto pr-1">
                {friendPickerRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onPickFriendRow(row)}
                    className={modalRowBetween}
                  >
                    <div className="min-w-0 text-left">
                      <div className={`truncate font-medium ${textHeading}`}>{row.title}</div>
                      {row.subtitle ? (
                        <div className={`truncate text-xs ${textSub}`}>{row.subtitle}</div>
                      ) : null}
                    </div>
                    <span className={`shrink-0 text-xs ${textSub}`}>{t('dashboard.openArrow')}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 'pickOrg' && (
          <>
            <p className={`text-sm ${textMuted}`}>{t('dashboard.globalSearch.hintPickOrg')}</p>
            {pickerLoading && (
              <div className={`flex items-center gap-2 text-sm ${textMuted}`}>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.loading')}
              </div>
            )}
            {!pickerLoading && orgPickerRows.length === 0 ? (
              <p className={`text-sm ${textMuted}`}>{t('dashboard.globalSearch.noOrgSubtitle')}</p>
            ) : null}
            {!pickerLoading && orgPickerRows.length > 0 && (
              <div className="grid max-h-[min(360px,50vh)] gap-2 overflow-y-auto pr-1">
                {orgPickerRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onPickOrgRow(row)}
                    className={modalRowBetween}
                  >
                    <div className="min-w-0 text-left">
                      <div className={`truncate font-medium ${textHeading}`}>{row.title}</div>
                      {row.subtitle ? (
                        <div className={`truncate text-xs ${textSub}`}>{row.subtitle}</div>
                      ) : null}
                    </div>
                    <span className={`shrink-0 text-xs ${textSub}`}>{t('dashboard.openArrow')}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 'subfilter' && (
          <>
            <p className={`text-sm ${textMuted}`}>{t('dashboard.globalSearch.hintStep2')}</p>
            <div className="grid max-h-[min(420px,55vh)] gap-2 overflow-y-auto pr-1">
              {subfilterOptions.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onPickSubfilter(row.id)}
                  className={modalRowBetween}
                >
                  <span className={textHeading}>{row.label}</span>
                  <span className={`text-xs ${textSub}`}>{t('dashboard.openArrow')}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'results' && (
          <>
            <p className={`text-sm ${textMuted}`}>{t('dashboard.globalSearch.hintStep3')}</p>
            <input
              type="search"
              value={detailQuery}
              onChange={(e) => setDetailQuery(e.target.value)}
              placeholder={t('dashboard.globalSearch.detailPlaceholder')}
              className={inputClass}
              aria-label={t('dashboard.globalSearch.detailAria')}
            />
            {loading && (
              <div className={`flex items-center gap-2 text-sm ${textMuted}`}>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('dashboard.globalSearch.loading')}
              </div>
            )}
            {error && !loading && <p className="text-sm text-rose-400">{error}</p>}
            {!loading && !error && results.length === 0 && (
              <p className={`text-sm ${textMuted}`}>{t('dashboard.globalSearch.empty')}</p>
            )}
            {!loading && !error && results.length > 0 && (
              <div className="space-y-1">
                {truncated && (
                  <p className={`text-xs ${textMuted}`}>{t('dashboard.globalSearch.truncated')}</p>
                )}
                <ul className="max-h-[min(380px,50vh)] space-y-1 overflow-y-auto pr-1">
                  {results.map((item) => (
                    <li key={item.id}>
                      <div className={modalRowStatic} role="listitem">
                        <div className="min-w-0 flex-1 text-left">
                          <div className={`truncate font-medium ${textHeading}`}>{item.title}</div>
                          {item.subtitle ? (
                            <div className={`truncate text-xs ${textSub}`}>{item.subtitle}</div>
                          ) : null}
                          {item.meta ? (
                            <div className={`truncate text-[11px] uppercase ${textSub}`}>{item.meta}</div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
